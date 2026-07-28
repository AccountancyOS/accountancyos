-- =====================================================================================
-- DEF-015 containment: el_signature_progress must not be anonymously executable.
-- =====================================================================================
-- The launch-readiness audit (docs/audits/2026-07-27-launch-readiness-e2e.md, DEF-015)
-- enumerated 93 SECURITY DEFINER functions that `anon` may execute and that contain no
-- internal authorisation check. public.el_signature_progress is on that list, in risk
-- class 1 — data disclosure on a caller-supplied UUID.
--
-- It is there because of a mistake made when it was introduced (20260727140000): it was
-- created as SECURITY DEFINER without revoking the default PUBLIC EXECUTE grant that
-- Postgres applies to every new function. It was never meant to be a public endpoint.
-- It is an INTERNAL helper — the single implementation of the engagement-letter signing
-- rule — called by public.lifecycle_onboarding_gates and by the token-gated signing RPCs.
-- Those callers are themselves SECURITY DEFINER, so they execute it as the definer and
-- are unaffected by this revoke.
--
-- What it currently leaks to an unauthenticated caller holding only an engagement-letter
-- UUID: the signing rule, how many signatories are required, and how many have signed.
-- Modest on its own, but it is an oracle on a guessable-by-enumeration identifier and it
-- has no business being reachable without a token.
--
-- The two genuinely public signing endpoints added alongside it —
-- public_get_engagement_letter_for_signing and public_sign_engagement_letter_as_signatory
-- — KEEP their anon grants deliberately. A client following an emailed link has no
-- session; those functions authorise on the signing token itself, which is the intended
-- design and matches public_get_onboarding. This migration does not touch them.
--
-- Scope: grants only. No function body, signature, table, policy or trigger is altered.
-- =====================================================================================

REVOKE ALL ON FUNCTION public.el_signature_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.el_signature_progress(uuid) FROM anon;

-- Staff-side callers (the onboarding gate is invoked from authenticated contexts) and
-- the service role keep access. SECURITY DEFINER callers reach it as the definer.
GRANT EXECUTE ON FUNCTION public.el_signature_progress(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.el_signature_progress(uuid) IS
  'Single source of truth for the engagement-letter signing rule (all/any) over '
  'engagement_letter_signatories. INTERNAL: called by lifecycle_onboarding_gates and the '
  'token-gated signing RPCs. Deliberately NOT executable by anon (DEF-015) — never '
  'regrant it without a token check inside the function.';
