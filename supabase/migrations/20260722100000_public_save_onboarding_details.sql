-- Increment C (client-data-collection design): the "Your details" onboarding step -- storage +
-- token-gated save RPC.
--
-- onboarding_applications already has utr, vat_number, date_of_birth, national_insurance_number
-- and address_* (from the original 20251125174504 table + later migrations) for a single
-- individual/company applicant, but has no PAYE reference and no way to capture per-person data
-- for multiple directors/shareholders (the design's confirmed decision #5: personal data is
-- per-person, a flat dob/nino on the application doesn't scale to multi-director companies).
--
-- This migration is additive:
--   1. paye_reference (text) -- company-level PAYE scheme reference, alongside the existing
--      utr/vat_number.
--   2. personal_details (jsonb) -- an array of per-person objects captured during onboarding
--      (before company_persons rows exist for this applicant), each shaped
--      { name, role, date_of_birth, nino, utr, home_address }. On approval, lifecycle_approve_
--      onboarding (untouched by this migration -- a separate step) is responsible for merging
--      this into company_persons.
--
-- Then a token-gated public RPC, public_save_onboarding_details, lets the onboarding wizard save
-- both in one call. It mirrors the exact token-validation + closed-status guard used by the other
-- hardened public onboarding RPCs (public_record_aml_upload / public_get_onboarding, see
-- 20260624080239 and the token-enforcement flip in 20260721090337): look up the application row,
-- PERFORM lifecycle_require_onboarding_token(...) (now unconditionally required and validated --
-- raises 42501 if missing/invalid/expired), then reject if the application is already closed
-- (status IN ('approved','rejected','cancelled')).

-- =====================================================
-- 1. Storage columns
-- =====================================================
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS paye_reference text,
  ADD COLUMN IF NOT EXISTS personal_details jsonb;

COMMENT ON COLUMN public.onboarding_applications.paye_reference IS
  'Company PAYE scheme reference captured on the onboarding "Your details" step (service-aware: only requested when a payroll service is on the accepted quote). Merged into companies on approval by lifecycle_approve_onboarding.';

COMMENT ON COLUMN public.onboarding_applications.personal_details IS
  'Per-person data captured on the onboarding "Your details" step for each director/shareholder, before company_persons rows exist for this applicant. Shape: jsonb array of { name, role, date_of_birth, nino, utr, home_address }. Merged into company_persons on approval by lifecycle_approve_onboarding (a separate step from this migration).';

-- =====================================================
-- 2. Token-gated save RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.public_save_onboarding_details(
  p_application_id uuid,
  p_access_token text,
  p_utr text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_paye_reference text DEFAULT NULL,
  p_personal_details jsonb DEFAULT NULL
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
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.public_save_onboarding_details(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_save_onboarding_details(uuid, text, text, text, text, jsonb) TO anon, authenticated;
