DROP POLICY IF EXISTS "Users can view their organization members" ON public.organization_users;
CREATE POLICY "Users can view their organization members"
ON public.organization_users
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.user_in_organization(auth.uid(), organization_id)
);