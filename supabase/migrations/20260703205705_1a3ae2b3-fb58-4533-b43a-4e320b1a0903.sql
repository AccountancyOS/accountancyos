-- ============================================================
-- SECURITY: minimise the anon-executable SECURITY DEFINER surface (linter audit)
-- ============================================================
-- Audit of every function GRANTed EXECUTE to anon: the public quote flow
-- (public_get/accept/reject_quote_by_token) and the public onboarding flow
-- (public_get_onboarding, public_submit_onboarding_for_review, public_complete_billing,
-- public_skip_billing, public_record_aml_upload, public_sign_engagement_letter,
-- public_preview_engagement_letter, validate_onboarding_access_token,
-- lifecycle_require_onboarding_token, consume_unsubscribe_token) are all TOKEN-GATED and
-- legitimately anon by design.
--
-- Two are NOT part of any unauthenticated flow and should never have been anon-callable:
--   * get_check_constraint_values — returns schema CHECK-constraint definitions (used only by
--     the app's internal constraint registry; authenticated).
--   * render_engagement_letter_body — used by the authenticated engagement-letter settings page.
-- Revoke anon EXECUTE on both (authenticated access is unchanged).
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_check_constraint_values(text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.render_engagement_letter_body(text, text, text, text, text, numeric, numeric, timestamptz) FROM anon;
