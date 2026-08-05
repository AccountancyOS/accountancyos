-- DEF-019 follow-up: grant EXECUTE on the observability projections to sandbox_exec.
--
-- Why: 20260805160000 granted EXECUTE to authenticated and service_role only.
-- The party mandated to run the DEF-019 evidence gate connects as sandbox_exec,
-- so every behavioural check failed with 42501 -- the same class of defect
-- DEF-019 exists to fix: a gate that cannot pass for the party required to run it.
--
-- This migration does NOT modify 20260805160000. It adds four narrow EXECUTE
-- grants and nothing else. No object is created, altered or dropped. The
-- functions remain SECURITY DEFINER, read-only, secret-redacting projections;
-- none of them can return a secret value, a response body or a header.
--
-- It deliberately does NOT re-grant anything to anon or PUBLIC, and the
-- post-assertions prove anon still holds nothing (DEF-015 invariant).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    RAISE EXCEPTION 'DEF-019 follow-up precondition failed: role sandbox_exec does not exist';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.mcp_cron_job_health(integer) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.mcp_http_delivery_health(integer) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.mcp_vault_secret_present(text) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.redact_secrets(text) TO sandbox_exec;

-- ---------------------------------------------------------------------------
-- Post-assertions. Any failure aborts the transaction.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
  v_leaked  text;
  v_probe   boolean;
BEGIN
  -- 1. sandbox_exec can execute all four.
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_missing
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('redact_secrets','mcp_cron_job_health',
                       'mcp_http_delivery_health','mcp_vault_secret_present')
     AND NOT has_function_privilege('sandbox_exec', p.oid, 'EXECUTE');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'DEF-019 follow-up: sandbox_exec still lacks EXECUTE on: %', v_missing;
  END IF;

  -- 2. anon can execute none of them.
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_leaked
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('redact_secrets','mcp_cron_job_health',
                       'mcp_http_delivery_health','mcp_vault_secret_present')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'DEF-019 follow-up: anon holds EXECUTE on: % (DEF-015 invariant broken)', v_leaked;
  END IF;

  -- 3. authenticated and service_role retain EXECUTE (nothing regressed).
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_missing
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('redact_secrets','mcp_cron_job_health',
                       'mcp_http_delivery_health','mcp_vault_secret_present')
     AND NOT (has_function_privilege('authenticated', p.oid, 'EXECUTE')
              AND has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'DEF-019 follow-up: authenticated/service_role lost EXECUTE on: %', v_missing;
  END IF;

  -- 4. The DEF-018 pre-check answers rather than raising a permission error.
  --    A FALSE result is a legitimate answer (secret absent) and must not abort
  --    this migration; only an inability to answer is fatal here.
  BEGIN
    v_probe := public.mcp_vault_secret_present('email_queue_service_role_key');
    RAISE NOTICE 'DEF-019 follow-up: mcp_vault_secret_present(email_queue_service_role_key) = %', v_probe;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'DEF-019 follow-up: vault presence probe returned a permission error (%). The projection cannot answer the DEF-018 pre-check.', SQLERRM;
  END;

  -- 5. Both health projections answer.
  PERFORM public.mcp_cron_job_health(20);
  PERFORM public.mcp_http_delivery_health(20);

  -- 6. Redaction still strips a JWT shape.
  IF public.redact_secrets('Bearer eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ4In0.sig') LIKE '%eyJhbGci%' THEN
    RAISE EXCEPTION 'DEF-019 follow-up: redact_secrets no longer strips a JWT shape';
  END IF;

  RAISE NOTICE 'DEF-019 follow-up: all post-assertions passed';
END $$;

COMMIT;
