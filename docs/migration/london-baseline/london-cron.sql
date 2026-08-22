--
-- AccountancyOS — London cron bootstrap.
--
-- Apply AFTER london-baseline.sql and london-storage.sql, and AFTER the two Vault secrets
-- below exist. Every job is authored fresh. NOTHING here is copied from the legacy estate.
--
-- ============================ WHY IT IS RE-AUTHORED ============================
-- The legacy cron estate was materially broken, and copying it would carry the breakage:
--   * FOUR of thirteen jobs returned 401 on EVERY run (measured 2026-08-17:
--     844 HTTP calls, 814 succeeded, 29 unauthorized). The chaser engine did not run and
--     bank feeds did not sync, and nothing surfaced it — pg_cron marks a run "succeeded"
--     when the SQL completes even if the HTTP call is rejected.
--   * FIVE jobs embedded a literal anon JWT in plaintext in `cron.job.command`.
--   * FIVE jobs existed in no migration at all, so a rebuild from git would have lost them.
--   * One job read a Vault secret (`CRON_SECRET`) that did not exist.
--
-- ============================ THE CANONICAL PATTERN ============================
-- Established by reading every target function: ELEVEN of the twelve gate on
--   `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
-- and reject anything else with 401. Exactly one — `truelayer-sync-scheduled` — instead
-- gates on an `x-cron-secret` header (index.ts:173-180, the first statement in the handler).
-- Those are the only two mechanisms, and both read from Vault here. No literal token
-- appears in any command.
--
-- ============================ SECRET NAMES ============================
-- `cron_service_role_key` replaces the legacy `email_queue_service_role_key`, which was
-- misleading — it held the general service-role key, not an email-specific one, while being
-- read by eight unrelated jobs. Renaming is safe here because London starts clean.
-- `cron_shared_secret` is the value `truelayer-sync-scheduled` expects in its
-- `x-cron-secret` header; it MUST equal that function's `CRON_SECRET` env var. Note the Vault
-- and the Edge Function environment are DIFFERENT stores — conflating them is precisely why
-- the legacy `truelayer-sync-hourly` job sent a null header and 401'd on every run.
--
-- ============================ ⚠ ONE CONSOLIDATION TO CONFIRM ============================
-- The legacy estate ran TWO jobs against the SAME function `truelayer-sync-scheduled`:
--   `truelayer-sync-scheduled` (*/30) with a bearer, and `truelayer-sync-hourly` (7 * * * *)
--   with an x-cron-secret. BOTH returned 401, so neither was ever working and there is no
--   evidence of which was intended.
-- This file schedules ONE, at */30, with the mechanism the function actually checks.
-- If the hourly cadence was the intended one, change the schedule below. Confirm before apply.
--
-- ============================ BEFORE APPLYING ============================
-- Replace `__LONDON_PROJECT_URL__` with the project URL — but ONLY inside the 12
-- `$cron$ ... $cron$` job bodies.
--
-- ⚠ DO NOT do a global find/replace. The token also appears twice outside the job bodies: in
-- this comment, and in the §3 post-assertion that DETECTS an unsubstituted placeholder. A global
-- replace rewrites that guard so it tests for the real project URL — which every job command
-- legitimately contains — and it then fires unconditionally, aborting the whole migration with
-- "still contains the placeholder URL". That happened on the first attempt at applying this file.
--
-- The post-assertions refuse to commit while any placeholder remains inside a job body.
--

BEGIN;

-- ---------------------------------------------------------------------------------------
-- §1  PRECONDITIONS — refuse rather than create jobs that would fail forever.
-- ---------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_secret text;
  v_tl     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'cron bootstrap failed: extension pg_cron is not installed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'cron bootstrap failed: extension pg_net is not installed.';
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
     WHERE name = 'cron_service_role_key' LIMIT 1;
    SELECT decrypted_secret INTO v_tl FROM vault.decrypted_secrets
     WHERE name = 'cron_shared_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'cron bootstrap failed: vault.decrypted_secrets unreadable (%).', SQLERRM;
  END;

  IF v_secret IS NULL OR length(btrim(v_secret)) = 0 THEN
    RAISE EXCEPTION 'cron bootstrap failed: vault secret "cron_service_role_key" is missing. Eleven jobs would run and 401 every run, which is the legacy defect this replaces.';
  END IF;
  IF v_tl IS NULL OR length(btrim(v_tl)) = 0 THEN
    RAISE EXCEPTION 'cron bootstrap failed: vault secret "cron_shared_secret" is missing. truelayer-sync-scheduled would send a null x-cron-secret and 401 every run — the exact legacy defect.';
  END IF;
END $mig$;

-- ---------------------------------------------------------------------------------------
-- §2  JOBS (12) — cron.schedule upserts on jobname, so this is idempotent.
-- ---------------------------------------------------------------------------------------

-- process-email-queue -> process-email-queue  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- hmrc-ct-poll-worker -> hmrc-ct-poll  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'hmrc-ct-poll-worker',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/hmrc-ct-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- sync-gmail-emails -> gmail-sync  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'sync-gmail-emails',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- sync-outlook-emails -> outlook-sync  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'sync-outlook-emails',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/outlook-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- hmrc-ct-delete-worker -> hmrc-ct-delete  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'hmrc-ct-delete-worker',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/hmrc-ct-delete',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- process-automation-events -> process-automation-events  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'process-automation-events',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/process-automation-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- workflow-tick -> workflow-tick  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'workflow-tick',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/workflow-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- chaser-tick-every-15min -> chaser-tick  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'chaser-tick-every-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/chaser-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- truelayer-sync-scheduled -> truelayer-sync-scheduled  -- gates on x-cron-secret == CRON_SECRET env var (index.ts:173-180), NOT a bearer
SELECT cron.schedule(
  'truelayer-sync-scheduled',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/truelayer-sync-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_shared_secret' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- chaser-trigger-scan-every-6h -> chaser-trigger-scan  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'chaser-trigger-scan-every-6h',
  '0 */6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/chaser-trigger-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- dormant-lead-scan-daily -> dormant-lead-scan  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'dormant-lead-scan-daily',
  '0 2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/dormant-lead-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- invoice-overdue-scan-daily -> invoice-overdue-scan  -- gates on Authorization: Bearer == SUPABASE_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'invoice-overdue-scan-daily',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://__LONDON_PROJECT_URL__/functions/v1/invoice-overdue-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'cron_service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- ---------------------------------------------------------------------------------------
-- §3  POST-ASSERTIONS — self-verifying; a partial apply aborts the transaction.
-- ---------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_expected text[] := ARRAY['process-email-queue', 'hmrc-ct-poll-worker', 'sync-gmail-emails', 'sync-outlook-emails', 'hmrc-ct-delete-worker', 'process-automation-events', 'workflow-tick', 'chaser-tick-every-15min', 'truelayer-sync-scheduled', 'chaser-trigger-scan-every-6h', 'dormant-lead-scan-daily', 'invoice-overdue-scan-daily'];
  v_name text;
  v_cmd  text;
  v_n    int;
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    SELECT command INTO v_cmd FROM cron.job WHERE jobname = v_name;
    IF v_cmd IS NULL THEN
      RAISE EXCEPTION 'cron bootstrap failed: job % is absent after scheduling.', v_name;
    END IF;
    IF v_cmd LIKE '%__LONDON_PROJECT_URL__%' THEN
      RAISE EXCEPTION 'cron bootstrap failed: job % still contains the placeholder URL. Substitute the project URL before applying.', v_name;
    END IF;
    IF v_cmd NOT LIKE '%vault.decrypted_secrets%' THEN
      RAISE EXCEPTION 'cron bootstrap failed: job % does not read its credential from Vault.', v_name;
    END IF;
    IF v_cmd ~ 'eyJ[A-Za-z0-9_-]{20,}' THEN
      RAISE EXCEPTION 'cron bootstrap failed: job % embeds a literal JWT. No credential may appear in cron.job.command.', v_name;
    END IF;
    IF v_cmd LIKE '%app.settings.%' THEN
      RAISE EXCEPTION 'cron bootstrap failed: job % uses the app.settings GUC pattern (legacy DEF-018).', v_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM cron.job;
  IF v_n < 12 THEN
    RAISE EXCEPTION 'cron bootstrap failed: expected at least % jobs, found %.', 12, v_n;
  END IF;

  RAISE NOTICE 'cron bootstrap: % jobs scheduled, all vault-credentialled, no literals.', v_n;
END $mig$;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- VERIFICATION AFTER APPLY — a green pg_cron run is NOT evidence.
-- pg_cron marks a run succeeded when the SQL completes, even if net.http_post returns 401.
-- That is how four legacy jobs failed unnoticed for weeks. Prove delivery instead:
--   SELECT status_code, count(*) FROM net._http_response
--    WHERE created > now() - interval '20 minutes' GROUP BY 1;
-- Expect 2xx only. Any 401 means a credential mismatch — check the Vault secret against the
-- Edge Function environment variable of the same purpose.
-- ---------------------------------------------------------------------------------------
