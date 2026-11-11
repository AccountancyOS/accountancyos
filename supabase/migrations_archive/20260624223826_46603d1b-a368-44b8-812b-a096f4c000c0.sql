-- ============================================================
-- Reconciliation Increment 1: decouple onboarding token ENFORCEMENT from the
-- canonical_lifecycle flag (so the gated model can be enabled safely)
-- ============================================================
-- Previously lifecycle_require_onboarding_token REQUIRED a valid token whenever
-- canonical_lifecycle_enabled was ON. That bundled the IDOR hardening (3b) with
-- the pending-funnel/gated-approve behaviour, so turning the flag on bricked every
-- pre-token onboarding ("Onboarding access token required or invalid"). Decouple
-- them: this guard now ONLY validates a token when one is supplied (never requires
-- one), regardless of the flag. The hard "token required" enforcement will be
-- reintroduced as its own step AFTER access_token is backfilled on all open
-- onboarding_applications. See docs/sprint1-lifecycle-reconciliation-plan.md.
--
-- Also re-asserts validate_onboarding_access_token (idempotent) so this migration
-- is self-contained even if 20260621180515 / 20260624201925 didn't land.
-- ============================================================

-- Helper (verbatim from 20260621180515) — idempotent re-assert.
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

-- Guard: validate-if-present ONLY (no hard requirement, flag-independent).
CREATE OR REPLACE FUNCTION public.lifecycle_require_onboarding_token(
  p_application_id uuid,
  p_access_token text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate only when a token is supplied; never require one. Enforcement (the
  -- IDOR closure) is reintroduced separately once tokens are backfilled.
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) TO anon, authenticated, service_role;
