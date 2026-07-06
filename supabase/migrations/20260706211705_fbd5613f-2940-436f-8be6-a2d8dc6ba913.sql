-- ============================================================
-- FUN-2 / Audit Fix: schedule the chaser automation (chasers never fired)
-- ============================================================
-- chaser-trigger-scan (creates due chaser runs) and chaser-tick (sends them) were never
-- scheduled — only process-email-queue + gmail/outlook sync + truelayer-sync had cron jobs. So
-- configured chasers never ran. This schedules the two-phase chaser system, matching the
-- cadence documented in the functions (scan every 6h, tick every 15m), using the same
-- net.http_post + service-role bearer pattern as the existing sync crons.
--
-- Idempotent: unschedule any existing job of the same name first (so re-applying, or a job the
-- Lovable dashboard may have created out-of-git, does not double-schedule -> double chasers).
-- The functions now require the service-role bearer (FUN-2 gating), and chaser sends are
-- idempotency-keyed, so a double-fire cannot duplicate a client email.
--
-- NOTE (activation): applying this STARTS client-facing chaser automation for any org that has
-- configured chaser policies. Apply when you are ready for chasers to go live. The two
-- COMPETING generic automation engines (workflow-tick, process-automation-events) are
-- deliberately NOT scheduled here — one must be chosen first (see audit Duplicate-Engine table).
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('chaser-trigger-scan');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('chaser-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Create due chaser runs, every 6 hours.
SELECT cron.schedule(
  'chaser-trigger-scan',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/chaser-trigger-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Send due chaser messages, every 15 minutes.
SELECT cron.schedule(
  'chaser-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/chaser-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
