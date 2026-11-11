-- ============================================================
-- SECURITY: lock the anon (unauthenticated) function surface to an allowlist
-- ============================================================
-- PostgreSQL grants EXECUTE on functions to PUBLIC by default, and anon is a member of PUBLIC,
-- so anon could execute virtually every SECURITY DEFINER function in the schema (the Supabase
-- linter's "executable by anon" warning) — regardless of explicit grants. Revoking from anon
-- alone is INEFFECTIVE because the PUBLIC default remains. So:
--   1. Revoke the world-execute default (PUBLIC) + any explicit anon grants.
--   2. Restore `authenticated` (logged-in accountant + portal users) so no app RPC breaks —
--      the functions carry their own org/role/portal auth checks; anon is the critical surface.
--   3. Re-grant ONLY the unauthenticated, token-gated public flows to anon, pattern-based so
--      none is missed: public_* (quote accept + onboarding), *_by_token (quote + questionnaire),
--      the onboarding-token helpers, and consume_unsubscribe_token. (Password reset is native
--      Supabase Auth — no RPC.) Internal helpers render_engagement_letter_body /
--      get_check_constraint_values do not match the public-flow naming, so they stay anon-denied.
--   4. Flip the default privilege so FUTURE functions are not world-executable (no regression).
-- Verified: no anon-facing RLS policy calls a helper function, so revoking PUBLIC does not break
-- an anon RLS path; every public flow goes through these allowlisted SECURITY DEFINER RPCs.
-- ============================================================

-- 1. Remove default world-execute + any explicit anon grants.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 2. Keep every logged-in RPC working.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 3. Re-grant the unauthenticated public flows to anon (+ authenticated for the logged-in
--    variants of the same flows).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        p.proname LIKE 'public\_%'
        OR p.proname LIKE '%\_by\_token'
        OR p.proname IN ('validate_onboarding_access_token',
                         'lifecycle_require_onboarding_token',
                         'consume_unsubscribe_token')
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated',
                   r.proname, pg_get_function_identity_arguments(r.oid));
  END LOOP;
END $$;

-- 4. Prevent regression: new functions are not granted to PUBLIC by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
