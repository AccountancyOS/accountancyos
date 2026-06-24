-- ============================================================
-- Re-assert validate_onboarding_access_token (was missing from the live DB)
-- ============================================================
-- The onboarding RPCs route through lifecycle_require_onboarding_token, which
-- calls validate_onboarding_access_token(uuid, text). That helper's original
-- migration (20260621180515) did not land in the live database, so onboarding
-- with a token raised "function public.validate_onboarding_access_token(uuid,
-- text) does not exist". Body is identical to 20260621180515; re-asserting it
-- here (idempotent CREATE OR REPLACE) so the function exists. Its column
-- dependencies (onboarding_applications.access_token / access_token_expires_at,
-- from 20260617114623) are present.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_onboarding_access_token(
  p_application_id uuid,
  p_token text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_applications
    WHERE id = p_application_id
      AND access_token = p_token
      AND (access_token_expires_at IS NULL OR access_token_expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.validate_onboarding_access_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_onboarding_access_token(uuid, text) TO anon, authenticated, service_role;
