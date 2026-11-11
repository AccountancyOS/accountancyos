-- Increment C frontend follow-up: two small additive fixes discovered while wiring the
-- "Your details" onboarding step to public_save_onboarding_details (20260722100000).
--
-- 1. BUGFIX: that migration's header comment claims onboarding_applications "already has
--    utr" -- it does not. Confirmed absent from every onboarding_applications ALTER TABLE
--    in this migrations directory (only clients.utr / companies.utr exist) and absent from
--    the generated src/integrations/supabase/types.ts Row shape (which has vat_number but
--    no utr). The RPC body unconditionally runs `SET utr = COALESCE(p_utr, utr), ...`, so
--    with the column missing EVERY call -- not just ones that pass a UTR -- fails at
--    runtime with "column utr does not exist". Fix: add the missing column.
--
-- 2. FEATURE: decisions 6/8 of the client-data-collection design want a "flag a
--    correction" affordance on the read-only, Companies-House-labelled company fields
--    (name/number) shown on the "Your details" step. There is no column to hold that
--    note, so add one (ch_correction_note) and extend public_save_onboarding_details to
--    accept it.
--
-- The existing 6-arg overload is dropped and replaced with a 7-arg version (trailing
-- DEFAULT-ed param) rather than left in place alongside a new one, to avoid the
-- named-argument overload ambiguity documented in src/pages/PublicOnboarding.tsx's
-- getAccessToken() comment (two live overloads of public_get_onboarding previously broke
-- calls the same way). Body is otherwise verbatim from 20260722100000.

ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS utr text,
  ADD COLUMN IF NOT EXISTS ch_correction_note text;

COMMENT ON COLUMN public.onboarding_applications.utr IS
  'Company/individual UTR captured on the onboarding "Your details" step (public_save_onboarding_details). Merged into companies/clients on approval by lifecycle_approve_onboarding (separate, deferred step).';

COMMENT ON COLUMN public.onboarding_applications.ch_correction_note IS
  'Free-text note from the applicant flagging a possible error in the read-only, Companies-House-labelled company name/number shown on the "Your details" step. We do not edit Companies House data directly here -- the firm follows up manually. Set via public_save_onboarding_details.';

DROP FUNCTION IF EXISTS public.public_save_onboarding_details(uuid, text, text, text, text, jsonb);

CREATE FUNCTION public.public_save_onboarding_details(
  p_application_id uuid,
  p_access_token text,
  p_utr text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_paye_reference text DEFAULT NULL,
  p_personal_details jsonb DEFAULT NULL,
  p_ch_correction_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  UPDATE public.onboarding_applications
     SET utr = COALESCE(p_utr, utr),
         vat_number = COALESCE(p_vat_number, vat_number),
         paye_reference = COALESCE(p_paye_reference, paye_reference),
         personal_details = COALESCE(p_personal_details, personal_details),
         ch_correction_note = COALESCE(p_ch_correction_note, ch_correction_note),
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.public_save_onboarding_details(uuid, text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_save_onboarding_details(uuid, text, text, text, text, jsonb, text) TO anon, authenticated;
