
-- =============================================
-- Phase 1: SA Rate Tables + CA Rate Tables + Audit Log Enhancement
-- =============================================

-- 1. SA Rate Tables — all SA tax parameters by tax year
CREATE TABLE IF NOT EXISTS public.sa_rate_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tax_year TEXT NOT NULL,              -- e.g. '2024/25'
  effective_from DATE NOT NULL,
  effective_to DATE,
  -- Income tax bands
  personal_allowance NUMERIC NOT NULL DEFAULT 0,
  taper_threshold NUMERIC NOT NULL DEFAULT 0,
  basic_rate_limit NUMERIC NOT NULL DEFAULT 0,
  higher_rate_limit NUMERIC NOT NULL DEFAULT 0,
  basic_rate NUMERIC NOT NULL DEFAULT 0,
  higher_rate NUMERIC NOT NULL DEFAULT 0,
  additional_rate NUMERIC NOT NULL DEFAULT 0,
  -- Dividend rates
  dividend_allowance NUMERIC NOT NULL DEFAULT 0,
  dividend_basic_rate NUMERIC NOT NULL DEFAULT 0,
  dividend_higher_rate NUMERIC NOT NULL DEFAULT 0,
  dividend_additional_rate NUMERIC NOT NULL DEFAULT 0,
  -- Savings / PSA
  savings_nil_rate_basic NUMERIC NOT NULL DEFAULT 0,
  savings_nil_rate_higher NUMERIC NOT NULL DEFAULT 0,
  -- NIC Class 2
  class2_threshold NUMERIC NOT NULL DEFAULT 0,
  class2_weekly_rate NUMERIC NOT NULL DEFAULT 0,
  -- NIC Class 4
  class4_lower_limit NUMERIC NOT NULL DEFAULT 0,
  class4_upper_limit NUMERIC NOT NULL DEFAULT 0,
  class4_main_rate NUMERIC NOT NULL DEFAULT 0,
  class4_additional_rate NUMERIC NOT NULL DEFAULT 0,
  -- CGT
  cgt_basic_rate NUMERIC NOT NULL DEFAULT 0,
  cgt_higher_rate NUMERIC NOT NULL DEFAULT 0,
  cgt_residential_basic NUMERIC NOT NULL DEFAULT 0,
  cgt_residential_higher NUMERIC NOT NULL DEFAULT 0,
  cgt_annual_exempt_amount NUMERIC NOT NULL DEFAULT 0,
  -- Student loans
  student_loan_plan1_threshold NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan2_threshold NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan4_threshold NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan5_threshold NUMERIC NOT NULL DEFAULT 0,
  student_loan_pg_threshold NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan1_rate NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan2_rate NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan4_rate NUMERIC NOT NULL DEFAULT 0,
  student_loan_plan5_rate NUMERIC NOT NULL DEFAULT 0,
  student_loan_pg_rate NUMERIC NOT NULL DEFAULT 0,
  -- Marriage allowance
  marriage_allowance_amount NUMERIC NOT NULL DEFAULT 0,
  -- HICBC
  hicbc_threshold NUMERIC NOT NULL DEFAULT 0,
  hicbc_upper_threshold NUMERIC NOT NULL DEFAULT 0,
  -- Pension
  pension_annual_allowance NUMERIC NOT NULL DEFAULT 0,
  pension_taper_threshold NUMERIC NOT NULL DEFAULT 0,
  pension_taper_floor NUMERIC NOT NULL DEFAULT 0,
  pension_mpaa NUMERIC NOT NULL DEFAULT 0,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tax_year, effective_from)
);

ALTER TABLE public.sa_rate_tables ENABLE ROW LEVEL SECURITY;

-- SA rate tables are read-only reference data, readable by all authenticated users
CREATE POLICY "SA rate tables are readable by authenticated users"
  ON public.sa_rate_tables FOR SELECT
  TO authenticated
  USING (true);

-- 2. CA Rate Tables — capital allowances rates by effective date
CREATE TABLE IF NOT EXISTS public.ca_rate_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  effective_from DATE NOT NULL,
  effective_to DATE,
  -- AIA
  aia_limit NUMERIC NOT NULL DEFAULT 0,
  -- WDA rates
  wda_main_rate NUMERIC NOT NULL DEFAULT 0,
  wda_special_rate NUMERIC NOT NULL DEFAULT 0,
  -- Full expensing
  full_expensing_available BOOLEAN NOT NULL DEFAULT false,
  full_expensing_rate NUMERIC NOT NULL DEFAULT 0,
  -- FYA
  fya_50_rate NUMERIC NOT NULL DEFAULT 0,
  fya_zero_emission_rate NUMERIC NOT NULL DEFAULT 0,
  -- Car CO2 thresholds
  car_zero_emission_threshold NUMERIC NOT NULL DEFAULT 0,
  car_low_emission_max NUMERIC NOT NULL DEFAULT 0,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(effective_from)
);

ALTER TABLE public.ca_rate_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CA rate tables are readable by authenticated users"
  ON public.ca_rate_tables FOR SELECT
  TO authenticated
  USING (true);

-- 3. Add reason column to audit_log (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'reason'
  ) THEN
    ALTER TABLE public.audit_log ADD COLUMN reason TEXT;
  END IF;
END $$;

-- 4. Seed SA rates for 2023/24
INSERT INTO public.sa_rate_tables (
  tax_year, effective_from, effective_to,
  personal_allowance, taper_threshold, basic_rate_limit, higher_rate_limit,
  basic_rate, higher_rate, additional_rate,
  dividend_allowance, dividend_basic_rate, dividend_higher_rate, dividend_additional_rate,
  savings_nil_rate_basic, savings_nil_rate_higher,
  class2_threshold, class2_weekly_rate,
  class4_lower_limit, class4_upper_limit, class4_main_rate, class4_additional_rate,
  cgt_basic_rate, cgt_higher_rate, cgt_residential_basic, cgt_residential_higher, cgt_annual_exempt_amount,
  student_loan_plan1_threshold, student_loan_plan2_threshold, student_loan_plan4_threshold,
  student_loan_plan5_threshold, student_loan_pg_threshold,
  student_loan_plan1_rate, student_loan_plan2_rate, student_loan_plan4_rate,
  student_loan_plan5_rate, student_loan_pg_rate,
  marriage_allowance_amount,
  hicbc_threshold, hicbc_upper_threshold,
  pension_annual_allowance, pension_taper_threshold, pension_taper_floor, pension_mpaa
) VALUES (
  '2023/24', '2023-04-06', '2024-04-05',
  12570, 100000, 37700, 125140,
  0.20, 0.40, 0.45,
  1000, 0.0875, 0.3375, 0.3935,
  1000, 500,
  12570, 3.45,
  12570, 50270, 0.09, 0.02,
  0.10, 0.20, 0.18, 0.28, 6000,
  22015, 27295, 27660,
  25000, 21000,
  0.09, 0.09, 0.09,
  0.09, 0.06,
  1260,
  50000, 60000,
  60000, 260000, 10000, 10000
);

-- 5. Seed SA rates for 2024/25
INSERT INTO public.sa_rate_tables (
  tax_year, effective_from, effective_to,
  personal_allowance, taper_threshold, basic_rate_limit, higher_rate_limit,
  basic_rate, higher_rate, additional_rate,
  dividend_allowance, dividend_basic_rate, dividend_higher_rate, dividend_additional_rate,
  savings_nil_rate_basic, savings_nil_rate_higher,
  class2_threshold, class2_weekly_rate,
  class4_lower_limit, class4_upper_limit, class4_main_rate, class4_additional_rate,
  cgt_basic_rate, cgt_higher_rate, cgt_residential_basic, cgt_residential_higher, cgt_annual_exempt_amount,
  student_loan_plan1_threshold, student_loan_plan2_threshold, student_loan_plan4_threshold,
  student_loan_plan5_threshold, student_loan_pg_threshold,
  student_loan_plan1_rate, student_loan_plan2_rate, student_loan_plan4_rate,
  student_loan_plan5_rate, student_loan_pg_rate,
  marriage_allowance_amount,
  hicbc_threshold, hicbc_upper_threshold,
  pension_annual_allowance, pension_taper_threshold, pension_taper_floor, pension_mpaa
) VALUES (
  '2024/25', '2024-04-06', '2025-04-05',
  12570, 100000, 37700, 125140,
  0.20, 0.40, 0.45,
  500, 0.0875, 0.3375, 0.3935,
  1000, 500,
  12570, 3.45,
  12570, 50270, 0.06, 0.02,
  0.10, 0.20, 0.18, 0.28, 3000,
  22015, 27295, 27660,
  25000, 21000,
  0.09, 0.09, 0.09,
  0.09, 0.06,
  1260,
  60000, 80000,
  60000, 260000, 10000, 10000
);

-- 6. Seed CA rates — pre-2023 and post-2023
INSERT INTO public.ca_rate_tables (
  effective_from, effective_to,
  aia_limit, wda_main_rate, wda_special_rate,
  full_expensing_available, full_expensing_rate, fya_50_rate, fya_zero_emission_rate,
  car_zero_emission_threshold, car_low_emission_max
) VALUES
(
  '2021-01-01', '2023-03-31',
  1000000, 0.18, 0.06,
  false, 0, 0, 1.0,
  0, 50
),
(
  '2023-04-01', NULL,
  1000000, 0.18, 0.06,
  true, 1.0, 0.5, 1.0,
  0, 50
);
