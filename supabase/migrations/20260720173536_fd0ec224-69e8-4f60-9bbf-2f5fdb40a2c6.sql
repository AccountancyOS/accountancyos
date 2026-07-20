-- #1 user_sessions
DROP POLICY IF EXISTS "Org admins can manage sessions" ON public.user_sessions;
CREATE POLICY "Org admins can manage sessions" ON public.user_sessions
  FOR ALL
  USING (public.user_has_role_at_least(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.user_has_role_at_least(auth.uid(), organization_id, 'admin'));

-- #2 quote_acceptance_tokens
DROP POLICY IF EXISTS "Anyone with the token can read live tokens" ON public.quote_acceptance_tokens;
REVOKE SELECT ON public.quote_acceptance_tokens FROM anon;
ALTER TABLE public.quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read their quote tokens" ON public.quote_acceptance_tokens;
CREATE POLICY "Org members read their quote tokens"
  ON public.quote_acceptance_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_has_organization_access(organization_id));

-- #3 connected_mailboxes_safe
ALTER VIEW public.connected_mailboxes_safe SET (security_invoker = on);