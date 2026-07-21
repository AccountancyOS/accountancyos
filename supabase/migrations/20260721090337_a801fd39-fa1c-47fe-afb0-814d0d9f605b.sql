-- Sprint 1 — Increment 3b: onboarding access-token enforcement flip.
-- Flip lifecycle_require_onboarding_token from "validate-if-present" to
-- "must be provided and must match", and drop the no-token overloads of
-- the seven public onboarding RPCs so the (uuid, ..., text) overload is
-- the only callable signature.
-- Bodies of the token-carrying overloads are untouched — behaviour change
-- lives entirely in the guard.

CREATE OR REPLACE FUNCTION public.lifecycle_require_onboarding_token(
  p_application_id uuid,
  p_access_token text
) RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_access_token IS NULL
     OR NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid or missing onboarding access token' USING ERRCODE='42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) TO anon, authenticated, service_role;

-- Drop the seven no-token overloads. Every remaining call path (frontend
-- PublicOnboarding.tsx, onboarding-stripe-verify edge function) threads
-- p_access_token, so removing these overloads is safe.
DROP FUNCTION IF EXISTS public.public_get_onboarding(uuid);
DROP FUNCTION IF EXISTS public.public_preview_engagement_letter(uuid);
DROP FUNCTION IF EXISTS public.public_sign_engagement_letter(uuid, jsonb);
DROP FUNCTION IF EXISTS public.public_record_aml_upload(uuid, text, text, text, integer, text);
DROP FUNCTION IF EXISTS public.public_skip_billing(uuid);
DROP FUNCTION IF EXISTS public.public_complete_billing(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.public_submit_onboarding_for_review(uuid, text);
