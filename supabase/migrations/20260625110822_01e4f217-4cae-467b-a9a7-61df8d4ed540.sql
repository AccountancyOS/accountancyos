-- ============================================================
-- Close out the IDOR hardening (reconciliation Increment 6 / original 3b)
-- ============================================================
-- Re-introduces the "token required" enforcement that closes the onboarding IDOR
-- (public onboarding RPCs must no longer be reachable with just a guessable
-- application UUID). Gated on canonical_lifecycle_enabled so only orgs on the
-- canonical model — where the quote-accept flow issues /onboard?token= links — are
-- enforced; legacy orgs keep validate-if-present.
--
-- Safe because access_token is already NOT NULL with a DEFAULT generator
-- (20260617114623), so every application has a token and new ones auto-generate.
-- The backfill below is a belt-and-braces no-op for any row that somehow lacks one.
--
-- VERIFY after applying (Blue Tick, flag ON): run a fresh quote -> accept ->
-- onboarding. It should work (the link carries ?token=). If onboarding now rejects
-- with "Onboarding access token required or invalid", the link-threading is the
-- gap, not this migration — revert by re-applying the validate-if-present body from
-- 20260624223826 and tell me; I'll fix the threading first.
-- ============================================================

-- Belt-and-braces backfill (no-op if the NOT NULL default is in force).
UPDATE public.onboarding_applications
   SET access_token = encode(extensions.gen_random_bytes(32), 'hex')
 WHERE access_token IS NULL;
UPDATE public.onboarding_applications
   SET access_token_expires_at = now() + interval '90 days'
 WHERE access_token_expires_at IS NULL;

-- Enforcement: require a valid token on canonical-lifecycle orgs.
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
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.onboarding_applications WHERE id = p_application_id;
  IF public.is_canonical_lifecycle_enabled(v_org) THEN
    -- Enforced: a valid, unexpired token is required (closes the IDOR).
    IF p_access_token IS NULL
       OR NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
      RAISE EXCEPTION 'Onboarding access token required or invalid' USING ERRCODE='42501';
    END IF;
  ELSE
    -- Legacy (flag off): validate only if a token was supplied.
    IF p_access_token IS NOT NULL
       AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
      RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) TO anon, authenticated, service_role;
