-- ============================================================
-- Drift-detection introspection RPCs for the smoke test
-- ============================================================
-- The smoke test (scripts/smoke-test.ts) talks to the DB via PostgREST, which
-- only exposes the `public` schema — so it cannot read `cron.job` or `vault`
-- directly to detect infrastructure drift (e.g. the email worker cron being
-- unscheduled, or the Vault service-role secret missing — the exact failure
-- that silently broke password-reset emails).
--
-- These two read-only, service-role-only helpers expose the MINIMUM needed:
--   * get_cron_job_status — does a pg_cron job exist and is it active.
--   * vault_secret_exists — does a Vault secret with a given name exist
--     (boolean only — NEVER returns the secret value).
-- Both are SECURITY DEFINER with a locked search_path, EXECUTE revoked from
-- PUBLIC and granted to service_role only (smoke test uses the service-role
-- key for DB introspection). No business data touched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cron_job_status(p_jobname text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
BEGIN
  SELECT j.jobname, j.schedule, j.active
    INTO r
    FROM cron.job j
   WHERE j.jobname = p_jobname
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('exists', false);
  END IF;
  RETURN jsonb_build_object('exists', true, 'active', r.active, 'schedule', r.schedule);
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  -- pg_cron not installed in this environment
  RETURN jsonb_build_object('exists', false, 'error', 'cron schema unavailable');
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_secret_exists(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- vault.secrets.name is plaintext; the encrypted `secret` column is never read.
  RETURN EXISTS (SELECT 1 FROM vault.secrets WHERE name = p_name);
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_job_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cron_job_status(text) TO service_role;

REVOKE ALL ON FUNCTION public.vault_secret_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_secret_exists(text) TO service_role;

COMMENT ON FUNCTION public.get_cron_job_status(text) IS
  'Read-only: returns {exists, active, schedule} for a pg_cron job. service_role only. Used by scripts/smoke-test.ts to detect cron drift.';
COMMENT ON FUNCTION public.vault_secret_exists(text) IS
  'Read-only: returns whether a Vault secret with the given name exists (never the value). service_role only. Used by scripts/smoke-test.ts.';
