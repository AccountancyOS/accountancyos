-- =====================================================================================
-- DEF-003 (P1, REOPENED) — reinstate the `process-email-queue` cron drain.
-- =====================================================================================
-- THE OBSERVATION. On 2026-08-17 a direct read of `cron.job` on production
-- (moxpdejnucjjcplleefn, via the Lovable database connector `catalog_cron`) returned
-- exactly TWELVE active jobs, and `process-email-queue` was not among them:
--
--     chaser-tick-every-15min      chaser-trigger-scan-every-6h   dormant-lead-scan-daily
--     hmrc-ct-delete-worker        hmrc-ct-poll-worker            invoice-overdue-scan-daily
--     process-automation-events    sync-gmail-emails              sync-outlook-emails
--     truelayer-sync-hourly        truelayer-sync-scheduled       workflow-tick
--
-- Nothing enqueued into `public.email_queue` is drained. The queue currently has zero
-- `pending` rows, so the failure is LATENT rather than visible — which is precisely the
-- Gate 6 pattern this programme exists to eliminate. The next enqueue sits forever and
-- the product reports nothing.
--
-- WHY THIS IS A REGRESSION, NOT AN UNAPPLIED MIGRATION. `20260806083238` (the executor's
-- re-authored copy of `20260805100000`) both schedules this job AND post-asserts
-- `(SELECT count(*) FROM cron.job) >= 13` inside its own transaction. It cannot have
-- committed without the job existing. Independent corroboration that it did commit: the
-- live command text of `hmrc-ct-poll-worker` is byte-identical to the text that migration
-- writes, including its `vault.decrypted_secrets` lookup. Therefore the job was present on
-- 2026-08-06 and was removed between then and 2026-08-17.
--
-- No migration in this repository unschedules it after 2026-08-06 — `rg 'unschedule'` over
-- `supabase/migrations/` returns nothing dated later. The removal happened out of band,
-- outside Git, the same class of production mutation as DEF-031. This is the FOURTH
-- recorded disappearance of this specific job (`20260620165236`, `20260624101545`, and the
-- absence repaired by `20260805100000` precede it), so it is treated here as recurring
-- infrastructure drift and not as a one-off oversight.
--
-- SCOPE. This migration schedules one cron job and asserts the result. It changes no
-- function, table, constraint, policy or grant. It does not touch the other twelve jobs —
-- DEF-018's GUC repair is verified still in effect (no live job command references
-- `app.settings.`) and must not be disturbed.
--
-- DETECTION (shipped alongside, not in this file). `scripts/smoke-test.ts::checkCronJobs`
-- already fails the run when a `critical` job in `infra/supabase-manifest.json` is missing,
-- and `process-email-queue` is already marked critical there. The detector was correct and
-- simply had not been run. The accompanying commit reconciles the rest of that manifest
-- with the live job names, which had drifted far enough that most of its entries were
-- checking for jobs that do not exist under those names.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  PRECONDITIONS — refuse to schedule a job that would run and fail forever.
-- -------------------------------------------------------------------------------------

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

  -- The credential must exist BEFORE scheduling. A job that runs every minute and 401s
  -- every minute is a worse outcome than no job at all: it manufactures the appearance of
  -- a working drain. This is the same guard 20260805100000 used, for the same reason.
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

  -- DEF-018 must still be in effect. If any job has reacquired the GUC pattern then the
  -- estate has regressed further than this migration is scoped to repair, and adding a
  -- thirteenth job on top of that would bury the signal.
  SELECT count(*) INTO v_guc
  FROM cron.job
  WHERE command LIKE '%app.settings.%';

  IF v_guc > 0 THEN
    RAISE EXCEPTION
      'DEF-003 precondition failed: % cron job(s) reference app.settings.* — DEF-018 has regressed. Repair that first; this migration is not scoped to it.',
      v_guc;
  END IF;
END $mig$;

-- -------------------------------------------------------------------------------------
-- §2  SCHEDULE — cron.schedule() upserts on jobname, so this is idempotent and re-applying
--     preserves the jobid. No unschedule is required or wanted.
-- -------------------------------------------------------------------------------------
-- Every-minute cadence is safe: the worker's atomic claim (20260706144830) means
-- overlapping runs cannot double-send a queued message.

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

-- -------------------------------------------------------------------------------------
-- §3  POST-ASSERTIONS — self-verifying. A partial apply aborts the whole transaction.
-- -------------------------------------------------------------------------------------

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

  -- Assert the repair is PRESENT, not merely that the defect is absent.
  IF v_cmd NOT LIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: job does not read its credential from vault.';
  END IF;

  IF v_cmd NOT LIKE '%functions/v1/process-email-queue%' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: job does not target the process-email-queue function.';
  END IF;

  IF v_cmd LIKE '%app.settings.%' THEN
    RAISE EXCEPTION 'DEF-003 post-assert failed: job reintroduces the DEF-018 GUC pattern.';
  END IF;

  -- The twelve observed jobs must be intact, plus this one.
  SELECT count(*) INTO v_total FROM cron.job;
  IF v_total < 13 THEN
    RAISE EXCEPTION
      'DEF-003 post-assert failed: expected at least 13 cron jobs (12 observed 2026-08-17 + process-email-queue), found %.',
      v_total;
  END IF;

  RAISE NOTICE 'DEF-003 post-assertions passed: process-email-queue active on "* * * * *", vault-credentialled, % jobs total.', v_total;
END $mig$;

COMMIT;
