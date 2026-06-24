## What's happening

The Q-26-0010 quote email to Testing Ltd is still sitting in `public.email_queue` as `pending` (created 08:33, now 10:12 — 1h 39min unsent). The quote itself was marked "sent" by `lifecycle_send_quote` the moment it was enqueued, which is why the UI says sent, but the email itself was never delivered.

## Root cause

This is the exact cron-gate bug we diagnosed earlier but never actually applied a fix for. The `process-email-queue` pg_cron job runs every 5 seconds but only wakes the worker when **pgmq** queues have messages:

```sql
WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
  OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
  THEN net.http_post(...)
```

Quote / engagement / chaser emails live in `public.email_queue`, not pgmq, so the gate is permanently false for them. The worker drains `email_queue` correctly when invoked (that's why "Process Queue" works instantly), but cron never invokes it.

The 15-minute scheduling change shipped last turn is unrelated and didn't cause this — that row was created before the migration, with `scheduled_at = created_at`. Even brand-new rows with the 15-min delay would have the same problem after their delay elapsed.

## Fix

One migration: re-create the `process-email-queue` cron job with the gate extended to also wake the worker when `public.email_queue` has a row that's due.

```sql
SELECT cron.unschedule('process-email-queue');

SELECT cron.schedule(
  'process-email-queue',
  '5 seconds',
  $$
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
      THEN NULL
    WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
      OR EXISTS (
        SELECT 1 FROM public.email_queue
        WHERE status IN ('pending','queued')
          AND scheduled_at <= now()
        LIMIT 1
      )
      THEN net.http_post(
        url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/process-email-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Lovable-Context', 'cron',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END;
  $$
);
```

Effect after deploy: the stuck Testing Ltd email drains on the next 5-second tick, and all future app emails (quotes, engagement letters, chasers) send on time without needing the "Process Queue" button. The new 15-minute default delay continues to work — once `scheduled_at <= now()` the gate fires.

No edge function, frontend, or app code changes. The `email_send_state.retry_after_until` short-circuit is preserved so 429 back-off still works.

## Out of scope

- Changing UI quote status semantics (the quote is correctly "sent" — what's broken is delivery, not status).
- Cron tick interval, auth-email path, or per-org throttling.
