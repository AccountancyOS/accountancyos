-- ============================================================
-- SECURITY (publish blocker): close anon enumeration of quote_acceptance_tokens
-- ============================================================
-- The policy "Anyone with the token can read live tokens" was FOR SELECT TO anon, authenticated
-- USING (used_at IS NULL AND expires_at > now()) — that only filters to LIVE tokens, it never
-- restricts to the caller's own token. So any unauthenticated internet user could list EVERY
-- active acceptance token + quote_id + organization_id, and each token IS the authorization to
-- accept a quote (an account-takeover-grade leak). Flagged since 2026-06-30.
--
-- The public quote flow does NOT need direct table access: it uses SECURITY DEFINER RPCs
-- (public_get_quote_by_token / public_accept_quote_by_token / public_reject_quote_by_token)
-- that take a supplied token and validate it server-side, and those run as owner (bypass RLS).
-- So: remove all anon/broad access; authenticated may read only their OWN org's tokens.
-- ============================================================

DROP POLICY IF EXISTS "Anyone with the token can read live tokens" ON public.quote_acceptance_tokens;

REVOKE SELECT ON public.quote_acceptance_tokens FROM anon;

ALTER TABLE public.quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;

-- Accountant/org members may read their own org's tokens (no anon, no cross-org).
DROP POLICY IF EXISTS "Org members read their quote tokens" ON public.quote_acceptance_tokens;
CREATE POLICY "Org members read their quote tokens"
  ON public.quote_acceptance_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_has_organization_access(organization_id));
