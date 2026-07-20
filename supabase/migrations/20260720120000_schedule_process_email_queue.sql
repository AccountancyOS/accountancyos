-- ============================================================
-- Schedule process-email-queue (outbound mail was never being drained)
-- ============================================================
-- Root cause (verified live 2026-07-20): cron.job contains only sync-gmail-emails and
-- sync-outlook-emails. There is NO scheduled job for process-email-queue, so the email_queue table
-- was only ever drained when a human clicked "Process Queue". email_send_log is empty and queued
-- rows sit at status='pending' forever. This schedules the worker every minute, using the same
-- net.http_post + app.settings.* pattern as the automation crons (20260717110000) and chaser crons
-- (20260706211705). The worker's atomic claim (Fix 10, 20260706144830) makes an every-minute
-- cadence safe — overlapping runs cannot double-send.
--
-- BACKLOG SAFETY (the reason this is gated): scheduling the worker immediately drains EVERY pending,
-- due row across ALL organizations. If outbound mail has been accumulating for weeks (which is what
-- happens when the worker was manual), real clients would receive a burst of stale email the moment
-- the cron starts. This is the same trap handled for the automation event backlog (20260717100000).
-- The preflight below RAISES if the due backlog is large, forcing a human to review before mass
-- send. For a small/normal queue it proceeds untouched. (Blue Tick had exactly 1 due row at
-- authoring time.) If it raises, inspect and decide (send / cancel stale rows / raise the bound),
-- e.g.:
--   SELECT organization_id, count(*), min(scheduled_at)
--   FROM public.email_queue WHERE status='pending' AND scheduled_at <= now() GROUP BY 1;
-- then either cancel the stale rows or re-run with the threshold raised.
-- ============================================================

DO $$
DECLARE
  v_due int;
  v_threshold constant int := 200;
BEGIN
  SELECT count(*) INTO v_due
  FROM public.email_queue
  WHERE status = 'pending'
    AND scheduled_at <= now();

  IF v_due > v_threshold THEN
    RAISE EXCEPTION
      'Refusing to schedule process-email-queue: % pending emails are already due and would all send at once (threshold %). Review the backlog (see this migration''s header) and cancel stale rows or raise the bound before scheduling.',
      v_due, v_threshold;
  END IF;

  RAISE NOTICE 'process-email-queue backlog preflight OK: % due row(s).', v_due;
END $$;

-- Idempotent: drop any existing job of this name first (incl. one the Lovable dashboard may have
-- created out-of-git) so re-applying does not double-schedule.
DO $$ BEGIN PERFORM cron.unschedule('process-email-queue'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
