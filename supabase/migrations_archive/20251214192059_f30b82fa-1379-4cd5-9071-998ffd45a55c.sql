-- Create CT rate tables for date-based rate lookup
CREATE TABLE public.ct_rate_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  effective_from DATE NOT NULL,
  effective_to DATE,
  main_rate NUMERIC(5,4) NOT NULL,
  small_profits_rate NUMERIC(5,4) NOT NULL,
  lower_limit NUMERIC(12,2) NOT NULL,
  upper_limit NUMERIC(12,2) NOT NULL,
  marginal_relief_fraction NUMERIC(10,6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ct_rate_tables_date_range_check CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Enable RLS
ALTER TABLE public.ct_rate_tables ENABLE ROW LEVEL SECURITY;

-- Read-only policy for authenticated users (rates are system-wide)
CREATE POLICY "Authenticated users can read CT rates"
  ON public.ct_rate_tables
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed FY23-24 rates (April 2023 onwards - 25% main rate era)
INSERT INTO public.ct_rate_tables (effective_from, effective_to, main_rate, small_profits_rate, lower_limit, upper_limit, marginal_relief_fraction)
VALUES 
  ('2023-04-01', NULL, 0.25, 0.19, 50000, 250000, 0.015),
  ('2015-04-01', '2023-03-31', 0.19, 0.19, 0, 0, 0);

-- Add associated_companies_count to CT computation snapshots (required field)
ALTER TABLE public.ct_computation_snapshots 
  ADD COLUMN IF NOT EXISTS associated_companies_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjusted_lower_limit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS adjusted_upper_limit NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS short_period_factor NUMERIC(6,4) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS marginal_relief_fraction NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS marginal_relief_amount NUMERIC(12,2) DEFAULT 0;

-- Add amendment tracking to filings table
ALTER TABLE public.filings
  ADD COLUMN IF NOT EXISTS is_amendment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_filing_id UUID REFERENCES public.filings(id),
  ADD COLUMN IF NOT EXISTS amendment_reason TEXT;

-- Create index for rate lookups
CREATE INDEX idx_ct_rate_tables_effective ON public.ct_rate_tables (effective_from, effective_to);