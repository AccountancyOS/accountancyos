-- Phase 1: Add is_revenue_account to bookkeeping_accounts
ALTER TABLE public.bookkeeping_accounts 
ADD COLUMN IF NOT EXISTS is_revenue_account BOOLEAN DEFAULT true;

-- Update existing accounts: set is_revenue_account = true only for INCOME accounts
UPDATE public.bookkeeping_accounts 
SET is_revenue_account = (account_type = 'INCOME');

-- Phase 2: Create organization_settings table
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, setting_key)
);

-- Enable RLS on organization_settings
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_settings
CREATE POLICY "Users can view settings in their organization"
ON public.organization_settings
FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage settings in their organization"
ON public.organization_settings
FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- Phase 3: Create portal_visibility_settings table
CREATE TABLE IF NOT EXISTS public.portal_visibility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  show_revenue BOOLEAN,
  show_profit BOOLEAN,
  show_cash BOOLEAN,
  show_vat_position BOOLEAN,
  show_ct_estimate BOOLEAN,
  show_receivables_payables BOOLEAN,
  show_transactions BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR 
    (client_id IS NULL AND company_id IS NOT NULL)
  ),
  UNIQUE(organization_id, client_id, company_id)
);

-- Enable RLS on portal_visibility_settings
ALTER TABLE public.portal_visibility_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for portal_visibility_settings
CREATE POLICY "Users can view visibility settings in their organization"
ON public.portal_visibility_settings
FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage visibility settings in their organization"
ON public.portal_visibility_settings
FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- Add updated_at trigger for organization_settings
CREATE TRIGGER update_organization_settings_updated_at
BEFORE UPDATE ON public.organization_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add updated_at trigger for portal_visibility_settings
CREATE TRIGGER update_portal_visibility_settings_updated_at
BEFORE UPDATE ON public.portal_visibility_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();