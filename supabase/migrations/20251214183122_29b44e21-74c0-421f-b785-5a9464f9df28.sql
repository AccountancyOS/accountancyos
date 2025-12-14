-- Fixed Assets Register
CREATE TABLE public.fixed_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  asset_category TEXT NOT NULL,
  acquisition_date DATE NOT NULL,
  brought_into_use_date DATE,
  disposal_date DATE,
  cost NUMERIC(15,2) NOT NULL,
  disposal_proceeds NUMERIC(15,2),
  supplier TEXT,
  invoice_reference TEXT,
  attachment_path TEXT,
  default_pool_type TEXT NOT NULL DEFAULT 'MAIN' CHECK (default_pool_type IN ('MAIN', 'SPECIAL_RATE', 'SINGLE_ASSET')),
  is_car BOOLEAN NOT NULL DEFAULT false,
  car_co2_g_km INTEGER,
  car_list_price NUMERIC(15,2),
  car_is_electric BOOLEAN DEFAULT false,
  business_use_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (business_use_percentage >= 0 AND business_use_percentage <= 100),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Fixed Asset Transactions
CREATE TABLE public.fixed_asset_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fixed_asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  accounting_period_start DATE NOT NULL,
  accounting_period_end DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('ADDITION', 'DISPOSAL', 'ADJUSTMENT', 'TRANSFER')),
  amount_net NUMERIC(15,2) NOT NULL,
  disposal_proceeds NUMERIC(15,2),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Capital Allowance Periods
CREATE TABLE public.capital_allowance_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  short_period_factor NUMERIC(10,6) NOT NULL DEFAULT 1.0,
  aia_limit_for_period NUMERIC(15,2) NOT NULL DEFAULT 1000000,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'approved', 'filed')),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_start, period_end)
);

-- Capital Allowance Pools
CREATE TABLE public.capital_allowance_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cap_period_id UUID NOT NULL REFERENCES public.capital_allowance_periods(id) ON DELETE CASCADE,
  pool_type TEXT NOT NULL CHECK (pool_type IN ('MAIN', 'SPECIAL_RATE', 'SINGLE_ASSET')),
  pool_name TEXT,
  opening_wdv NUMERIC(15,2) NOT NULL DEFAULT 0,
  additions NUMERIC(15,2) NOT NULL DEFAULT 0,
  disposals NUMERIC(15,2) NOT NULL DEFAULT 0,
  aia_claimed NUMERIC(15,2) NOT NULL DEFAULT 0,
  fya_claimed NUMERIC(15,2) NOT NULL DEFAULT 0,
  full_expensing_claimed NUMERIC(15,2) NOT NULL DEFAULT 0,
  wda_claimed NUMERIC(15,2) NOT NULL DEFAULT 0,
  closing_wdv NUMERIC(15,2) NOT NULL DEFAULT 0,
  balancing_charge NUMERIC(15,2) NOT NULL DEFAULT 0,
  balancing_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  wda_rate NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cap_period_id, pool_type, pool_name)
);

-- Capital Allowance Claims (line-level auditability)
CREATE TABLE public.capital_allowance_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cap_period_id UUID NOT NULL REFERENCES public.capital_allowance_periods(id) ON DELETE CASCADE,
  pool_id UUID REFERENCES public.capital_allowance_pools(id) ON DELETE CASCADE,
  fixed_asset_id UUID REFERENCES public.fixed_assets(id) ON DELETE SET NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('AIA', 'WDA', 'FYA_100', 'FYA_50', 'FULL_EXPENSING', 'BALANCING_ALLOWANCE', 'BALANCING_CHARGE')),
  amount NUMERIC(15,2) NOT NULL,
  rule_basis JSONB DEFAULT '{}',
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CT Computation Snapshots
CREATE TABLE public.ct_computation_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  accounts_snapshot_id UUID NOT NULL,
  cap_period_id UUID REFERENCES public.capital_allowance_periods(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  accounting_profit NUMERIC(15,2) NOT NULL,
  add_backs JSONB NOT NULL DEFAULT '{}',
  deductions JSONB NOT NULL DEFAULT '{}',
  total_capital_allowances NUMERIC(15,2) NOT NULL DEFAULT 0,
  balancing_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_total_profits NUMERIC(15,2) NOT NULL,
  corporation_tax_rate NUMERIC(5,4) NOT NULL,
  marginal_relief NUMERIC(15,2) NOT NULL DEFAULT 0,
  corporation_tax_due NUMERIC(15,2) NOT NULL,
  pools_summary JSONB NOT NULL DEFAULT '[]',
  claims_summary JSONB NOT NULL DEFAULT '[]',
  snapshot_hash TEXT NOT NULL,
  generator_version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'submitted', 'accepted', 'rejected')),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Accounts Model Snapshots (FRS 105)
CREATE TABLE public.accounts_model_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workpaper_instance_id UUID,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  balance_sheet JSONB NOT NULL,
  notes JSONB NOT NULL DEFAULT '{}',
  director_approval JSONB NOT NULL DEFAULT '{}',
  snapshot_hash TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL DEFAULT 'FRS105-2022',
  generator_version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'submitted', 'accepted', 'rejected')),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Filing Artefacts
CREATE TABLE public.filing_artefacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  artefact_type TEXT NOT NULL CHECK (artefact_type IN ('IXBRL_ACCOUNTS', 'IXBRL_CT_COMPUTATION', 'CT600_XML', 'CH_ACCOUNTS_XML', 'PDF_ACCOUNTS', 'PDF_CT_COMPUTATION')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  taxonomy_version TEXT,
  generator_version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_allowance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_allowance_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_allowance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_computation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_model_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_artefacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage fixed assets in their organization" ON public.fixed_assets
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage fixed asset transactions in their organization" ON public.fixed_asset_transactions
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage capital allowance periods in their organization" ON public.capital_allowance_periods
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage capital allowance pools in their organization" ON public.capital_allowance_pools
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage capital allowance claims in their organization" ON public.capital_allowance_claims
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage CT computation snapshots in their organization" ON public.ct_computation_snapshots
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage accounts model snapshots in their organization" ON public.accounts_model_snapshots
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage filing artefacts in their organization" ON public.filing_artefacts
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

-- Indexes
CREATE INDEX idx_fixed_assets_company ON public.fixed_assets(company_id);
CREATE INDEX idx_fixed_assets_org ON public.fixed_assets(organization_id);
CREATE INDEX idx_fixed_asset_transactions_asset ON public.fixed_asset_transactions(fixed_asset_id);
CREATE INDEX idx_cap_periods_company ON public.capital_allowance_periods(company_id);
CREATE INDEX idx_cap_pools_period ON public.capital_allowance_pools(cap_period_id);
CREATE INDEX idx_cap_claims_period ON public.capital_allowance_claims(cap_period_id);
CREATE INDEX idx_ct_snapshots_company ON public.ct_computation_snapshots(company_id);
CREATE INDEX idx_accounts_snapshots_company ON public.accounts_model_snapshots(company_id);
CREATE INDEX idx_filing_artefacts_filing ON public.filing_artefacts(filing_id);

-- Triggers for updated_at
CREATE TRIGGER update_fixed_assets_updated_at BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cap_periods_updated_at BEFORE UPDATE ON public.capital_allowance_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cap_pools_updated_at BEFORE UPDATE ON public.capital_allowance_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();