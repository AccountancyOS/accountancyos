-- ============================================================
-- SEC-5 / Audit Fix 4: multi-org-safe "view organization members" policy
-- ============================================================
-- The SELECT policy on organization_users used `organization_id = get_user_organization_id()`,
-- where get_user_organization_id() is `SELECT organization_id FROM organization_users WHERE
-- user_id = auth.uid() LIMIT 1` — an ARBITRARY single org for a multi-org user. In this specific
-- policy that under-returns (a user in orgs A+B sees members of only one of them), rather than
-- leaking cross-tenant, but it is the fragile LIMIT-1 pattern the audit flagged and it is a real
-- multi-org correctness bug. Replace it with user_in_organization(auth.uid(), organization_id),
-- which is SECURITY DEFINER (so it breaks the RLS self-reference / recursion, exactly as the old
-- function did) and correctly returns true for EVERY org the user actually belongs to.
--
-- get_user_organization_id() has no other RLS/WITH-CHECK/default usages (verified: the only
-- reference is this policy; the (uuid) overload appears only in generated types), so no other
-- surface changes. Left defined to avoid disturbing anything that resolves it by name.
-- ============================================================

DROP POLICY IF EXISTS "Users can view their organization members" ON public.organization_users;
CREATE POLICY "Users can view their organization members"
ON public.organization_users
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.user_in_organization(auth.uid(), organization_id)
);
