-- =====================================================
-- Settings Infrastructure: Branding + Integrations
-- =====================================================

-- 1. Organization Branding Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organization_branding (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  trading_name TEXT,
  legal_name TEXT,
  phone TEXT,
  website TEXT,
  vat_number TEXT,
  company_registration_number TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  logo_light_url TEXT,
  logo_dark_url TEXT,
  accent_color TEXT DEFAULT '#3b82f6',
  invoice_footer_notes TEXT,
  email_footer_html TEXT,
  portal_theme JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organization_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_users_can_manage_branding"
ON public.organization_branding
FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- 2. Organization Integrations HMRC Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organization_integrations_hmrc (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  mtd_vat_connected BOOLEAN DEFAULT false,
  mtd_vat_connected_at TIMESTAMPTZ,
  mtd_vat_access_token_encrypted TEXT,
  mtd_vat_refresh_token_encrypted TEXT,
  mtd_vat_expires_at TIMESTAMPTZ,
  paye_connected BOOLEAN DEFAULT false,
  sa_connected BOOLEAN DEFAULT false,
  ct_connected BOOLEAN DEFAULT false,
  test_mode BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organization_integrations_hmrc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_users_can_manage_hmrc"
ON public.organization_integrations_hmrc
FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- 3. Organization Integrations Companies House Table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organization_integrations_companies_house (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_encrypted TEXT,
  presenter_id TEXT,
  presenter_email TEXT,
  connected_at TIMESTAMPTZ,
  last_test_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organization_integrations_companies_house ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_users_can_manage_ch"
ON public.organization_integrations_companies_house
FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- 4. HMRC Auth States Table (for OAuth flow)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.hmrc_auth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  redirect_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.hmrc_auth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_users_can_manage_hmrc_auth_states"
ON public.hmrc_auth_states
FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- 5. Branding Storage Bucket
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('branding', 'branding', false, 2097152)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "org_users_can_upload_branding"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'branding'
  AND user_has_organization_access((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "org_users_can_read_branding"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'branding'
  AND user_has_organization_access((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "org_users_can_update_branding"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'branding'
  AND user_has_organization_access((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "org_users_can_delete_branding"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'branding'
  AND user_has_organization_access((storage.foldername(name))[1]::uuid)
);

-- 6. Updated_at triggers
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organization_branding_updated_at
  BEFORE UPDATE ON public.organization_branding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_integrations_hmrc_updated_at
  BEFORE UPDATE ON public.organization_integrations_hmrc
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_integrations_companies_house_updated_at
  BEFORE UPDATE ON public.organization_integrations_companies_house
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();