-- ============================================================
-- Security fixes (publish blockers): session-token access, quote-token enumeration, SEC-DEF view
-- ============================================================
-- Three error-level findings from the Supabase security linter. All fixed here idempotently.
-- ============================================================

-- #1 — user_sessions: "Org admins can manage sessions" checked only org MEMBERSHIP, not role, so any
-- staff-level user could SELECT/UPDATE/DELETE other users' session_token / ip_address / device_info
-- (session hijacking). Restrict to admin/owner via user_has_role_at_least. "Users can view own
-- sessions" (SELECT own) is a separate policy and is unaffected.
DROP POLICY IF EXISTS "Org admins can manage sessions" ON public.user_sessions;
CREATE POLICY "Org admins can manage sessions" ON public.user_sessions
  FOR ALL
  USING (public.user_has_role_at_least(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.user_has_role_at_least(auth.uid(), organization_id, 'admin'));

-- #2 — quote_acceptance_tokens: "Anyone with the token can read live tokens" granted anon SELECT
-- filtered only by (used_at IS NULL AND expires_at > now()) — no check the caller knows the token.
-- Any anonymous visitor could enumerate EVERY live token + quote_id + organization_id across all
-- orgs, and the token IS the authority to accept the quote (account-takeover-grade). This was
-- already fixed in 20260703204710 but that migration never reached the live DB (apply-gap) — the
-- linter still flags it, so re-apply idempotently. The public flow uses SECURITY DEFINER RPCs
-- (public_get_quote_by_token / _accept_ / _reject_) that take + validate the supplied token, so no
-- direct anon table access is needed.
DROP POLICY IF EXISTS "Anyone with the token can read live tokens" ON public.quote_acceptance_tokens;
REVOKE SELECT ON public.quote_acceptance_tokens FROM anon;
ALTER TABLE public.quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read their quote tokens" ON public.quote_acceptance_tokens;
CREATE POLICY "Org members read their quote tokens"
  ON public.quote_acceptance_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_has_organization_access(organization_id));

-- #3 — connected_mailboxes_safe lost security_invoker. The view was created WITH (security_invoker
-- = true) in 20260218184426 so it runs with the QUERYING user's RLS (each user sees only their own
-- mailbox metadata, tokens redacted). Migration 20260720120500 recreated it via CREATE OR REPLACE
-- VIEW … AS to add token_expires_at but omitted the WITH clause, resetting it to the default
-- (security_invoker off = definer's rights) — so it bypassed connected_mailboxes RLS and exposed
-- every org's mailbox rows. Restore invoker semantics. (bank_connections_safe /
-- organization_integrations_hmrc_safe already carry security_invoker from 20260407142143.)
ALTER VIEW public.connected_mailboxes_safe SET (security_invoker = on);
