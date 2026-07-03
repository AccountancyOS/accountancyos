-- ============================================================
-- Fix (review finding): pin invoice_settings.organization_id to the entity's real org
-- ============================================================
-- The portal INSERT/UPDATE policies on invoice_settings only checked
-- portal_can_access_bookkeeping(client_id, company_id) — they never constrained
-- organization_id. A portal user could insert their own entity's settings row under an
-- ARBITRARY organization_id, mis-scoping their (sensitive) bank details under an unrelated
-- practice and corrupting the (organization_id, client_id) unique index. Pin org to the
-- entity's true organization.
-- ============================================================

DROP POLICY IF EXISTS "Portal inserts invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal inserts invoice settings" ON public.invoice_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.portal_can_access_bookkeeping(client_id, company_id)
    AND organization_id = COALESCE(
      (SELECT organization_id FROM public.clients   WHERE id = client_id),
      (SELECT organization_id FROM public.companies WHERE id = company_id)
    )
  );

DROP POLICY IF EXISTS "Portal updates invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal updates invoice settings" ON public.invoice_settings
  FOR UPDATE TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id))
  WITH CHECK (
    public.portal_can_access_bookkeeping(client_id, company_id)
    AND organization_id = COALESCE(
      (SELECT organization_id FROM public.clients   WHERE id = client_id),
      (SELECT organization_id FROM public.companies WHERE id = company_id)
    )
  );
