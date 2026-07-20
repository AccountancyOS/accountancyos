## Diagnosis

You're right — the migration file `20260720120000_schedule_process_email_queue.sql` contains exactly the right `cron.schedule` statement. But it **was never applied to the database**:

- `supabase_migrations.schema_migrations` shows the latest applied version is `20260720104504`. Nothing at `20260720120000` or later exists in that table.
- `cron.job` confirms this: there is no `process-email-queue` row, only the older jobs (`sync-gmail-emails`, `sync-outlook-emails`, `hmrc-ct-poll-worker`, `chaser-tick-every-15min`, `process-automation-events`, `workflow-tick`, etc.).

So the migration exists in git but was never approved/run against this project. That is the entire reason scheduled emails don't send on their own.

Answers to your two questions:

1. **Why they didn't send at the scheduled time.** Nothing is polling. The worker only runs when a human clicks Process Queue.
2. **Can Process Queue send before the scheduled time?** Yes — already. The button calls `flush_email_queue_now(org_id)`, which unconditionally rewrites `scheduled_at = now()` for every `pending`/`queued` row in your org whose `scheduled_at` is in the future, then invokes the worker. No code change is needed for that behaviour.

## Fix

Apply the existing pending migration `20260720120000_schedule_process_email_queue.sql`. No new SQL is being authored — the file already contains:

1. A preflight `DO $$ ... $$` that counts due `email_queue` rows and raises if the backlog exceeds 200 (guard against a mass-send burst).
2. `cron.unschedule('process-email-queue')` inside a swallow-errors block for idempotency.
3. `SELECT cron.schedule('process-email-queue', '* * * * *', ...)` posting to `/functions/v1/process-email-queue` with the service-role bearer.

Same pattern as the already-working `sync-gmail-emails` and `process-automation-events` jobs, so the `current_setting('app.settings.*')` values are known to resolve at cron execution time on this project.

## Technical details

**Action:** re-issue migration `20260720120000_schedule_process_email_queue.sql` through the migration tool so it lands in `schema_migrations` and the cron row is created.

**No code changes.** `process-email-queue/index.ts`, `flush_email_queue_now`, `send_queued_email_now`, and the Emails page Process Queue button are all correct and already handle:
- service-role JWT caller (line 144 of the worker)
- `status='pending' AND scheduled_at <= now()` selection
- atomic row claim via `claim_email_queue_row` (safe against overlapping cron ticks)
- rate-limit cooldown via `email_send_state.retry_after_until`
- manual flush-and-send from the UI

**Verification after the migration runs:**

1. `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'process-email-queue';` → one row, `* * * * *`, active.
2. Insert a fresh outbound email, wait ~90 seconds without touching the UI → `email_queue.status` moves `pending → sent`, and a matching `email_send_log` row with `status='sent'` appears.
3. Insert another, click Process Queue before the 15-minute mark → sends within a few seconds, confirming manual early-send still works.

**If the preflight raises** (>200 due rows queued from the days it wasn't draining): inspect with
```sql
SELECT organization_id, count(*), min(scheduled_at)
FROM public.email_queue WHERE status='pending' AND scheduled_at <= now() GROUP BY 1;
```
then either cancel stale rows or raise the threshold and re-apply. Current known backlog is small (1 row for Blue Tick at authoring time), so it should apply cleanly.