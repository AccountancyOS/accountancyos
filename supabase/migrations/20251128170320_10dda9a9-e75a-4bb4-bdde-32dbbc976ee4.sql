
-- Phase 1: Trial Balance Snapshots and Account Mappings

-- Create trial_balance_snapshots table
CREATE TABLE public.trial_balance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  snapshot_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source_type TEXT NOT NULL DEFAULT 'native' CHECK (source_type IN ('native', 'xero', 'quickbooks', 'sage', 'freeagent', 'manual_import')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalised', 'superseded')),
  balances JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID,
  finalised_by UUID,
  finalised_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT tb_snapshot_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR 
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Create tb_account_mappings table for saved import templates
CREATE TABLE public.tb_account_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('xero', 'quickbooks', 'sage', 'freeagent', 'csv')),
  template_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  column_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create workpaper_category_mappings for TB account → workpaper category configuration
CREATE TABLE public.workpaper_category_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('company_accounts', 'ct600', 'vat_return', 'self_assessment')),
  account_code_pattern TEXT,
  account_type TEXT,
  account_subtype TEXT,
  workpaper_category TEXT NOT NULL,
  workpaper_subcategory TEXT,
  is_default BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add trial_balance_snapshot_id to workpaper_instances
ALTER TABLE public.workpaper_instances 
ADD COLUMN IF NOT EXISTS trial_balance_snapshot_id UUID REFERENCES public.trial_balance_snapshots(id),
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'questionnaire' CHECK (source_type IN ('trial_balance', 'questionnaire', 'manual', 'hybrid'));

-- Enable RLS
ALTER TABLE public.trial_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workpaper_category_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trial_balance_snapshots
CREATE POLICY "Users can view TB snapshots in their organization"
ON public.trial_balance_snapshots FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert TB snapshots in their organization"
ON public.trial_balance_snapshots FOR INSERT
WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update TB snapshots in their organization"
ON public.trial_balance_snapshots FOR UPDATE
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete TB snapshots in their organization"
ON public.trial_balance_snapshots FOR DELETE
USING (user_has_organization_access(organization_id));

-- RLS Policies for tb_account_mappings
CREATE POLICY "Users can view TB mappings in their organization"
ON public.tb_account_mappings FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage TB mappings in their organization"
ON public.tb_account_mappings FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- RLS Policies for workpaper_category_mappings
CREATE POLICY "Users can view category mappings in their organization"
ON public.workpaper_category_mappings FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins can manage category mappings"
ON public.workpaper_category_mappings FOR ALL
USING (user_has_organization_access(organization_id) AND (has_organization_role('owner') OR has_organization_role('admin')));

-- Seed default workpaper category mappings for UK accounting
INSERT INTO public.workpaper_category_mappings (organization_id, mapping_type, account_type, account_subtype, workpaper_category, workpaper_subcategory, is_default, priority)
SELECT 
  o.id,
  m.mapping_type,
  m.account_type,
  m.account_subtype,
  m.workpaper_category,
  m.workpaper_subcategory,
  true,
  m.priority
FROM public.organizations o
CROSS JOIN (VALUES
  -- Company Accounts / CT600 mappings
  ('company_accounts', 'INCOME', 'SALES', 'Turnover', 'Sales Revenue', 1),
  ('company_accounts', 'INCOME', 'OTHER_INCOME', 'Other Income', 'Miscellaneous', 2),
  ('company_accounts', 'EXPENSE', 'COST_OF_SALES', 'Cost of Sales', 'Direct Costs', 3),
  ('company_accounts', 'EXPENSE', 'OVERHEAD', 'Administrative Expenses', 'General', 4),
  ('company_accounts', 'EXPENSE', 'FINANCE', 'Finance Costs', 'Interest', 5),
  ('company_accounts', 'ASSET', 'FIXED_ASSET', 'Fixed Assets', 'Tangible Assets', 6),
  ('company_accounts', 'ASSET', 'CURRENT_ASSET', 'Current Assets', 'General', 7),
  ('company_accounts', 'LIABILITY', 'CURRENT_LIABILITY', 'Current Liabilities', 'General', 8),
  ('company_accounts', 'LIABILITY', 'LONG_TERM_LIABILITY', 'Long Term Liabilities', 'Loans', 9),
  ('company_accounts', 'EQUITY', 'EQUITY', 'Capital and Reserves', 'Share Capital', 10),
  ('company_accounts', 'EQUITY', 'RETAINED_EARNINGS', 'Capital and Reserves', 'Retained Earnings', 11),
  -- VAT Return mappings
  ('vat_return', 'INCOME', 'SALES', 'VAT Outputs', 'Standard Rate', 1),
  ('vat_return', 'EXPENSE', 'OVERHEAD', 'VAT Inputs', 'Recoverable', 2),
  ('vat_return', 'LIABILITY', 'CURRENT_LIABILITY', 'VAT Control', 'Net VAT', 3)
) AS m(mapping_type, account_type, account_subtype, workpaper_category, workpaper_subcategory, priority);

-- Create index for performance
CREATE INDEX idx_tb_snapshots_entity ON public.trial_balance_snapshots(organization_id, client_id, company_id, period_end);
CREATE INDEX idx_tb_snapshots_status ON public.trial_balance_snapshots(status);
CREATE INDEX idx_tb_mappings_entity ON public.tb_account_mappings(organization_id, client_id, company_id);
