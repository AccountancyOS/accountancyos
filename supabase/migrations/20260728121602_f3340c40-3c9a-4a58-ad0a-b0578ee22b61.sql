REVOKE ALL ON FUNCTION public.el_signature_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.el_signature_progress(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.el_signature_progress(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.el_signature_progress(uuid) IS
  'Single source of truth for the engagement-letter signing rule (all/any) over engagement_letter_signatories. INTERNAL: called by lifecycle_onboarding_gates and the token-gated signing RPCs. Deliberately NOT executable by anon (DEF-015) — never regrant it without a token check inside the function.';