
-- =============================================
-- 1. BANK CONNECTIONS: Hide tokens from client
-- =============================================

DROP POLICY IF EXISTS "org_users_can_manage_bank_connections" ON public.bank_connections;

CREATE OR REPLACE VIEW public.bank_connections_safe AS
SELECT 
  id, bank_name, bank_logo_url, provider, status, 
  organization_id, client_id, company_id,
  consent_expires_at, last_synced_at, last_error, scope,
  provider_connection_id,
  created_at, updated_at
FROM public.bank_connections;

GRANT SELECT ON public.bank_connections_safe TO authenticated;

CREATE POLICY "org_members_select_bank_connections" ON public.bank_connections
  FOR SELECT TO authenticated
  USING (user_has_organization_access(organization_id));

CREATE POLICY "org_admins_insert_bank_connections" ON public.bank_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = bank_connections.organization_id
        AND ou.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_admins_update_bank_connections" ON public.bank_connections
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = bank_connections.organization_id
        AND ou.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_admins_delete_bank_connections" ON public.bank_connections
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = bank_connections.organization_id
        AND ou.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- 2. HMRC INTEGRATION: Hide encrypted tokens
-- =============================================

DROP POLICY IF EXISTS "org_users_can_manage_hmrc" ON public.organization_integrations_hmrc;

CREATE OR REPLACE VIEW public.organization_integrations_hmrc_safe AS
SELECT 
  organization_id, 
  mtd_vat_connected, mtd_vat_connected_at, mtd_vat_expires_at,
  paye_connected, sa_connected, ct_connected,
  test_mode,
  created_at, updated_at
FROM public.organization_integrations_hmrc;

GRANT SELECT ON public.organization_integrations_hmrc_safe TO authenticated;

CREATE POLICY "org_members_select_hmrc" ON public.organization_integrations_hmrc
  FOR SELECT TO authenticated
  USING (user_has_organization_access(organization_id));

CREATE POLICY "org_owners_insert_hmrc" ON public.organization_integrations_hmrc
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = organization_integrations_hmrc.organization_id
        AND ou.role = 'owner'
    )
  );

CREATE POLICY "org_owners_update_hmrc" ON public.organization_integrations_hmrc
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = organization_integrations_hmrc.organization_id
        AND ou.role = 'owner'
    )
  );

CREATE POLICY "org_owners_delete_hmrc" ON public.organization_integrations_hmrc
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = organization_integrations_hmrc.organization_id
        AND ou.role = 'owner'
    )
  );

-- =============================================
-- 3. ORGANIZATIONS: Tighten INSERT policy
-- =============================================

DROP POLICY IF EXISTS "org_admins_insert_organization" ON public.organizations;

CREATE POLICY "authenticated_users_create_organization" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM organization_users ou 
      WHERE ou.organization_id = organizations.id
    )
  );
