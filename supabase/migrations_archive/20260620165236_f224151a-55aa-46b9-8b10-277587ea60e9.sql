-- ============================================================
-- Durable email-queue worker cron (branded auth emails incl. password resets)
-- ============================================================
-- Incident: client password-reset emails silently stopped. Root cause: the
-- only thing that DRAINS the `auth_emails` / `transactional_emails` pgmq queues
-- is the `process-email-queue` edge function, and the pg_cron job that invokes
-- it was never committed as static SQL — it lived only in the comment block of
-- 20260617194841_email_infra.sql ("applied dynamically by setup_email_infra").
-- When that out-of-band step didn't run / drifted, the auth-email hook kept
-- enqueuing (email_send_log row = 'pending') but nothing ever sent, while
-- Supabase Auth treated the hook as successful. No error surfaced.
--
-- This migration makes the worker schedule durable and committed:
--   * Replaces the STALE job 'process-email-queue' from 20251201225855, which
--     POSTed to a non-existent `/functions/v1/send-email` with a hardcoded anon
--     key (it could never have worked).
--   * Schedules a 5-second job that POSTs to the real `process-email-queue`
--     function with the service-role key read from Vault at run time (the secret
--     is NEVER embedded in SQL). The function itself enforces the
--     service_role-role claim and handles rate-limit cooldown + empty queues, so
--     an unconditional call is safe.
--
-- PREREQUISITE this migration cannot satisfy on its own:
--   The Vault secret `email_queue_service_role_key` must contain the project's
--   service_role key. It is created by setup_email_infra (or set manually in the
--   dashboard) and must never be committed. If it is absent, the cron still runs
--   but the function returns 401 (no worse than today). This migration RAISEs a
--   WARNING on apply if the secret is missing so the gap is visible.
--
-- Safe / idempotent: cron.schedule upserts by job name; re-running replaces.
-- No business data touched.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Surface the missing-secret state loudly (non-fatal) so a drifted environment
-- is obvious at apply time rather than silently scheduling a 401-ing worker.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
  ) THEN
    RAISE WARNING 'Vault secret "email_queue_service_role_key" is missing; email worker cron is scheduled but will receive 401 until the secret is set (run setup_email_infra, or add it via Dashboard > Project Settings > Vault).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not verify Vault secret email_queue_service_role_key (%); ensure it is configured for the email worker cron.', SQLERRM;
END $$;

-- Remove the stale/broken job (same name, wrong target) before (re)scheduling.
DO $$
BEGIN
  PERFORM cron.unschedule('process-email-queue');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

-- Schedule the worker every 5 seconds. The Vault read is evaluated on each run,
-- so this starts working automatically once the secret exists.
SELECT cron.schedule(
  'process-email-queue',
  '5 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
