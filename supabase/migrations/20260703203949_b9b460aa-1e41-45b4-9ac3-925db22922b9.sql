CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  logo_url text,
  bank_account_name text,
  bank_sort_code text,
  bank_account_number text,
  bank_reference text,
  payment_terms_days integer NOT NULL DEFAULT 30,
  invoice_footer text,
  email_subject text,
  email_body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_settings_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_settings TO authenticated;
GRANT ALL ON public.invoice_settings TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_settings_client_uidx
  ON public.invoice_settings(organization_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_settings_company_uidx
  ON public.invoice_settings(organization_id, company_id) WHERE company_id IS NOT NULL;

DROP TRIGGER IF EXISTS invoice_settings_set_updated_at ON public.invoice_settings;
CREATE TRIGGER invoice_settings_set_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members manage invoice settings" ON public.invoice_settings;
CREATE POLICY "Org members manage invoice settings" ON public.invoice_settings
  FOR ALL TO authenticated
  USING (public.user_has_organization_access(organization_id))
  WITH CHECK (public.user_has_organization_access(organization_id));

DROP POLICY IF EXISTS "Portal views invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal views invoice settings" ON public.invoice_settings
  FOR SELECT TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id));
DROP POLICY IF EXISTS "Portal inserts invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal inserts invoice settings" ON public.invoice_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.portal_can_access_bookkeeping(client_id, company_id));
DROP POLICY IF EXISTS "Portal updates invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal updates invoice settings" ON public.invoice_settings
  FOR UPDATE TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id))
  WITH CHECK (public.portal_can_access_bookkeeping(client_id, company_id));

CREATE OR REPLACE FUNCTION public.can_manage_invoice_branding(p_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_entity_id IS NULL THEN RETURN false; END IF;
  SELECT organization_id INTO v_org FROM public.clients WHERE id = p_entity_id;
  IF FOUND THEN
    RETURN public.user_has_organization_access(v_org)
        OR public.portal_can_access_bookkeeping(p_entity_id, NULL);
  END IF;
  SELECT organization_id INTO v_org FROM public.companies WHERE id = p_entity_id;
  IF FOUND THEN
    RETURN public.user_has_organization_access(v_org)
        OR public.portal_can_access_bookkeeping(NULL, p_entity_id);
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_invoice_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_invoice_branding(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "invoice-branding public read" ON storage.objects;
CREATE POLICY "invoice-branding public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'invoice-branding');

DROP POLICY IF EXISTS "invoice-branding managed write" ON storage.objects;
CREATE POLICY "invoice-branding managed write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-branding'
    AND public.can_manage_invoice_branding(NULLIF((storage.foldername(name))[1], '')::uuid));

DROP POLICY IF EXISTS "invoice-branding managed update" ON storage.objects;
CREATE POLICY "invoice-branding managed update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-branding'
    AND public.can_manage_invoice_branding(NULLIF((storage.foldername(name))[1], '')::uuid));

DROP POLICY IF EXISTS "invoice-branding managed delete" ON storage.objects;
CREATE POLICY "invoice-branding managed delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-branding'
    AND public.can_manage_invoice_branding(NULLIF((storage.foldername(name))[1], '')::uuid));