-- Phase 3C: VAT Engine Data Model
-- Complete VAT computation infrastructure with all UK schemes, partial exemption, and full audit trail

-- 1. Enhance vat_codes table with HMRC box mappings and comprehensive type system
ALTER TABLE public.vat_codes 
ADD COLUMN IF NOT EXISTS scheme_type TEXT DEFAULT 'STANDARD',
ADD COLUMN IF NOT EXISTS hmrc_box_mapping JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS net_included_in_boxes INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN IF NOT EXISTS vat_included_in_boxes INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN IF NOT EXISTS is_reclaimable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS jurisdiction TEXT DEFAULT 'UK',
ADD COLUMN IF NOT EXISTS supply_category TEXT DEFAULT 'GOODS_AND_SERVICES',
ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partial_exemption_applicable BOOLEAN DEFAULT false;

-- Add CHECK constraints for new enum-like columns
ALTER TABLE public.vat_codes
ADD CONSTRAINT chk_vat_code_scheme_type CHECK (
  scheme_type IN ('STANDARD', 'FLAT_RATE', 'CASH_ACCOUNTING', 'ANNUAL_ACCOUNTING')
),
ADD CONSTRAINT chk_vat_code_jurisdiction CHECK (
  jurisdiction IN ('UK', 'EU', 'NON_EU', 'OVERSEAS')
),
ADD CONSTRAINT chk_vat_code_supply_category CHECK (
  supply_category IN ('GOODS', 'SERVICES', 'GOODS_AND_SERVICES')
);

-- 2. Enhance ledger_entries with comprehensive VAT fields
ALTER TABLE public.ledger_entries
ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS gross_amount DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS jurisdiction TEXT DEFAULT 'UK',
ADD COLUMN IF NOT EXISTS supply_category TEXT DEFAULT 'GOODS_AND_SERVICES',
ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vat_period_lock BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vat_period_id UUID;

-- 3. Create vat_periods table
CREATE TABLE IF NOT EXISTS public.vat_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  vrn TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_key TEXT, -- HMRC period key, null if not from obligations
  status TEXT NOT NULL DEFAULT 'OPEN',
  vat_scheme TEXT NOT NULL DEFAULT 'STANDARD',
  
  -- Partial exemption tracking
  partial_exemption_applicable BOOLEAN DEFAULT false,
  partial_exemption_rate DECIMAL(5,4), -- e.g., 0.8500 = 85% recovery
  
  -- Flat rate scheme tracking
  flat_rate_percentage DECIMAL(5,2),
  flat_rate_category TEXT,
  
  -- Cash accounting tracking
  cash_accounting_enabled BOOLEAN DEFAULT false,
  
  -- Computed totals (cached for performance)
  computed_box1 DECIMAL(15,2),
  computed_box2 DECIMAL(15,2),
  computed_box3 DECIMAL(15,2),
  computed_box4 DECIMAL(15,2),
  computed_box5 DECIMAL(15,2),
  computed_box6 DECIMAL(15,2),
  computed_box7 DECIMAL(15,2),
  computed_box8 DECIMAL(15,2),
  computed_box9 DECIMAL(15,2),
  
  -- Reconciliation
  control_account_balance DECIMAL(15,2),
  reconciliation_difference DECIMAL(15,2),
  reconciliation_status TEXT DEFAULT 'PENDING',
  
  -- Audit
  generated_at TIMESTAMPTZ,
  finalised_at TIMESTAMPTZ,
  finalised_by UUID,
  workpaper_instance_id UUID,
  filing_id UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_vat_period_entity CHECK (
    (company_id IS NOT NULL AND client_id IS NULL) OR
    (company_id IS NULL AND client_id IS NOT NULL)
  ),
  CONSTRAINT chk_vat_period_status CHECK (
    status IN ('OPEN', 'CALCULATING', 'READY_FOR_REVIEW', 'FINALISING', 'FINALISED', 'FILED', 'AMENDED')
  ),
  CONSTRAINT chk_vat_period_scheme CHECK (
    vat_scheme IN ('STANDARD', 'FLAT_RATE', 'CASH_ACCOUNTING', 'ANNUAL_ACCOUNTING')
  ),
  CONSTRAINT chk_vat_period_reconciliation CHECK (
    reconciliation_status IN ('PENDING', 'MATCHED', 'WARNING', 'MISMATCH')
  )
);

-- Unique constraint on period per entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_vat_periods_unique 
ON vat_periods (organization_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), 
                COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end);

-- 4. Create vat_period_lines table for pre-aggregated reporting
CREATE TABLE IF NOT EXISTS public.vat_period_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_period_id UUID NOT NULL REFERENCES public.vat_periods(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vat_code_id UUID REFERENCES public.vat_codes(id),
  vat_code TEXT NOT NULL,
  vat_rate DECIMAL(5,2) NOT NULL,
  vat_type TEXT NOT NULL,
  
  -- Aggregated totals
  net_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  vat_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  gross_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  
  -- Box contributions (before adjustments)
  box1_contribution DECIMAL(15,2) DEFAULT 0,
  box2_contribution DECIMAL(15,2) DEFAULT 0,
  box4_contribution DECIMAL(15,2) DEFAULT 0,
  box6_contribution DECIMAL(15,2) DEFAULT 0,
  box7_contribution DECIMAL(15,2) DEFAULT 0,
  box8_contribution DECIMAL(15,2) DEFAULT 0,
  box9_contribution DECIMAL(15,2) DEFAULT 0,
  
  -- Partial exemption adjustments
  partial_exemption_disallowed DECIMAL(15,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vat_period_lines_period ON vat_period_lines(vat_period_id);

-- 5. Create vat_adjustments table
CREATE TABLE IF NOT EXISTS public.vat_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_period_id UUID NOT NULL REFERENCES public.vat_periods(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  adjustment_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  
  -- Adjustment amounts
  net_adjustment DECIMAL(15,2) DEFAULT 0,
  vat_adjustment DECIMAL(15,2) DEFAULT 0,
  
  -- Which boxes this affects
  boxes_affected INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  box_adjustments JSONB DEFAULT '{}', -- {1: 100.00, 4: -50.00, etc.}
  
  -- Supporting documentation
  supporting_document_id UUID,
  
  -- Audit
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_vat_adjustment_type CHECK (
    adjustment_type IN (
      'BAD_DEBT_RELIEF',
      'PARTIAL_EXEMPTION',
      'FUEL_SCALE_CHARGE',
      'CAPITAL_GOODS_SCHEME',
      'PRIOR_PERIOD_CORRECTION',
      'MANUAL_CORRECTION',
      'FLAT_RATE_ADJUSTMENT',
      'CASH_ACCOUNTING_TIMING',
      'OTHER'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_vat_adjustments_period ON vat_adjustments(vat_period_id);

-- 6. Create vat_transaction_links table for full traceability
CREATE TABLE IF NOT EXISTS public.vat_transaction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_period_id UUID NOT NULL REFERENCES public.vat_periods(id) ON DELETE CASCADE,
  vat_period_line_id UUID REFERENCES public.vat_period_lines(id) ON DELETE CASCADE,
  
  -- Source transaction reference
  source_type TEXT NOT NULL, -- 'ledger_entry', 'invoice_line', 'bill_line', 'bank_split'
  source_id UUID NOT NULL,
  source_table TEXT NOT NULL,
  
  -- Transaction details at time of inclusion
  transaction_date DATE NOT NULL,
  net_amount DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2) NOT NULL,
  vat_code_id UUID,
  vat_code TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_vat_link_source_type CHECK (
    source_type IN ('ledger_entry', 'invoice_line', 'bill_line', 'bank_split', 'journal_line')
  )
);

CREATE INDEX IF NOT EXISTS idx_vat_transaction_links_period ON vat_transaction_links(vat_period_id);
CREATE INDEX IF NOT EXISTS idx_vat_transaction_links_source ON vat_transaction_links(source_type, source_id);

-- 7. Add foreign key from ledger_entries to vat_periods
ALTER TABLE public.ledger_entries
ADD CONSTRAINT fk_ledger_entries_vat_period 
FOREIGN KEY (vat_period_id) REFERENCES public.vat_periods(id) ON DELETE SET NULL;

-- 8. Create comprehensive UK tax codes with HMRC box mappings
-- First, add new codes that may not exist
INSERT INTO public.vat_codes (organization_id, code, description, rate, vat_type, hmrc_box_mapping, net_included_in_boxes, vat_included_in_boxes, is_reclaimable, jurisdiction, supply_category, reverse_charge)
SELECT 
  o.id,
  codes.code,
  codes.description,
  codes.rate,
  codes.vat_type,
  codes.hmrc_box_mapping::jsonb,
  codes.net_included_in_boxes,
  codes.vat_included_in_boxes,
  codes.is_reclaimable,
  codes.jurisdiction,
  codes.supply_category,
  codes.reverse_charge
FROM public.organizations o
CROSS JOIN (VALUES
  -- Standard output codes
  ('T1', 'Standard Rate 20% Output', 20.00, 'OUTPUT', '{"box1": true, "box6": true}', ARRAY[6], ARRAY[1], false, 'UK', 'GOODS_AND_SERVICES', false),
  ('T2', 'Reduced Rate 5% Output', 5.00, 'OUTPUT', '{"box1": true, "box6": true}', ARRAY[6], ARRAY[1], false, 'UK', 'GOODS_AND_SERVICES', false),
  ('T0', 'Zero Rated Output', 0.00, 'ZERO', '{"box6": true}', ARRAY[6], ARRAY[]::INTEGER[], false, 'UK', 'GOODS_AND_SERVICES', false),
  ('T9', 'Exempt', 0.00, 'EXEMPT', '{"box6": true}', ARRAY[6], ARRAY[]::INTEGER[], false, 'UK', 'GOODS_AND_SERVICES', false),
  
  -- Standard input codes
  ('T20', 'Standard Rate 20% Input', 20.00, 'INPUT', '{"box4": true, "box7": true}', ARRAY[7], ARRAY[4], true, 'UK', 'GOODS_AND_SERVICES', false),
  ('T21', 'Reduced Rate 5% Input', 5.00, 'INPUT', '{"box4": true, "box7": true}', ARRAY[7], ARRAY[4], true, 'UK', 'GOODS_AND_SERVICES', false),
  ('T22', 'Zero Rated Input', 0.00, 'INPUT', '{"box7": true}', ARRAY[7], ARRAY[]::INTEGER[], true, 'UK', 'GOODS_AND_SERVICES', false),
  ('T23', 'Exempt Input', 0.00, 'INPUT', '{"box7": true}', ARRAY[7], ARRAY[]::INTEGER[], false, 'UK', 'GOODS_AND_SERVICES', false),
  
  -- Reverse charge codes
  ('RC_DOMESTIC', 'Domestic Reverse Charge', 20.00, 'REVERSE_CHARGE', '{"box1": true, "box4": true, "box6": true, "box7": true}', ARRAY[6,7], ARRAY[1,4], true, 'UK', 'SERVICES', true),
  ('RC_CIS', 'CIS Reverse Charge', 20.00, 'REVERSE_CHARGE', '{"box1": true, "box4": true, "box6": true, "box7": true}', ARRAY[6,7], ARRAY[1,4], true, 'UK', 'SERVICES', true),
  
  -- EC/EU codes (post-Brexit for NI protocol)
  ('EC_GOODS_IN', 'EC Goods Acquisition', 20.00, 'EC_ACQUISITION', '{"box2": true, "box4": true, "box7": true, "box9": true}', ARRAY[7,9], ARRAY[2,4], true, 'EU', 'GOODS', false),
  ('EC_GOODS_OUT', 'EC Goods Supply', 0.00, 'EC_SUPPLY', '{"box6": true, "box8": true}', ARRAY[6,8], ARRAY[]::INTEGER[], false, 'EU', 'GOODS', false),
  ('EC_SERVICES_IN', 'EC Services Received', 20.00, 'REVERSE_CHARGE', '{"box1": true, "box4": true, "box6": true, "box7": true}', ARRAY[6,7], ARRAY[1,4], true, 'EU', 'SERVICES', true),
  ('EC_SERVICES_OUT', 'EC Services Supplied', 0.00, 'EC_SUPPLY', '{"box6": true}', ARRAY[6], ARRAY[]::INTEGER[], false, 'EU', 'SERVICES', false),
  
  -- Out of scope
  ('OS', 'Outside Scope of VAT', 0.00, 'OUT_OF_SCOPE', '{}', ARRAY[]::INTEGER[], ARRAY[]::INTEGER[], false, 'UK', 'GOODS_AND_SERVICES', false),
  
  -- Non-business
  ('NB', 'Non-Business Income', 0.00, 'OUT_OF_SCOPE', '{}', ARRAY[]::INTEGER[], ARRAY[]::INTEGER[], false, 'UK', 'GOODS_AND_SERVICES', false)
) AS codes(code, description, rate, vat_type, hmrc_box_mapping, net_included_in_boxes, vat_included_in_boxes, is_reclaimable, jurisdiction, supply_category, reverse_charge)
WHERE NOT EXISTS (
  SELECT 1 FROM public.vat_codes vc 
  WHERE vc.organization_id = o.id AND vc.code = codes.code
)
ON CONFLICT DO NOTHING;

-- 9. RLS policies
ALTER TABLE public.vat_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_period_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_transaction_links ENABLE ROW LEVEL SECURITY;

-- VAT periods policies
CREATE POLICY "Users can view VAT periods in their organization"
ON public.vat_periods FOR SELECT
USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can insert VAT periods in their organization"
ON public.vat_periods FOR INSERT
WITH CHECK (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can update VAT periods in their organization"
ON public.vat_periods FOR UPDATE
USING (public.user_in_organization(auth.uid(), organization_id));

-- VAT period lines policies
CREATE POLICY "Users can view VAT period lines in their organization"
ON public.vat_period_lines FOR SELECT
USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage VAT period lines in their organization"
ON public.vat_period_lines FOR ALL
USING (public.user_in_organization(auth.uid(), organization_id));

-- VAT adjustments policies
CREATE POLICY "Users can view VAT adjustments in their organization"
ON public.vat_adjustments FOR SELECT
USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage VAT adjustments in their organization"
ON public.vat_adjustments FOR ALL
USING (public.user_in_organization(auth.uid(), organization_id));

-- VAT transaction links policies
CREATE POLICY "Users can view VAT transaction links"
ON public.vat_transaction_links FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.vat_periods vp 
  WHERE vp.id = vat_period_id 
  AND public.user_in_organization(auth.uid(), vp.organization_id)
));

CREATE POLICY "Users can manage VAT transaction links"
ON public.vat_transaction_links FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.vat_periods vp 
  WHERE vp.id = vat_period_id 
  AND public.user_in_organization(auth.uid(), vp.organization_id)
));

-- 10. Create trigger to update vat_periods.updated_at
CREATE OR REPLACE FUNCTION public.update_vat_periods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_vat_periods_updated_at ON public.vat_periods;
CREATE TRIGGER update_vat_periods_updated_at
BEFORE UPDATE ON public.vat_periods
FOR EACH ROW EXECUTE FUNCTION public.update_vat_periods_updated_at();