-- Phase 3E: VAT Schemes Support
-- Create vat_registrations table with scheme history

CREATE TABLE IF NOT EXISTS public.vat_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  vrn TEXT NOT NULL,
  scheme TEXT NOT NULL DEFAULT 'STANDARD' CHECK (scheme IN ('STANDARD', 'CASH_ACCOUNTING', 'FLAT_RATE', 'ANNUAL_ACCOUNTING')),
  
  -- Flat Rate Scheme settings
  flat_rate_percentage DECIMAL(5,2),
  flat_rate_trade_sector TEXT,
  flat_rate_first_year_discount BOOLEAN DEFAULT false, -- 1% discount in first year
  
  -- Cash Accounting settings
  cash_scheme_joined_at DATE,
  cash_scheme_threshold DECIMAL(15,2) DEFAULT 1350000, -- £1.35m threshold
  
  -- Annual Accounting settings
  annual_accounting_joined_at DATE,
  annual_accounting_payment_schedule TEXT CHECK (annual_accounting_payment_schedule IN ('MONTHLY', 'QUARTERLY')),
  
  -- Partial Exemption (can apply to any scheme)
  partial_exemption_applicable BOOLEAN DEFAULT false,
  partial_exemption_rate DECIMAL(5,4), -- e.g., 0.8500 = 85% recovery
  partial_exemption_method TEXT DEFAULT 'STANDARD' CHECK (partial_exemption_method IN ('STANDARD', 'SPECIAL')),
  
  -- Effective dates for scheme history
  effective_from DATE NOT NULL,
  effective_to DATE, -- NULL means currently active
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  
  CONSTRAINT vat_registrations_entity_check CHECK (
    (company_id IS NOT NULL AND client_id IS NULL) OR
    (company_id IS NULL AND client_id IS NOT NULL)
  )
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vat_registrations_company ON public.vat_registrations(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vat_registrations_client ON public.vat_registrations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vat_registrations_effective ON public.vat_registrations(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_vat_registrations_org ON public.vat_registrations(organization_id);

-- RLS policies
ALTER TABLE public.vat_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view VAT registrations in their organization"
ON public.vat_registrations FOR SELECT
USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can create VAT registrations in their organization"
ON public.vat_registrations FOR INSERT
WITH CHECK (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can update VAT registrations in their organization"
ON public.vat_registrations FOR UPDATE
USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can delete VAT registrations in their organization"
ON public.vat_registrations FOR DELETE
USING (public.user_in_organization(auth.uid(), organization_id));

-- Update trigger
CREATE TRIGGER update_vat_registrations_updated_at
  BEFORE UPDATE ON public.vat_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add payment tracking fields to ledger_entries if not present
ALTER TABLE public.ledger_entries 
  ADD COLUMN IF NOT EXISTS paid_at DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PART_PAID', 'PAID')),
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0;

-- Add payment tracking to invoice_lines and bill_lines
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS paid_at DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PART_PAID', 'PAID')),
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_vat_recognised DECIMAL(15,2) DEFAULT 0;

ALTER TABLE public.bill_lines
  ADD COLUMN IF NOT EXISTS paid_at DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PART_PAID', 'PAID')),
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_vat_recognised DECIMAL(15,2) DEFAULT 0;

-- Update vat_periods to include scheme parameters snapshot
ALTER TABLE public.vat_periods
  ADD COLUMN IF NOT EXISTS scheme_parameters JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vat_registration_id UUID REFERENCES public.vat_registrations(id),
  ADD COLUMN IF NOT EXISTS cash_excluded_vat DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_included_vat DECIMAL(15,2) DEFAULT 0;

-- Function to get active VAT registration for an entity at a given date
CREATE OR REPLACE FUNCTION public.get_active_vat_registration(
  p_entity_id UUID,
  p_entity_type TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.vat_registrations
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT *
  FROM public.vat_registrations
  WHERE (
    (p_entity_type = 'company' AND company_id = p_entity_id) OR
    (p_entity_type = 'client' AND client_id = p_entity_id)
  )
  AND effective_from <= p_as_of_date
  AND (effective_to IS NULL OR effective_to >= p_as_of_date)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- Function to calculate cash accounting VAT proportion
CREATE OR REPLACE FUNCTION public.calculate_cash_vat_proportion(
  p_net_amount DECIMAL,
  p_vat_amount DECIMAL,
  p_paid_amount DECIMAL,
  p_gross_amount DECIMAL
)
RETURNS DECIMAL
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN p_gross_amount = 0 THEN 0
    ELSE (p_paid_amount / p_gross_amount) * p_vat_amount
  END;
$$;