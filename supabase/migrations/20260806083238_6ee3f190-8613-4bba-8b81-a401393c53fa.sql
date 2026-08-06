BEGIN;

DO $mig$
DECLARE
  v_secret   text;
  v_missing  text[];
  v_expected text[] := ARRAY[
    'hmrc-ct-poll-worker',
    'hmrc-ct-delete-worker',
    'sync-gmail-emails',
    'sync-outlook-emails',
    'process-automation-events',
    'workflow-tick'
  ];
  v_name     text;
  v_broken   int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'DEF-018 precondition failed: extension pg_cron is not installed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'DEF-018 precondition failed: extension pg_net is not installed; net.http_post would not exist.';
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION
      'DEF-018 precondition failed: vault.decrypted_secrets is not readable (%). The cron jobs cannot be given a credential.',
      SQLERRM;
  END;

  IF v_secret IS NULL OR length(btrim(v_secret)) = 0 THEN
    RAISE EXCEPTION
      'DEF-018 precondition failed: vault secret "email_queue_service_role_key" is missing or empty. Scheduling these jobs now would produce seven jobs that run and 401 forever — which is the defect being repaired. Set the secret, then re-apply.';
  END IF;

  v_missing := ARRAY[]::text[];
  FOREACH v_name IN ARRAY v_expected LOOP
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_name) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'DEF-018 precondition failed: expected cron job(s) not present: %. The live estate does not match the audited one.',
      array_to_string(v_missing, ', ');
  END IF;

  SELECT count(*) INTO v_broken
  FROM cron.job
  WHERE jobname = ANY(v_expected)
    AND command LIKE '%app.settings.%';

  IF v_broken = 0 THEN
    RAISE EXCEPTION
      'DEF-018 precondition failed: none of the six jobs references app.settings.* — the defect is not present. Refusing to rewrite job bodies that are not broken.';
  END IF;

  RAISE NOTICE 'DEF-018 preconditions OK: % of 6 jobs still carry the broken GUC pattern.', v_broken;
END $mig$;

DO $mig$
DECLARE
  v_due       int;
  v_stale     int;
  v_oldest    timestamptz;
  v_threshold constant int := 200;
BEGIN
  SELECT count(*), min(scheduled_at)
    INTO v_due, v_oldest
  FROM public.email_queue
  WHERE status = 'pending' AND scheduled_at <= now();

  IF v_due > v_threshold THEN
    RAISE EXCEPTION
      'DEF-003 preflight failed: % pending emails are already due and would all send the moment the drain is scheduled (threshold %, oldest %). Triage the backlog before scheduling.',
      v_due, v_threshold, v_oldest;
  END IF;

  SELECT count(*) INTO v_stale
  FROM public.email_queue
  WHERE status = 'pending'
    AND scheduled_at <= now()
    AND scheduled_at < now() - interval '48 hours';

  RAISE NOTICE 'DEF-003 preflight: % due row(s), % of them older than 48h, oldest %.',
    v_due, v_stale, v_oldest;
END $mig$;

UPDATE public.email_queue
   SET status        = 'cancelled',
       error_message = 'Cancelled by DEF-003 repair: reserved TLD (RFC 2606/6761) is undeliverable; draining would hard-bounce and damage sender reputation.',
       updated_at    = now()
 WHERE status = 'pending'
   AND (
        to_email ILIKE '%.test'
     OR to_email ILIKE '%.example'
     OR to_email ILIKE '%.invalid'
     OR to_email ILIKE '%.localhost'
   );

SELECT cron.schedule(
  'hmrc-ct-poll-worker',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/hmrc-ct-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'hmrc-ct-delete-worker',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/hmrc-ct-delete',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'sync-gmail-emails',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'sync-outlook-emails',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/outlook-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'process-automation-events',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/process-automation-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'workflow-tick',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/workflow-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

DO $mig$
DECLARE
  v_all      text[] := ARRAY[
    'hmrc-ct-poll-worker',
    'hmrc-ct-delete-worker',
    'sync-gmail-emails',
    'sync-outlook-emails',
    'process-automation-events',
    'workflow-tick',
    'process-email-queue'
  ];
  v_name     text;
  v_cmd      text;
  v_active   boolean;
  v_sched    text;
  v_residual int;
  v_expected_sched jsonb := jsonb_build_object(
    'hmrc-ct-poll-worker',        '* * * * *',
    'hmrc-ct-delete-worker',      '*/5 * * * *',
    'sync-gmail-emails',          '*/2 * * * *',
    'sync-outlook-emails',        '*/2 * * * *',
    'process-automation-events',  '*/5 * * * *',
    'workflow-tick',              '*/5 * * * *',
    'process-email-queue',        '* * * * *'
  );
BEGIN
  FOREACH v_name IN ARRAY v_all LOOP
    SELECT command, active, schedule
      INTO v_cmd, v_active, v_sched
    FROM cron.job WHERE jobname = v_name;

    IF v_cmd IS NULL THEN
      RAISE EXCEPTION 'DEF-018/003 post-assert failed: job % is absent after scheduling.', v_name;
    END IF;

    IF v_cmd LIKE '%app.settings.%' THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % still references app.settings.*', v_name;
    END IF;

    IF v_cmd NOT LIKE '%vault.decrypted_secrets%' THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % does not read its credential from vault.', v_name;
    END IF;

    IF v_cmd NOT LIKE '%moxpdejnucjjcplleefn.supabase.co%' THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % does not target the project URL.', v_name;
    END IF;

    IF NOT v_active THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % is not active.', v_name;
    END IF;

    IF v_sched IS DISTINCT FROM (v_expected_sched ->> v_name) THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % has schedule "%", expected "%".',
        v_name, v_sched, (v_expected_sched ->> v_name);
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM cron.job) < 13 THEN
    RAISE EXCEPTION 'DEF-018 post-assert failed: expected at least 13 cron jobs (12 pre-existing + process-email-queue), found %.',
      (SELECT count(*) FROM cron.job);
  END IF;

  SELECT count(*) INTO v_residual
  FROM public.email_queue
  WHERE status = 'pending'
    AND (to_email ILIKE '%.test' OR to_email ILIKE '%.example'
      OR to_email ILIKE '%.invalid' OR to_email ILIKE '%.localhost');

  IF v_residual > 0 THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: % reserved-TLD row(s) still pending.', v_residual;
  END IF;

  RAISE NOTICE 'DEF-018 + DEF-003 post-assertions passed: 7 jobs repaired/scheduled, no GUC references remain.';
END $mig$;

COMMIT;