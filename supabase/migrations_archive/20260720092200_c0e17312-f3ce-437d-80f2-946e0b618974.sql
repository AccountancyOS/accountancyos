-- Schedule process-email-queue
DO $$
DECLARE
  v_due int;
  v_threshold constant int := 200;
BEGIN
  SELECT count(*) INTO v_due FROM public.email_queue WHERE status = 'pending' AND scheduled_at <= now();
  IF v_due > v_threshold THEN
    RAISE EXCEPTION 'Refusing to schedule process-email-queue: % pending emails due (threshold %).', v_due, v_threshold;
  END IF;
  RAISE NOTICE 'process-email-queue backlog preflight OK: % due row(s).', v_due;
END $$;

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

-- Rebuild safe view with token_expires_at (drop required: column order change)
DROP VIEW IF EXISTS public.connected_mailboxes_safe;
CREATE VIEW public.connected_mailboxes_safe AS
  SELECT
    id, organization_id, user_id, provider, email_address,
    status, last_sync_at, mailbox_type,
    sync_enabled, error_message, token_expires_at, created_at, updated_at
  FROM public.connected_mailboxes;
GRANT SELECT ON public.connected_mailboxes_safe TO authenticated;
GRANT SELECT ON public.connected_mailboxes_safe TO service_role;