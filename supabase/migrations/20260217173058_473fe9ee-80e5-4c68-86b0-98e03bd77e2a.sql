
-- Partnership allocations: stores per-partner profit shares computed from partnership return
CREATE TABLE public.partnership_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  filing_id UUID NOT NULL REFERENCES public.filings(id),
  partner_client_id UUID REFERENCES public.clients(id),
  partner_name TEXT NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'percentage' CHECK (allocation_method IN ('percentage', 'fixed', 'special')),
  percentage NUMERIC,
  fixed_amount NUMERIC,
  special_allocation_json JSONB DEFAULT '{}',
  computed_profit_share NUMERIC NOT NULL DEFAULT 0,
  computed_tax_adjustments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.partnership_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view partnership allocations for their org"
  ON public.partnership_allocations FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert partnership allocations for their org"
  ON public.partnership_allocations FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update partnership allocations for their org"
  ON public.partnership_allocations FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete partnership allocations for their org"
  ON public.partnership_allocations FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

-- Add FK from filings to partnership_allocations for individual SA returns receiving a partner share
ALTER TABLE public.filings ADD COLUMN partnership_allocation_id UUID REFERENCES public.partnership_allocations(id);

-- Index for lookups
CREATE INDEX idx_partnership_allocations_filing_id ON public.partnership_allocations(filing_id);
CREATE INDEX idx_partnership_allocations_partner_client_id ON public.partnership_allocations(partner_client_id);
CREATE INDEX idx_filings_partnership_allocation_id ON public.filings(partnership_allocation_id);
