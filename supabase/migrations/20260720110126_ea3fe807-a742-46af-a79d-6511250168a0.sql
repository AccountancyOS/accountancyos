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
      'Refusing to schedule process-email-queue: % pending emails are already due and would all send at once (threshold %). Review the backlog and cancel stale rows or raise the bound before scheduling.',
      v_due, v_threshold;
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