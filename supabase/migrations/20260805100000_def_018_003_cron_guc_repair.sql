-- =====================================================================================
-- DEF-018 + DEF-003 — repair the six cron jobs that resolve their target from a GUC that
-- does not exist, and schedule the email-queue drain that was never scheduled.
-- =====================================================================================
-- DEF-018 (P1). Six of twelve production cron jobs have failed on EVERY run since they
-- were created. Each resolves its URL and credential from
-- `current_setting('app.settings.supabase_url')` / `('app.settings.service_role_key')`.
-- Neither GUC exists in this database, so `current_setting` raises
-- `42704 unrecognized configuration parameter` before `net.http_post` is ever reached:
--
--     hmrc-ct-poll-worker         * * * * *     10,080 runs / 7d   100% failed
--     sync-gmail-emails           */2 * * * *    5,040 runs / 7d   100% failed
--     sync-outlook-emails         */2 * * * *    5,040 runs / 7d   100% failed
--     hmrc-ct-delete-worker       */5 * * * *    2,016 runs / 7d   100% failed
--     process-automation-events   */5 * * * *    2,016 runs / 7d   100% failed
--     workflow-tick               */5 * * * *    2,016 runs / 7d   100% failed
--
-- Confirmed still true on LIVE 2026-08-05 via mcp_list_cron_jobs: all six commands still
-- contain `app.settings.`, and the six healthy jobs do not. 26,208 consecutive failures
-- surfaced nowhere in the product.
--
-- Functional consequence: the automation engine does not run (process-automation-events and
-- workflow-tick are its only drivers), inbound mailbox sync does not run, and HMRC CT
-- submission state is never reconciled back.
--
-- DEF-003 (P1) IS THE SAME DEFECT. `process-email-queue` is declared `critical` in
-- infra/supabase-manifest.json and is absent from cron.job. A migration to schedule it was
-- authored on 2026-07-20 (20260720120000_schedule_process_email_queue.sql) but never applied
-- — and it uses the identical broken GUC pattern, so applying it as written would have
-- produced a SEVENTH job failing 100% of the time. It is therefore superseded here rather
-- than re-applied. Fixing DEF-018 without DEF-003 would leave outbound mail undrained; the
-- two are one repair.
--
-- WHY NOT SET THE GUCs INSTEAD. `ALTER DATABASE ... SET app.settings.service_role_key` would
-- fix all six without editing them, but it writes a service-role key into pg_db_role_setting
-- in plaintext, readable by any role that can query it, and the literal would have to live in
-- this file and therefore in git. Rejected on both counts.
--
-- CHOSEN PATTERN — the one the healthy jobs already prove works, hardened:
--   * project URL hard-coded. It is not a secret; it ships in the frontend bundle and four
--     live jobs already hard-code it.
--   * credential read from `vault.decrypted_secrets`. Encrypted at rest, never in git. The
--     name `email_queue_service_role_key` is the established one in this database (used by
--     truelayer-sync-scheduled, jobid 19, and by four prior migrations). The name is
--     historical and now misleading — it is the general service-role key — but renaming a
--     vault secret is not a migration-safe operation and is left as follow-up.
--
-- WHY THIS MIGRATION HARD-FAILS ON A MISSING SECRET. The prior art here
-- (20260630221547, 20260630220537) only RAISE WARNING when the vault secret is absent, then
-- schedules the job anyway — which yields a job that runs, reports success to
-- cron.job_run_details, and 401s forever. That is precisely the Gate 6 failure mode this
-- programme exists to eliminate: a green signal over a dead path. This migration RAISES
-- EXCEPTION instead, so a missing or empty credential aborts the release rather than
-- producing six confidently-broken jobs.
--
-- WHAT THIS MIGRATION CANNOT PROVE. pg_cron records a run as succeeded when the SQL command
-- completes. `net.http_post` is asynchronous: it enqueues a request and returns a request_id
-- immediately. A job can therefore be "succeeded" in cron.job_run_details while every HTTP
-- call it makes returns 401 or 500. Neither cron.job_run_details nor net._http_response is in
-- the public schema, so the verifying party cannot read either through the database
-- connector. Delivery verification is delegated explicitly in the receipt and MUST be run by
-- the executor — see apply_instructions. This migration proves the definitions changed; it
-- does not prove mail moved.
--
-- SCOPE. Seven cron jobs. No table, column, function, policy, trigger or grant is altered.
-- The six existing jobs keep their names and schedules exactly; only the command body
-- changes. Reserved-TLD queue rows are cancelled (see §3 below).
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  PRECONDITIONS — abort before changing anything if the ground is not as expected.
-- -------------------------------------------------------------------------------------

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
  -- 1a. pg_cron must be installed. Without it every statement below is a no-op that would
  --     otherwise report success.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'DEF-018 precondition failed: extension pg_cron is not installed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'DEF-018 precondition failed: extension pg_net is not installed; net.http_post would not exist.';
  END IF;

  -- 1b. The credential must exist AND be non-empty. A NULL here would concatenate into
  --     'Bearer ' || NULL = NULL and produce a header-less request that fails silently.
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

  -- 1c. All six jobs must still exist. If one has been renamed or removed out-of-band, the
  --     repair set is wrong and a silent partial fix is worse than none.
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

  -- 1d. Reproduce the failure first (verification standard, Gate 6). At least one of the six
  --     must still carry the broken GUC pattern. If none does, the defect is already fixed
  --     and this migration must not silently re-write six job bodies for no reason.
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

-- -------------------------------------------------------------------------------------
-- §2  DEF-003 BACKLOG PREFLIGHT — do not start draining into a mass send.
-- -------------------------------------------------------------------------------------
-- Scheduling the drain makes every pending, due row send at once. Two independent bounds:
--   * volume — refuse above 200 due rows (inherited from the superseded 20260720120000);
--   * staleness — report due rows older than 48h so the operator sees what is about to go
--     out. This is a NOTICE, not a refusal: at authoring time the four due rows are all
--     internal or reserved-TLD addresses (verified 2026-08-05), and two of those are
--     cancelled by §3 below. A refusal here would block the release on test data.

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

-- -------------------------------------------------------------------------------------
-- §3  Cancel queued mail addressed to reserved TLDs before the drain starts.
-- -------------------------------------------------------------------------------------
-- RFC 2606 / RFC 6761 reserve .test, .example, .invalid and .localhost — mail to them can
-- never be delivered. Draining them produces hard bounces, and hard bounces damage sender
-- reputation on Postmark for every real client afterwards. Two such rows exist today, both
-- created by the 2026-07-27 E2E probe run.
--
-- This is a standing hygiene rule rather than a one-off cleanup: the same guard protects
-- every future drain from probe residue. It is a status transition, not a delete — the rows
-- remain auditable with an explicit reason.

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

-- -------------------------------------------------------------------------------------
-- §4  Re-issue the six broken jobs. Same name, same schedule; command body repaired.
-- -------------------------------------------------------------------------------------
-- cron.schedule() upserts on jobname, so no unschedule is needed and the jobid is preserved.

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

-- -------------------------------------------------------------------------------------
-- §5  DEF-003 — schedule the email-queue drain that has never existed.
-- -------------------------------------------------------------------------------------
-- Every-minute cadence is safe: the worker's atomic claim (20260706144830) means overlapping
-- runs cannot double-send. Supersedes 20260720120000_schedule_process_email_queue.sql, which
-- was never applied and carried the DEF-018 defect.

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
-- §6  POST-ASSERTIONS — self-verifying. A partial apply aborts the whole transaction.
-- -------------------------------------------------------------------------------------

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

    -- The defect itself must be gone.
    IF v_cmd LIKE '%app.settings.%' THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % still references app.settings.*', v_name;
    END IF;

    -- The repair must actually be present, not merely the defect absent.
    IF v_cmd NOT LIKE '%vault.decrypted_secrets%' THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % does not read its credential from vault.', v_name;
    END IF;

    IF v_cmd NOT LIKE '%moxpdejnucjjcplleefn.supabase.co%' THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % does not target the project URL.', v_name;
    END IF;

    IF NOT v_active THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % is not active.', v_name;
    END IF;

    -- Schedules must be preserved exactly — a repair that quietly changes cadence is a
    -- different change than the one declared.
    IF v_sched IS DISTINCT FROM (v_expected_sched ->> v_name) THEN
      RAISE EXCEPTION 'DEF-018 post-assert failed: job % has schedule "%", expected "%".',
        v_name, v_sched, (v_expected_sched ->> v_name);
    END IF;
  END LOOP;

  -- The four already-healthy jobs must be untouched and still present.
  IF (SELECT count(*) FROM cron.job) < 13 THEN
    RAISE EXCEPTION 'DEF-018 post-assert failed: expected at least 13 cron jobs (12 pre-existing + process-email-queue), found %.',
      (SELECT count(*) FROM cron.job);
  END IF;

  -- No reserved-TLD row may remain pending.
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
