DROP POLICY IF EXISTS "org_members_select_bank_connections" ON public.bank_connections;
CREATE POLICY "org_admins_select_bank_connections" ON public.bank_connections
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM organization_users ou
  WHERE ou.user_id = auth.uid()
    AND ou.organization_id = bank_connections.organization_id
    AND ou.role = ANY (ARRAY['owner'::text, 'admin'::text])
));