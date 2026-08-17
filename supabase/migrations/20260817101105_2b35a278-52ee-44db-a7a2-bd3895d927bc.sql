-- =====================================================================================
-- DEF-003 (P1, REOPENED) — reinstate the `process-email-queue` cron drain.
-- Applied verbatim from supabase/migrations/20260817100000_def_003_reinstate_email_queue_drain.sql
-- sha256 1f81096c513fc0bce7a2ffa379012dcd086b5c915d10d9270ed631d754411d3a
-- =====================================================================================

BEGIN;

DO $mig$
DECLARE
  v_secret text;
  v_guc    int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'DEF-003 precondition failed: extension pg_cron is not installed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'DEF-003 precondition failed: extension pg_net is not installed; net.http_post would not exist.';
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION
      'DEF-003 precondition failed: vault.decrypted_secrets is not readable (%). The job cannot be given a credential.',
      SQLERRM;
  END;

  IF v_secret IS NULL OR length(btrim(v_secret)) = 0 THEN
    RAISE EXCEPTION
      'DEF-003 precondition failed: vault secret "email_queue_service_role_key" is missing or empty. Scheduling now would produce a job that runs every minute and 401s every minute. Set the secret, then re-apply.';
  END IF;

  SELECT count(*) INTO v_guc
  FROM cron.job
  WHERE command LIKE '%app.settings.%';

  IF v_guc > 0 THEN
    RAISE EXCEPTION
      'DEF-003 precondition failed: % cron job(s) reference app.settings.* — DEF-018 has regressed. Repair that first; this migration is not scoped to it.',
      v_guc;
  END IF;
END $mig$;

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
  v_cmd    text;
  v_active boolean;
  v_sched  text;
  v_total  int;
BEGIN
  SELECT command, active, schedule
    INTO v_cmd, v_active, v_sched
  FROM cron.job
  WHERE jobname = 'process-email-queue';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: process-email-queue is absent after scheduling.';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: process-email-queue exists but is not active.';
  END IF;

  IF v_sched IS DISTINCT FROM '* * * * *' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: process-email-queue schedule is "%", expected "* * * * *".', v_sched;
  END IF;

  IF v_cmd NOT LIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: job does not read its credential from vault.';
  END IF;

  IF v_cmd NOT LIKE '%functions/v1/process-email-queue%' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: job does not target the process-email-queue function.';
  END IF;

  IF v_cmd LIKE '%app.settings.%' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: job reintroduces the DEF-018 GUC pattern.';
  END IF;

  SELECT count(*) INTO v_total FROM cron.job;
  IF v_total < 13 THEN
    RAISE EXCEPTION
      'DEF-003 post-assert failed: expected at least 13 cron jobs (12 observed 2026-08-17 + process-email-queue), found %.',
      v_total;
  END IF;

  RAISE NOTICE 'DEF-003 post-assertions passed: process-email-queue active on "* * * * *", vault-credentialled, % jobs total.', v_total;
END $mig$;

COMMIT;