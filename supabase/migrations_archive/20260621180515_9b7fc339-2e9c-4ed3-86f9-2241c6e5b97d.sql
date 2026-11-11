-- ============================================================
-- Sprint 1 — Increment 3a / Task 1
-- Onboarding access-token validation helper (read-only)
-- ============================================================
-- Returns true iff the application exists with the given (unexpired) access
-- token. Used by the public onboarding RPCs to validate a token WHEN ONE IS
-- PROVIDED (Increment 3a is backward-compatible: a NULL token is allowed and
-- behaves as today; enforcement/required is the later 3b flip). Writes nothing.
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

COMMENT ON FUNCTION public.validate_onboarding_access_token(uuid, text) IS
  'Sprint 1 3a: true iff onboarding application p_application_id has access_token = p_token (unexpired). Used by public onboarding RPCs to validate a supplied token. Read-only.';
