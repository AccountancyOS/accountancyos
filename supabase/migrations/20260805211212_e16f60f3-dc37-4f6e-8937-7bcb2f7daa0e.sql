-- =====================================================================================
-- DEF-019 (foundation) — make scheduled-job health and HTTP delivery observable.
-- =====================================================================================
-- WHY THIS EXISTS. The DEF-018 release declares post-apply checks that read
-- `cron.job_run_details` and `net._http_response`. The executor reported on 2026-08-05 that
-- BOTH are permission-denied to its psql role, and neither is in `public`, so the database
-- connector cannot reach them either. The consequence is not a missing nicety: **the
-- evidence gate the owner mandated could never pass**, because every delivery check would
-- error and be recorded as a failure. A gate that cannot pass is worth no more than no gate.
--
-- The same inaccessibility is why DEF-018 went unseen for weeks. 26,208 consecutive cron
-- failures surfaced nowhere, and nobody could have looked even if they had thought to: the
-- table holding the evidence is unreadable by every party in this toolchain. DEF-019 records
-- that no alerting layer exists; this migration is its foundation — you cannot alert on what
-- you cannot query.
--
-- PATTERN. Identical to the existing `mcp_list_cron_jobs` / `mcp_list_functions` wrappers
-- (20260722181057): a SECURITY DEFINER function in `public` that exposes a read-only,
-- deliberately narrowed projection of a catalog the caller cannot reach directly.
--
-- SECURITY. All three are SECURITY DEFINER with a pinned `search_path` (DEF-005), and all
-- three REVOKE from PUBLIC and anon and GRANT only to authenticated and service_role
-- (DEF-015 — a SECURITY DEFINER function left anon-executable is the exact defect that
-- release closed). None of them can write. Specifically:
--
--   * `mcp_http_delivery_health` returns status codes and counts ONLY. It never returns
--     `net._http_response.content` or `.headers`, which carry response bodies and
--     Authorization echoes and would leak far more than delivery health.
--   * Free-text error fields are passed through `redact_secrets()`, which strips anything
--     shaped like a JWT. A failing request can otherwise echo its own bearer token into
--     `error_msg`, and this function is readable by every authenticated staff user.
--   * `mcp_vault_secret_present` returns a BOOLEAN. It never returns, and cannot be made to
--     return, a secret value. It exists because the executor cannot read
--     `vault.decrypted_secrets` at all, so it could not perform the one pre-check the
--     DEF-018 release depends on: that `email_queue_service_role_key` is present and
--     non-empty before the cron jobs are pointed at it.
--
-- WHAT THIS STILL CANNOT TELL YOU. `mcp_vault_secret_present` proves a secret EXISTS and is
-- non-empty. It cannot prove the value is a CURRENT, VALID service-role key — a rotated or
-- truncated key is present, non-empty, and 401s on every call. Only
-- `mcp_http_delivery_health` showing 2xx responses proves that, which is precisely why both
-- checks are in the DEF-018 receipt and why neither is sufficient alone.
--
-- SCOPE. Three new read-only functions. No existing object is altered.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  Preconditions
-- -------------------------------------------------------------------------------------

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'DEF-019 precondition failed: pg_cron is not installed; cron.job_run_details would not exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'DEF-019 precondition failed: pg_net is not installed; the delivery view would be meaningless.';
  END IF;
END $mig$;

-- -------------------------------------------------------------------------------------
-- §2  Secret redaction
-- -------------------------------------------------------------------------------------
-- Applied to every free-text field these functions expose. A failed net.http_post can echo
-- the request's own Authorization header into its error text, and these functions are
-- readable by every authenticated user.

CREATE OR REPLACE FUNCTION public.redact_secrets(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_text IS NULL THEN NULL
    ELSE regexp_replace(
           regexp_replace(p_text, 'eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*', '[REDACTED-JWT]', 'g'),
           '(?i)(bearer|apikey|api[-_]?key|password|secret)[=: ]+\S+', '\1 [REDACTED]', 'g')
  END
$$;

REVOKE ALL ON FUNCTION public.redact_secrets(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redact_secrets(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redact_secrets(text) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- §3  Scheduled-job health
-- -------------------------------------------------------------------------------------
-- One row per cron job, whether or not it has run in the window, so a job that is scheduled
-- but never firing is visible as runs = 0 rather than simply absent.

CREATE OR REPLACE FUNCTION public.mcp_cron_job_health(p_window_minutes integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.jobname), '[]'::jsonb)
  FROM (
    SELECT
      j.jobname,
      j.schedule,
      j.active,
      count(d.runid)                                                    AS runs,
      count(*) FILTER (WHERE d.status = 'succeeded')                    AS succeeded,
      count(*) FILTER (WHERE d.status IS NOT NULL
                         AND d.status <> 'succeeded')                   AS failed,
      max(d.start_time)                                                 AS last_run_at,
      (ARRAY_AGG(d.status ORDER BY d.start_time DESC)
         FILTER (WHERE d.status IS NOT NULL))[1]                        AS last_status,
      public.redact_secrets(
        (ARRAY_AGG(d.return_message ORDER BY d.start_time DESC)
           FILTER (WHERE d.return_message IS NOT NULL))[1]
      )                                                                 AS last_message,
      -- The DEF-018 signature. Surfaced explicitly so a regression is unmistakable
      -- rather than something to be inferred from an error string.
      count(*) FILTER (
        WHERE d.return_message ILIKE '%unrecognized configuration parameter%'
      )                                                                 AS unrecognized_parameter_failures
    FROM cron.job j
    LEFT JOIN cron.job_run_details d
      ON d.jobid = j.jobid
     AND d.start_time > now() - make_interval(mins => greatest(p_window_minutes, 1))
    GROUP BY j.jobname, j.schedule, j.active
  ) t;
$$;

REVOKE ALL ON FUNCTION public.mcp_cron_job_health(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mcp_cron_job_health(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mcp_cron_job_health(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.mcp_cron_job_health(integer) IS
  'Read-only cron health projection. cron.job_run_details is unreadable by the executor role and by the database connector, which is why DEF-018 (26,208 silent failures) was undetectable. DEF-019.';

-- -------------------------------------------------------------------------------------
-- §4  HTTP delivery health
-- -------------------------------------------------------------------------------------
-- The distinction this exists to make: pg_cron records a run as succeeded when the SQL
-- COMMAND completes, but net.http_post is asynchronous — it enqueues a request and returns
-- a request id immediately. A job is therefore "succeeded" whether the call returned 200 or
-- 401. Only the response table can tell them apart.
--
-- Returns aggregate counts by status class plus a redacted sample of failures. It never
-- returns response content or headers.

CREATE OR REPLACE FUNCTION public.mcp_http_delivery_health(p_window_minutes integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- pg_net's response relation is internal and has been renamed across versions. Report the
  -- fact rather than raising, so a verifier check fails with a legible reason.
  IF to_regclass('net._http_response') IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'net._http_response is not present in this pg_net version; delivery cannot be verified from SQL.'
    );
  END IF;

  EXECUTE format($q$
    SELECT jsonb_build_object(
      'available', true,
      'window_minutes', %1$s,
      'total',        count(*),
      'succeeded_2xx',count(*) FILTER (WHERE status_code BETWEEN 200 AND 299),
      'unauthorized', count(*) FILTER (WHERE status_code IN (401, 403)),
      'client_error', count(*) FILTER (WHERE status_code BETWEEN 400 AND 499),
      'server_error', count(*) FILTER (WHERE status_code BETWEEN 500 AND 599),
      'timed_out',    count(*) FILTER (WHERE timed_out),
      'no_response',  count(*) FILTER (WHERE status_code IS NULL),
      'sample_errors', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'status_code', s.status_code,
                 'created', s.created,
                 'error', public.redact_secrets(s.error_msg)))
        FROM (
          SELECT status_code, created, error_msg
          FROM net._http_response
          WHERE created > now() - make_interval(mins => greatest(%1$s, 1))
            AND (status_code IS NULL OR status_code >= 400)
          ORDER BY created DESC
          LIMIT 5
        ) s), '[]'::jsonb)
    )
    FROM net._http_response
    WHERE created > now() - make_interval(mins => greatest(%1$s, 1))
  $q$, p_window_minutes)
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_http_delivery_health(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mcp_http_delivery_health(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.mcp_http_delivery_health(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.mcp_http_delivery_health(integer) IS
  'Read-only HTTP delivery projection over net._http_response. pg_cron reports SQL success while net.http_post is asynchronous, so cron status alone cannot distinguish a delivered call from a 401. Never returns response content or headers. DEF-019.';

-- -------------------------------------------------------------------------------------
-- §5  Vault secret presence
-- -------------------------------------------------------------------------------------
-- Boolean only. Exists because the executor cannot read vault.decrypted_secrets at all and
-- therefore could not perform the DEF-018 pre-check.

CREATE OR REPLACE FUNCTION public.mcp_vault_secret_present(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = p_name
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Owner of this function cannot read the vault either. Say so rather than
    -- returning false, which would read as "the secret is missing".
    RAISE EXCEPTION 'vault.decrypted_secrets is not readable even as the function owner (%)', SQLERRM;
  END;

  RETURN v_secret IS NOT NULL AND length(btrim(v_secret)) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_vault_secret_present(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mcp_vault_secret_present(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mcp_vault_secret_present(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.mcp_vault_secret_present(text) IS
  'TRUE when a vault secret exists and is non-empty. Never returns the value. Cannot prove the value is current or valid — a rotated key is present, non-empty, and 401s on every call; only mcp_http_delivery_health can show that. DEF-019.';

-- -------------------------------------------------------------------------------------
-- §6  POST-ASSERTIONS
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_fn   text;
  v_oid  oid;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['mcp_cron_job_health','mcp_http_delivery_health','mcp_vault_secret_present','redact_secrets'] LOOP
    SELECT p.oid INTO v_oid
    FROM pg_proc p WHERE p.proname = v_fn AND p.pronamespace = 'public'::regnamespace
    LIMIT 1;

    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'DEF-019 post-assert failed: public.% was not created.', v_fn;
    END IF;

    -- DEF-015: none of these may be reachable without a session.
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'DEF-019 post-assert failed: anon holds EXECUTE on public.%.', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'DEF-019 post-assert failed: authenticated lacks EXECUTE on public.%.', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'DEF-019 post-assert failed: service_role lacks EXECUTE on public.%.', v_fn;
    END IF;

    -- DEF-005: search_path must be pinned on every SECURITY DEFINER function.
    IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid)
       AND NOT EXISTS (
         SELECT 1 FROM pg_proc p, unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
         WHERE p.oid = v_oid AND cfg LIKE 'search_path=%'
       ) THEN
      RAISE EXCEPTION 'DEF-019 post-assert failed: public.% is SECURITY DEFINER without a pinned search_path.', v_fn;
    END IF;
  END LOOP;

  -- The functions must actually answer, not merely exist.
  PERFORM public.mcp_cron_job_health(20);
  PERFORM public.mcp_http_delivery_health(20);

  -- Redaction must demonstrably work on the shape it exists to catch.
  IF public.redact_secrets('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.abc123')
     LIKE '%eyJhbGci%' THEN
    RAISE EXCEPTION 'DEF-019 post-assert failed: redact_secrets did not strip a JWT.';
  END IF;

  RAISE NOTICE 'DEF-019 post-assertions passed: cron and delivery health are queryable from public.';
END $mig$;

COMMIT;