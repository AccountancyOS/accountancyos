-- Add onboarding and configuration fields to organizations table
ALTER TABLE public.organizations 
ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN timezone TEXT DEFAULT 'Europe/London',
ADD COLUMN email_domain TEXT;

-- Create table for external service credentials (metadata only, not actual passwords)
CREATE TABLE public.external_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL, -- 'hmrc_gateway', 'companies_house', 'email', 'sms', 'whatsapp', 'crm'
  credential_label TEXT NOT NULL, -- User-friendly name
  metadata JSONB, -- Store non-sensitive metadata only
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on external_credentials
ALTER TABLE public.external_credentials ENABLE ROW LEVEL SECURITY;

-- RLS policies for external_credentials
CREATE POLICY "Users can view credentials in their organization"
ON public.external_credentials FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert credentials in their organization"
ON public.external_credentials FOR INSERT
WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update credentials in their organization"
ON public.external_credentials FOR UPDATE
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete credentials in their organization"
ON public.external_credentials FOR DELETE
USING (user_has_organization_access(organization_id));

-- Create trigger for updated_at
CREATE TRIGGER update_external_credentials_updated_at
BEFORE UPDATE ON public.external_credentials
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();