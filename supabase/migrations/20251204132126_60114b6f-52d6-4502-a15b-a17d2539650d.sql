
-- Phase 7.1: Payroll & CIS Database Schema (FIXED ORDER)
-- Following CTO guardrails: YTD derived from payslips, config in engagements.service_config,
-- linked_person_id for director linking, employee_benefits for P11D, employee_absences for SSP/SMP

-- =====================================================
-- PAYE SCHEMES
-- =====================================================
CREATE TABLE public.paye_schemes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  
  employer_paye_reference TEXT NOT NULL,
  accounts_office_reference TEXT,
  name TEXT NOT NULL,
  tax_year_start DATE NOT NULL DEFAULT (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '3 months' + INTERVAL '5 days')::DATE,
  
  default_pay_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (default_pay_frequency IN ('weekly', 'fortnightly', 'four_weekly', 'monthly')),
  default_pay_day INTEGER CHECK (default_pay_day BETWEEN 1 AND 31),
  default_pay_day_of_week TEXT CHECK (default_pay_day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  
  rti_sender_id TEXT,
  rti_password_hash TEXT,
  rti_test_mode BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT paye_schemes_entity_check CHECK (
    (company_id IS NOT NULL AND client_id IS NULL) OR
    (company_id IS NULL AND client_id IS NOT NULL)
  )
);

-- =====================================================
-- PENSION SCHEMES
-- =====================================================
CREATE TABLE public.pension_schemes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  paye_scheme_id UUID NOT NULL REFERENCES public.paye_schemes(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  employer_id TEXT,
  
  employee_contribution_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  employer_contribution_rate NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  
  auto_enrolment_enabled BOOLEAN DEFAULT true,
  staging_date DATE,
  postponement_period_months INTEGER DEFAULT 0 CHECK (postponement_period_months BETWEEN 0 AND 3),
  
  lower_qualifying_earnings NUMERIC(10,2) DEFAULT 6240.00,
  upper_qualifying_earnings NUMERIC(10,2) DEFAULT 50270.00,
  auto_enrolment_trigger NUMERIC(10,2) DEFAULT 10000.00,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- EMPLOYEES
-- =====================================================
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  paye_scheme_id UUID NOT NULL REFERENCES public.paye_schemes(id) ON DELETE CASCADE,
  linked_person_id UUID REFERENCES public.company_persons(id),
  portal_user_id UUID REFERENCES auth.users(id),
  
  title TEXT,
  first_name TEXT NOT NULL,
  middle_names TEXT,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'not_specified')),
  national_insurance_number TEXT,
  
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  address_line_3 TEXT,
  city TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  
  employee_reference TEXT,
  job_title TEXT,
  department TEXT,
  start_date DATE NOT NULL,
  leaving_date DATE,
  leaving_reason TEXT CHECK (leaving_reason IN ('resignation', 'redundancy', 'dismissal', 'retirement', 'death', 'transfer', 'other')),
  
  pay_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (pay_frequency IN ('weekly', 'fortnightly', 'four_weekly', 'monthly')),
  payment_method TEXT DEFAULT 'bacs' CHECK (payment_method IN ('bacs', 'cheque', 'cash')),
  
  bank_name TEXT,
  bank_sort_code TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  
  tax_code TEXT NOT NULL DEFAULT '1257L',
  tax_basis TEXT NOT NULL DEFAULT 'cumulative' CHECK (tax_basis IN ('cumulative', 'week1_month1')),
  is_scottish_taxpayer BOOLEAN DEFAULT false,
  is_welsh_taxpayer BOOLEAN DEFAULT false,
  
  nic_category TEXT NOT NULL DEFAULT 'A' CHECK (nic_category IN ('A', 'B', 'C', 'F', 'H', 'I', 'J', 'L', 'M', 'S', 'V', 'Z', 'X')),
  
  student_loan_plan TEXT CHECK (student_loan_plan IN ('plan_1', 'plan_2', 'plan_4', 'plan_5', 'postgrad', 'none')),
  
  pension_scheme_id UUID REFERENCES public.pension_schemes(id),
  pension_employee_rate_override NUMERIC(5,2),
  pension_employer_rate_override NUMERIC(5,2),
  pension_opt_out_date DATE,
  pension_auto_enrol_date DATE,
  
  is_director BOOLEAN DEFAULT false,
  director_nic_method TEXT DEFAULT 'annual' CHECK (director_nic_method IN ('annual', 'alternative')),
  directorship_start_date DATE,
  directorship_end_date DATE,
  
  starter_declaration TEXT CHECK (starter_declaration IN ('A', 'B', 'C')),
  p45_received BOOLEAN DEFAULT false,
  p45_leaving_date DATE,
  p45_tax_code TEXT,
  p45_total_pay NUMERIC(12,2),
  p45_total_tax NUMERIC(12,2),
  
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'left', 'pending')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- EMPLOYEE ABSENCES
-- =====================================================
CREATE TABLE public.employee_absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  
  absence_type TEXT NOT NULL CHECK (absence_type IN (
    'sickness', 'maternity', 'paternity', 'adoption', 'shared_parental',
    'parental_bereavement', 'holiday', 'unpaid', 'jury_service', 'other'
  )),
  
  start_date DATE NOT NULL,
  end_date DATE,
  expected_return_date DATE,
  
  waiting_days_served INTEGER DEFAULT 0,
  qualifying_days_pattern JSONB DEFAULT '["monday","tuesday","wednesday","thursday","friday"]'::JSONB,
  
  statutory_pay_type TEXT CHECK (statutory_pay_type IN ('ssp', 'smp', 'spp', 'sap', 'shpp', 'spbp')),
  average_weekly_earnings NUMERIC(10,2),
  statutory_weeks_paid INTEGER DEFAULT 0,
  statutory_weeks_remaining INTEGER,
  
  fit_note_received BOOLEAN DEFAULT false,
  matb1_received BOOLEAN DEFAULT false,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- EMPLOYEE BENEFITS (for P11D)
-- =====================================================
CREATE TABLE public.employee_benefits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  
  tax_year TEXT NOT NULL,
  benefit_type TEXT NOT NULL CHECK (benefit_type IN (
    'company_car', 'car_fuel', 'van', 'van_fuel', 'private_medical',
    'accommodation', 'loans', 'assets_transferred', 'payments_on_behalf',
    'vouchers_credit_cards', 'living_accommodation', 'mileage_allowance',
    'car_allowance', 'telephone', 'other'
  )),
  
  description TEXT NOT NULL,
  cash_equivalent NUMERIC(12,2) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  
  car_make_model TEXT,
  car_registration TEXT,
  car_co2_emissions INTEGER,
  car_fuel_type TEXT CHECK (car_fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid_petrol', 'hybrid_diesel')),
  car_list_price NUMERIC(12,2),
  car_capital_contributions NUMERIC(12,2),
  car_private_use_contribution NUMERIC(12,2),
  car_available_from DATE,
  car_available_to DATE,
  car_days_unavailable INTEGER DEFAULT 0,
  
  loan_amount NUMERIC(12,2),
  loan_interest_paid NUMERIC(12,2),
  
  payrolled BOOLEAN DEFAULT false,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- PAY RUNS
-- =====================================================
CREATE TABLE public.pay_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  paye_scheme_id UUID NOT NULL REFERENCES public.paye_schemes(id) ON DELETE CASCADE,
  
  tax_year TEXT NOT NULL,
  tax_period INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('weekly', 'fortnightly', 'four_weekly', 'monthly')),
  
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'approved', 'submitted', 'paid')),
  
  total_gross_pay NUMERIC(12,2) DEFAULT 0,
  total_net_pay NUMERIC(12,2) DEFAULT 0,
  total_paye NUMERIC(12,2) DEFAULT 0,
  total_employee_nic NUMERIC(12,2) DEFAULT 0,
  total_employer_nic NUMERIC(12,2) DEFAULT 0,
  total_employee_pension NUMERIC(12,2) DEFAULT 0,
  total_employer_pension NUMERIC(12,2) DEFAULT 0,
  total_student_loan NUMERIC(12,2) DEFAULT 0,
  total_statutory_pay NUMERIC(12,2) DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  
  prepared_by UUID REFERENCES auth.users(id),
  prepared_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  fps_filing_id UUID REFERENCES public.filings(id),
  journal_id UUID REFERENCES public.journals(id),
  
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (paye_scheme_id, tax_year, tax_period, pay_frequency)
);

-- =====================================================
-- PAYSLIPS
-- =====================================================
CREATE TABLE public.payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pay_run_id UUID NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  
  tax_year TEXT NOT NULL,
  tax_period INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  
  tax_code TEXT NOT NULL,
  tax_basis TEXT NOT NULL,
  nic_category TEXT NOT NULL,
  is_director BOOLEAN DEFAULT false,
  director_nic_method TEXT,
  
  basic_pay NUMERIC(12,2) DEFAULT 0,
  overtime_pay NUMERIC(12,2) DEFAULT 0,
  bonus_pay NUMERIC(12,2) DEFAULT 0,
  commission_pay NUMERIC(12,2) DEFAULT 0,
  holiday_pay NUMERIC(12,2) DEFAULT 0,
  sick_pay NUMERIC(12,2) DEFAULT 0,
  statutory_maternity_pay NUMERIC(12,2) DEFAULT 0,
  statutory_paternity_pay NUMERIC(12,2) DEFAULT 0,
  statutory_adoption_pay NUMERIC(12,2) DEFAULT 0,
  statutory_shared_parental_pay NUMERIC(12,2) DEFAULT 0,
  statutory_parental_bereavement_pay NUMERIC(12,2) DEFAULT 0,
  other_pay NUMERIC(12,2) DEFAULT 0,
  
  gross_pay NUMERIC(12,2) NOT NULL,
  taxable_pay NUMERIC(12,2) NOT NULL,
  nicable_pay NUMERIC(12,2) NOT NULL,
  pensionable_pay NUMERIC(12,2) NOT NULL,
  
  paye_tax NUMERIC(12,2) DEFAULT 0,
  employee_nic NUMERIC(12,2) DEFAULT 0,
  employer_nic NUMERIC(12,2) DEFAULT 0,
  employee_pension NUMERIC(12,2) DEFAULT 0,
  employer_pension NUMERIC(12,2) DEFAULT 0,
  student_loan NUMERIC(12,2) DEFAULT 0,
  postgrad_loan NUMERIC(12,2) DEFAULT 0,
  attachment_of_earnings NUMERIC(12,2) DEFAULT 0,
  other_deductions NUMERIC(12,2) DEFAULT 0,
  
  salary_sacrifice_pension NUMERIC(12,2) DEFAULT 0,
  salary_sacrifice_other NUMERIC(12,2) DEFAULT 0,
  
  total_deductions NUMERIC(12,2) NOT NULL,
  net_pay NUMERIC(12,2) NOT NULL,
  
  ytd_gross_pay NUMERIC(12,2) DEFAULT 0,
  ytd_taxable_pay NUMERIC(12,2) DEFAULT 0,
  ytd_paye_tax NUMERIC(12,2) DEFAULT 0,
  ytd_employee_nic NUMERIC(12,2) DEFAULT 0,
  ytd_employer_nic NUMERIC(12,2) DEFAULT 0,
  ytd_employee_pension NUMERIC(12,2) DEFAULT 0,
  ytd_employer_pension NUMERIC(12,2) DEFAULT 0,
  ytd_student_loan NUMERIC(12,2) DEFAULT 0,
  
  calculation_breakdown JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'approved', 'paid')),
  pdf_storage_path TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (pay_run_id, employee_id)
);

-- =====================================================
-- RTI SUBMISSIONS (transport log only)
-- =====================================================
CREATE TABLE public.rti_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  paye_scheme_id UUID NOT NULL REFERENCES public.paye_schemes(id) ON DELETE CASCADE,
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  pay_run_id UUID REFERENCES public.pay_runs(id),
  
  submission_type TEXT NOT NULL CHECK (submission_type IN ('fps', 'eps', 'nvr', 'ear')),
  tax_year TEXT NOT NULL,
  tax_period INTEGER,
  
  hmrc_correlation_id TEXT,
  hmrc_submission_id TEXT,
  xml_payload TEXT,
  hmrc_response JSONB,
  submission_status TEXT NOT NULL DEFAULT 'pending' CHECK (submission_status IN ('pending', 'submitted', 'accepted', 'rejected', 'error')),
  error_messages JSONB,
  
  submitted_at TIMESTAMPTZ,
  response_received_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- CIS CONTRACTORS
-- =====================================================
CREATE TABLE public.cis_contractors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  
  contractor_utr TEXT NOT NULL,
  accounts_office_reference TEXT,
  name TEXT NOT NULL,
  
  hmrc_verified BOOLEAN DEFAULT false,
  hmrc_verification_number TEXT,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT cis_contractors_entity_check CHECK (
    (company_id IS NOT NULL AND client_id IS NULL) OR
    (company_id IS NULL AND client_id IS NOT NULL)
  )
);

-- =====================================================
-- CIS SUBCONTRACTORS
-- =====================================================
CREATE TABLE public.cis_subcontractors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cis_contractor_id UUID NOT NULL REFERENCES public.cis_contractors(id) ON DELETE CASCADE,
  
  business_name TEXT,
  trading_name TEXT,
  first_name TEXT,
  last_name TEXT,
  
  utr TEXT,
  national_insurance_number TEXT,
  company_registration_number TEXT,
  vat_number TEXT,
  
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  
  email TEXT,
  phone TEXT,
  
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'failed')),
  verification_number TEXT,
  verified_at TIMESTAMPTZ,
  
  deduction_rate TEXT NOT NULL DEFAULT 'standard' CHECK (deduction_rate IN ('gross', 'standard', 'higher')),
  
  is_partnership BOOLEAN DEFAULT false,
  partner_details JSONB,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- CIS RETURNS (created BEFORE cis_payments to allow FK)
-- =====================================================
CREATE TABLE public.cis_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cis_contractor_id UUID NOT NULL REFERENCES public.cis_contractors(id) ON DELETE CASCADE,
  
  tax_year TEXT NOT NULL,
  tax_month INTEGER NOT NULL CHECK (tax_month BETWEEN 1 AND 12),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  
  total_payments_count INTEGER DEFAULT 0,
  total_gross_amount NUMERIC(12,2) DEFAULT 0,
  total_materials_amount NUMERIC(12,2) DEFAULT 0,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  
  employment_status_declaration BOOLEAN DEFAULT false,
  subcontractor_verification_declaration BOOLEAN DEFAULT false,
  
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'submitted', 'accepted', 'rejected')),
  filing_id UUID REFERENCES public.filings(id),
  
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  hmrc_receipt_number TEXT,
  hmrc_response JSONB,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (cis_contractor_id, tax_year, tax_month)
);

-- =====================================================
-- CIS PAYMENTS (now cis_returns exists for FK)
-- =====================================================
CREATE TABLE public.cis_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cis_contractor_id UUID NOT NULL REFERENCES public.cis_contractors(id) ON DELETE CASCADE,
  cis_subcontractor_id UUID NOT NULL REFERENCES public.cis_subcontractors(id) ON DELETE CASCADE,
  
  tax_year TEXT NOT NULL,
  tax_month INTEGER NOT NULL CHECK (tax_month BETWEEN 1 AND 12),
  payment_date DATE NOT NULL,
  
  gross_amount NUMERIC(12,2) NOT NULL,
  materials_amount NUMERIC(12,2) DEFAULT 0,
  labour_amount NUMERIC(12,2) NOT NULL,
  
  deduction_rate NUMERIC(5,2) NOT NULL,
  deduction_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,
  
  payment_reference TEXT,
  invoice_number TEXT,
  description TEXT,
  
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'included_in_return', 'paid')),
  cis_return_id UUID REFERENCES public.cis_returns(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_paye_schemes_org ON public.paye_schemes(organization_id);
CREATE INDEX idx_paye_schemes_company ON public.paye_schemes(company_id);
CREATE INDEX idx_paye_schemes_client ON public.paye_schemes(client_id);

CREATE INDEX idx_pension_schemes_paye ON public.pension_schemes(paye_scheme_id);

CREATE INDEX idx_employees_org ON public.employees(organization_id);
CREATE INDEX idx_employees_paye_scheme ON public.employees(paye_scheme_id);
CREATE INDEX idx_employees_linked_person ON public.employees(linked_person_id);
CREATE INDEX idx_employees_status ON public.employees(status);
CREATE INDEX idx_employees_ni ON public.employees(national_insurance_number);

CREATE INDEX idx_employee_absences_employee ON public.employee_absences(employee_id);
CREATE INDEX idx_employee_absences_dates ON public.employee_absences(start_date, end_date);
CREATE INDEX idx_employee_absences_type ON public.employee_absences(absence_type);

CREATE INDEX idx_employee_benefits_employee ON public.employee_benefits(employee_id);
CREATE INDEX idx_employee_benefits_tax_year ON public.employee_benefits(tax_year);
CREATE INDEX idx_employee_benefits_type ON public.employee_benefits(benefit_type);

CREATE INDEX idx_pay_runs_org ON public.pay_runs(organization_id);
CREATE INDEX idx_pay_runs_paye_scheme ON public.pay_runs(paye_scheme_id);
CREATE INDEX idx_pay_runs_period ON public.pay_runs(tax_year, tax_period);
CREATE INDEX idx_pay_runs_status ON public.pay_runs(status);
CREATE INDEX idx_pay_runs_payment_date ON public.pay_runs(payment_date);

CREATE INDEX idx_payslips_pay_run ON public.payslips(pay_run_id);
CREATE INDEX idx_payslips_employee ON public.payslips(employee_id);
CREATE INDEX idx_payslips_period ON public.payslips(tax_year, tax_period);

CREATE INDEX idx_rti_submissions_paye ON public.rti_submissions(paye_scheme_id);
CREATE INDEX idx_rti_submissions_filing ON public.rti_submissions(filing_id);
CREATE INDEX idx_rti_submissions_pay_run ON public.rti_submissions(pay_run_id);
CREATE INDEX idx_rti_submissions_status ON public.rti_submissions(submission_status);

CREATE INDEX idx_cis_contractors_org ON public.cis_contractors(organization_id);
CREATE INDEX idx_cis_contractors_company ON public.cis_contractors(company_id);
CREATE INDEX idx_cis_contractors_client ON public.cis_contractors(client_id);

CREATE INDEX idx_cis_subcontractors_contractor ON public.cis_subcontractors(cis_contractor_id);
CREATE INDEX idx_cis_subcontractors_status ON public.cis_subcontractors(verification_status);

CREATE INDEX idx_cis_payments_contractor ON public.cis_payments(cis_contractor_id);
CREATE INDEX idx_cis_payments_subcontractor ON public.cis_payments(cis_subcontractor_id);
CREATE INDEX idx_cis_payments_period ON public.cis_payments(tax_year, tax_month);
CREATE INDEX idx_cis_payments_return ON public.cis_payments(cis_return_id);

CREATE INDEX idx_cis_returns_contractor ON public.cis_returns(cis_contractor_id);
CREATE INDEX idx_cis_returns_period ON public.cis_returns(tax_year, tax_month);
CREATE INDEX idx_cis_returns_status ON public.cis_returns(status);
CREATE INDEX idx_cis_returns_filing ON public.cis_returns(filing_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.paye_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pension_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rti_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cis_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cis_subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cis_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cis_returns ENABLE ROW LEVEL SECURITY;

-- PAYE Schemes policies
CREATE POLICY "Users can view PAYE schemes in their organization"
  ON public.paye_schemes FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert PAYE schemes in their organization"
  ON public.paye_schemes FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update PAYE schemes in their organization"
  ON public.paye_schemes FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete PAYE schemes in their organization"
  ON public.paye_schemes FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Pension Schemes policies
CREATE POLICY "Users can view pension schemes in their organization"
  ON public.pension_schemes FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert pension schemes in their organization"
  ON public.pension_schemes FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update pension schemes in their organization"
  ON public.pension_schemes FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete pension schemes in their organization"
  ON public.pension_schemes FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Employees policies
CREATE POLICY "Users can view employees in their organization"
  ON public.employees FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert employees in their organization"
  ON public.employees FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update employees in their organization"
  ON public.employees FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete employees in their organization"
  ON public.employees FOR DELETE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Employees can view their own record via portal"
  ON public.employees FOR SELECT
  USING (portal_user_id = auth.uid());

-- Employee Absences policies
CREATE POLICY "Users can view absences in their organization"
  ON public.employee_absences FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert absences in their organization"
  ON public.employee_absences FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update absences in their organization"
  ON public.employee_absences FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete absences in their organization"
  ON public.employee_absences FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Employee Benefits policies
CREATE POLICY "Users can view benefits in their organization"
  ON public.employee_benefits FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert benefits in their organization"
  ON public.employee_benefits FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update benefits in their organization"
  ON public.employee_benefits FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete benefits in their organization"
  ON public.employee_benefits FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Pay Runs policies
CREATE POLICY "Users can view pay runs in their organization"
  ON public.pay_runs FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert pay runs in their organization"
  ON public.pay_runs FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update pay runs in their organization"
  ON public.pay_runs FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete pay runs in their organization"
  ON public.pay_runs FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Payslips policies
CREATE POLICY "Users can view payslips in their organization"
  ON public.payslips FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert payslips in their organization"
  ON public.payslips FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update payslips in their organization"
  ON public.payslips FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete payslips in their organization"
  ON public.payslips FOR DELETE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Employees can view their own payslips via portal"
  ON public.payslips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payslips.employee_id
      AND e.portal_user_id = auth.uid()
    )
  );

-- RTI Submissions policies
CREATE POLICY "Users can view RTI submissions in their organization"
  ON public.rti_submissions FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert RTI submissions in their organization"
  ON public.rti_submissions FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update RTI submissions in their organization"
  ON public.rti_submissions FOR UPDATE
  USING (user_has_organization_access(organization_id));

-- CIS Contractors policies
CREATE POLICY "Users can view CIS contractors in their organization"
  ON public.cis_contractors FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert CIS contractors in their organization"
  ON public.cis_contractors FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update CIS contractors in their organization"
  ON public.cis_contractors FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete CIS contractors in their organization"
  ON public.cis_contractors FOR DELETE
  USING (user_has_organization_access(organization_id));

-- CIS Subcontractors policies
CREATE POLICY "Users can view CIS subcontractors in their organization"
  ON public.cis_subcontractors FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert CIS subcontractors in their organization"
  ON public.cis_subcontractors FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update CIS subcontractors in their organization"
  ON public.cis_subcontractors FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete CIS subcontractors in their organization"
  ON public.cis_subcontractors FOR DELETE
  USING (user_has_organization_access(organization_id));

-- CIS Payments policies
CREATE POLICY "Users can view CIS payments in their organization"
  ON public.cis_payments FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert CIS payments in their organization"
  ON public.cis_payments FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update CIS payments in their organization"
  ON public.cis_payments FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete CIS payments in their organization"
  ON public.cis_payments FOR DELETE
  USING (user_has_organization_access(organization_id));

-- CIS Returns policies
CREATE POLICY "Users can view CIS returns in their organization"
  ON public.cis_returns FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert CIS returns in their organization"
  ON public.cis_returns FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update CIS returns in their organization"
  ON public.cis_returns FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete CIS returns in their organization"
  ON public.cis_returns FOR DELETE
  USING (user_has_organization_access(organization_id));
