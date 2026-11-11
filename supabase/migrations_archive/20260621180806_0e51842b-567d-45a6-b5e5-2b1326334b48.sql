
-- ============================================================
-- PHASE A: CANONICAL SERVICES SPINE FOUNDATION (additive only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.canonical_services (
  code text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  allowed_client_types text[] NOT NULL DEFAULT '{}',
  is_recurring boolean NOT NULL DEFAULT false,
  default_billing_frequency text,
  requires_period boolean NOT NULL DEFAULT false,
  requires_companies_house_data boolean NOT NULL DEFAULT false,
  requires_hmrc_authorisation boolean NOT NULL DEFAULT false,
  requires_vat_settings boolean NOT NULL DEFAULT false,
  requires_payroll_settings boolean NOT NULL DEFAULT false,
  requires_completion_date boolean NOT NULL DEFAULT false,
  requires_property_details boolean NOT NULL DEFAULT false,
  creates_jobs boolean NOT NULL DEFAULT true,
  creates_deadlines boolean NOT NULL DEFAULT true,
  filing_regime text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.canonical_services TO authenticated;
GRANT SELECT ON public.canonical_services TO anon;
GRANT ALL ON public.canonical_services TO service_role;
ALTER TABLE public.canonical_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canonical_services_read_all" ON public.canonical_services;
CREATE POLICY "canonical_services_read_all"
  ON public.canonical_services FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE IF NOT EXISTS public.canonical_job_templates (
  job_template_code text PRIMARY KEY,
  canonical_service_code text NOT NULL REFERENCES public.canonical_services(code) ON DELETE RESTRICT,
  display_name text NOT NULL,
  period_type text NOT NULL,
  default_status text NOT NULL DEFAULT 'planned',
  requires_client_records boolean NOT NULL DEFAULT false,
  requires_questionnaire boolean NOT NULL DEFAULT false,
  requires_workpaper boolean NOT NULL DEFAULT false,
  requires_client_approval boolean NOT NULL DEFAULT false,
  requires_filing boolean NOT NULL DEFAULT false,
  rollover_rule text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canonical_job_templates_service ON public.canonical_job_templates(canonical_service_code);
GRANT SELECT ON public.canonical_job_templates TO authenticated;
GRANT SELECT ON public.canonical_job_templates TO anon;
GRANT ALL ON public.canonical_job_templates TO service_role;
ALTER TABLE public.canonical_job_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canonical_job_templates_read_all" ON public.canonical_job_templates;
CREATE POLICY "canonical_job_templates_read_all"
  ON public.canonical_job_templates FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE IF NOT EXISTS public.canonical_deadline_rules (
  deadline_code text PRIMARY KEY,
  canonical_service_code text NOT NULL REFERENCES public.canonical_services(code) ON DELETE RESTRICT,
  job_template_code text REFERENCES public.canonical_job_templates(job_template_code) ON DELETE RESTRICT,
  deadline_name text NOT NULL,
  deadline_type text NOT NULL,
  source text NOT NULL,
  calculation_method jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_facts text[] NOT NULL DEFAULT '{}',
  default_visible_to_client boolean NOT NULL DEFAULT false,
  default_triggers_chasers boolean NOT NULL DEFAULT true,
  default_chaser_policy text,
  effective_from date NOT NULL DEFAULT '1900-01-01',
  effective_to date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canonical_deadline_rules_service ON public.canonical_deadline_rules(canonical_service_code);
CREATE INDEX IF NOT EXISTS idx_canonical_deadline_rules_job_template ON public.canonical_deadline_rules(job_template_code);
GRANT SELECT ON public.canonical_deadline_rules TO authenticated;
GRANT SELECT ON public.canonical_deadline_rules TO anon;
GRANT ALL ON public.canonical_deadline_rules TO service_role;
ALTER TABLE public.canonical_deadline_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canonical_deadline_rules_read_all" ON public.canonical_deadline_rules;
CREATE POLICY "canonical_deadline_rules_read_all"
  ON public.canonical_deadline_rules FOR SELECT TO authenticated, anon USING (true);

ALTER TABLE public.services_catalog ADD COLUMN IF NOT EXISTS canonical_service_code text
  REFERENCES public.canonical_services(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_services_catalog_canonical_code ON public.services_catalog(canonical_service_code);

ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS canonical_service_code text
  REFERENCES public.canonical_services(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quote_lines_canonical_code ON public.quote_lines(canonical_service_code);

ALTER TABLE public.engagements ADD COLUMN IF NOT EXISTS canonical_service_code text
  REFERENCES public.canonical_services(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_engagements_canonical_code ON public.engagements(canonical_service_code);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS canonical_service_code text REFERENCES public.canonical_services(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_template_code text REFERENCES public.canonical_job_templates(job_template_code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_canonical_code ON public.jobs(canonical_service_code);

ALTER TABLE public.deadlines
  ADD COLUMN IF NOT EXISTS canonical_service_code text REFERENCES public.canonical_services(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deadline_code text REFERENCES public.canonical_deadline_rules(deadline_code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deadlines_canonical_code ON public.deadlines(canonical_service_code);
CREATE INDEX IF NOT EXISTS idx_deadlines_deadline_code ON public.deadlines(deadline_code);

ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS canonical_spine_v1 boolean NOT NULL DEFAULT false;

-- Seed canonical_services
INSERT INTO public.canonical_services
  (code, name, category, allowed_client_types, is_recurring, default_billing_frequency,
   requires_period, requires_companies_house_data, requires_hmrc_authorisation,
   requires_vat_settings, requires_payroll_settings, requires_completion_date,
   requires_property_details, creates_jobs, creates_deadlines, filing_regime)
VALUES
  ('accounts_production_ltd','Limited company accounts production','accounts',ARRAY['limited_company','llp','charity_company'],true,'annual',true,true,false,false,false,false,false,true,true,'companies_house'),
  ('corporation_tax_return','Corporation tax return / CT600','tax',ARRAY['limited_company','llp','charity_company'],true,'annual',true,false,true,false,false,false,false,true,true,'hmrc_ct'),
  ('confirmation_statement','Confirmation statement / CS01','company_secretarial',ARRAY['limited_company','llp'],true,'annual',false,true,false,false,false,false,false,true,true,'companies_house'),
  ('registered_office','Registered office service','company_secretarial',ARRAY['limited_company','llp','charity_company'],true,'monthly',false,true,false,false,false,false,false,false,false,null),
  ('company_secretarial_changes','Company secretarial changes','company_secretarial',ARRAY['limited_company','llp'],false,'one_off',false,true,false,false,false,false,false,true,true,'companies_house'),
  ('self_assessment_non_mtd','Self Assessment tax return — non-MTD','personal_tax',ARRAY['individual','landlord','sole_trader','director','partner'],true,'annual',true,false,true,false,false,false,false,true,true,'hmrc_sa'),
  ('self_assessment_mtd_quarterly','MTD ITSA quarterly updates','personal_tax_mtd',ARRAY['individual','landlord','sole_trader'],true,'quarterly',true,false,true,false,false,false,false,true,true,'hmrc_mtd_it'),
  ('mtd_itsa_final_declaration','MTD ITSA final declaration','personal_tax_mtd',ARRAY['individual','landlord','sole_trader'],true,'annual',true,false,true,false,false,false,false,true,true,'hmrc_mtd_it'),
  ('capital_gains_tax_return','Capital gains tax return','capital_gains_tax',ARRAY['individual','trust','personal_representative','non_resident'],false,'one_off',false,false,true,false,false,true,true,true,true,'hmrc_cgt'),
  ('tax_advisory_personal','Personal tax advisory','advisory',ARRAY['individual','landlord','sole_trader','director','partner'],false,'one_off',false,false,false,false,false,false,false,true,false,null),
  ('partnership_tax_return','Partnership tax return','partnership_tax',ARRAY['partnership','llp'],true,'annual',true,false,true,false,false,false,false,true,true,'hmrc_sa'),
  ('llp_accounts','LLP accounts production','accounts',ARRAY['llp'],true,'annual',true,true,false,false,false,false,false,true,true,'companies_house'),
  ('vat_return','VAT return','vat',ARRAY['limited_company','sole_trader','partnership','llp','charity'],true,'quarterly',true,false,true,true,false,false,false,true,true,'hmrc_mtd_vat'),
  ('vat_registration','VAT registration','vat',ARRAY['limited_company','sole_trader','partnership','llp','charity'],false,'one_off',false,false,true,false,false,false,false,true,false,'hmrc_vat'),
  ('vat_deregistration','VAT deregistration','vat',ARRAY['limited_company','sole_trader','partnership','llp','charity'],false,'one_off',true,false,true,true,false,false,false,true,true,'hmrc_vat'),
  ('payroll','Payroll','payroll',ARRAY['limited_company','sole_trader','partnership','llp','charity'],true,'monthly',true,false,true,false,true,false,false,true,true,'hmrc_rti'),
  ('auto_enrolment_pension','Auto-enrolment pension compliance','payroll_pension',ARRAY['limited_company','sole_trader','partnership','llp','charity'],true,'monthly',true,false,false,false,true,false,false,true,true,null),
  ('p11d_benefits','P11D / benefits reporting','payroll_tax',ARRAY['limited_company','sole_trader','partnership','llp','charity'],true,'annual',true,false,true,false,true,false,false,true,true,'hmrc_p11d'),
  ('cis_monthly_return','CIS monthly return','cis',ARRAY['limited_company','sole_trader','partnership','llp'],true,'monthly',true,false,true,false,true,false,false,true,true,'hmrc_cis'),
  ('cis_subcontractor_verification','CIS subcontractor verification','cis',ARRAY['limited_company','sole_trader','partnership','llp'],false,'one_off',false,false,true,false,false,false,false,true,false,'hmrc_cis'),
  ('bookkeeping','Bookkeeping','bookkeeping',ARRAY['limited_company','sole_trader','partnership','llp','charity','landlord'],true,'monthly',true,false,false,false,false,false,false,true,true,null),
  ('management_accounts','Management accounts','management_reporting',ARRAY['limited_company','sole_trader','partnership','llp'],true,'monthly',true,false,false,false,false,false,false,true,true,null),
  ('annual_bookkeeping_cleanup','Year-end bookkeeping cleanup','bookkeeping',ARRAY['limited_company','sole_trader','partnership','llp','charity'],true,'annual',true,false,false,false,false,false,false,true,true,null),
  ('sole_trader_accounts','Sole trader accounts','accounts',ARRAY['sole_trader','individual'],true,'annual',true,false,false,false,false,false,false,true,true,null),
  ('property_accounts_landlord','Landlord / property accounts','property_tax',ARRAY['landlord','individual','partnership'],true,'annual',true,false,false,false,false,false,true,true,true,null),
  ('charity_accounts','Charity accounts','charity',ARRAY['charity','charity_company','cio'],true,'annual',true,true,false,false,false,false,false,true,true,'charity_commission'),
  ('gift_aid_claim','Gift Aid claim','charity_tax',ARRAY['charity','charity_company','cio'],true,'quarterly',true,false,true,false,false,false,false,true,true,'hmrc_gift_aid'),
  ('trust_tax_return','Trust and estate tax return','trust_tax',ARRAY['trust','estate'],true,'annual',true,false,true,false,false,false,false,true,true,'hmrc_sa'),
  ('trust_registration_service','Trust Registration Service','trust_compliance',ARRAY['trust'],false,'one_off',false,false,true,false,false,false,false,true,true,'hmrc_trs'),
  ('tax_investigation_support','HMRC enquiry / investigation support','advisory',ARRAY['individual','limited_company','sole_trader','partnership','llp','charity','trust'],false,'one_off',false,false,false,false,false,false,false,true,false,null),
  ('tax_planning_advisory','Tax planning advisory','advisory',ARRAY['individual','limited_company','sole_trader','partnership','llp','charity','trust'],false,'one_off',false,false,false,false,false,false,false,true,false,null),
  ('software_subscription','Software subscription','software',ARRAY['limited_company','sole_trader','partnership','llp','charity'],true,'monthly',false,false,false,false,false,false,false,false,false,null),
  ('custom_advisory','Custom advisory / other service','custom',ARRAY['individual','limited_company','sole_trader','partnership','llp','charity','trust','landlord'],false,'one_off',false,false,false,false,false,false,false,true,false,null)
ON CONFLICT (code) DO NOTHING;

-- Seed canonical_job_templates
INSERT INTO public.canonical_job_templates
  (job_template_code, canonical_service_code, display_name, period_type,
   requires_client_records, requires_questionnaire, requires_workpaper,
   requires_client_approval, requires_filing, rollover_rule)
VALUES
  ('ltd_accounts_production','accounts_production_ltd','Limited company accounts','accounting_period',true,true,true,true,true,'next_accounting_period'),
  ('ct600_preparation_and_filing','corporation_tax_return','CT600 preparation and filing','accounting_period',true,true,true,true,true,'next_accounting_period'),
  ('confirmation_statement_filing','confirmation_statement','Confirmation statement filing','ad_hoc',false,true,true,false,true,'next_review_period'),
  ('registered_office_mail_review','registered_office','Registered office mail review','month',false,false,false,false,false,'next_month'),
  ('company_secretarial_change','company_secretarial_changes','Company secretarial change','ad_hoc',true,true,true,false,true,null),
  ('sa100_tax_return','self_assessment_non_mtd','SA100 tax return','tax_year',true,true,true,true,true,'next_tax_year'),
  ('mtd_itsa_quarterly_update','self_assessment_mtd_quarterly','MTD ITSA quarterly update','quarter',true,true,true,false,true,'next_quarter'),
  ('mtd_itsa_final_declaration','mtd_itsa_final_declaration','MTD ITSA final declaration','tax_year',true,true,true,true,true,'next_tax_year'),
  ('cgt_return','capital_gains_tax_return','CGT return','ad_hoc',true,true,true,true,true,null),
  ('sa800_partnership_tax_return','partnership_tax_return','Partnership tax return SA800','tax_year',true,true,true,true,true,'next_tax_year'),
  ('llp_accounts_production','llp_accounts','LLP accounts production','accounting_period',true,true,true,true,true,'next_accounting_period'),
  ('vat_return_period','vat_return','VAT return','vat_period',true,true,true,false,true,'next_vat_period'),
  ('vat_registration_application','vat_registration','VAT registration application','ad_hoc',true,true,true,false,true,null),
  ('vat_deregistration_application','vat_deregistration','VAT deregistration application','ad_hoc',true,true,true,false,true,null),
  ('final_vat_return','vat_deregistration','Final VAT return','vat_period',true,true,true,false,true,null),
  ('payroll_run','payroll','Payroll run','pay_period',true,true,true,false,true,'next_pay_period'),
  ('pension_submission','auto_enrolment_pension','Pension contribution submission','month',true,false,true,false,true,'next_month'),
  ('auto_enrolment_redeclaration','auto_enrolment_pension','Auto-enrolment re-declaration','ad_hoc',false,true,true,false,true,null),
  ('p11d_preparation_and_filing','p11d_benefits','P11D preparation and filing','tax_year',true,true,true,true,true,'next_tax_year'),
  ('cis_monthly_return','cis_monthly_return','CIS monthly return','month',true,true,true,false,true,'next_month'),
  ('cis_subcontractor_verification','cis_subcontractor_verification','CIS subcontractor verification','ad_hoc',true,true,false,false,true,null),
  ('monthly_bookkeeping','bookkeeping','Monthly bookkeeping','month',true,true,true,false,false,'next_month'),
  ('quarterly_bookkeeping','bookkeeping','Quarterly bookkeeping','quarter',true,true,true,false,false,'next_quarter'),
  ('management_accounts_preparation','management_accounts','Management accounts preparation','month',true,true,true,false,false,'next_month'),
  ('year_end_bookkeeping_cleanup','annual_bookkeeping_cleanup','Year-end bookkeeping cleanup','accounting_period',true,true,true,false,false,'next_accounting_period'),
  ('sole_trader_accounts_preparation','sole_trader_accounts','Sole trader accounts preparation','tax_year',true,true,true,false,false,'next_tax_year'),
  ('property_accounts_preparation','property_accounts_landlord','Property accounts preparation','tax_year',true,true,true,false,false,'next_tax_year'),
  ('charity_accounts_preparation','charity_accounts','Charity accounts preparation','accounting_period',true,true,true,true,true,'next_accounting_period'),
  ('gift_aid_claim','gift_aid_claim','Gift Aid claim','quarter',true,true,true,false,true,'next_quarter'),
  ('trust_estate_tax_return','trust_tax_return','Trust / estate tax return','tax_year',true,true,true,true,true,'next_tax_year'),
  ('trust_registration_or_update','trust_registration_service','Trust registration or update','ad_hoc',true,true,true,false,true,null),
  ('hmrc_enquiry_response','tax_investigation_support','HMRC enquiry response','ad_hoc',true,true,true,false,false,null),
  ('tax_planning_advisory','tax_planning_advisory','Tax planning advisory','ad_hoc',true,true,true,false,false,null),
  ('software_setup','software_subscription','Software setup','ad_hoc',false,false,false,false,false,null),
  ('software_renewal_review','software_subscription','Software renewal review','ad_hoc',false,false,false,false,false,'next_renewal'),
  ('custom_advisory_job','custom_advisory','Custom advisory job','ad_hoc',false,false,false,false,false,null)
ON CONFLICT (job_template_code) DO NOTHING;

-- Seed canonical_deadline_rules
INSERT INTO public.canonical_deadline_rules
  (deadline_code, canonical_service_code, job_template_code, deadline_name, deadline_type, source,
   calculation_method, required_facts, default_visible_to_client, default_triggers_chasers, notes)
VALUES
  ('companies_house_accounts_filing','accounts_production_ltd','ltd_accounts_production','Companies House accounts filing','filing','companies_house_api',
   jsonb_build_object('api_field','accounts_next_due','fallback','first_accounts_or_9_months_after_year_end','first_accounts_months_from_incorporation',21,'normal_months_after_year_end',9),
   ARRAY['company_number','year_end','incorporation_date'],true,true,'CH API preferred; fallback 9 months after year end; first accounts 21 months from incorporation or 3 months after ARD if later.'),
  ('accounts_records_request_internal_target','accounts_production_ltd','ltd_accounts_production','Accounts records request (internal)','internal_target','calculated',
   jsonb_build_object('offset_days_before','companies_house_accounts_filing','default_days',90),
   ARRAY['companies_house_accounts_filing'],false,true,null),
  ('accounts_client_approval_target','accounts_production_ltd','ltd_accounts_production','Accounts client approval (internal)','client_approval','calculated',
   jsonb_build_object('offset_days_before','companies_house_accounts_filing','default_days',14),
   ARRAY['companies_house_accounts_filing'],false,true,null),
  ('ct600_filing','corporation_tax_return','ct600_preparation_and_filing','CT600 filing','filing','calculated',
   jsonb_build_object('add_months_to','accounting_period_end','months',12),
   ARRAY['accounting_period_end'],true,true,null),
  ('corporation_tax_payment','corporation_tax_return','ct600_preparation_and_filing','Corporation tax payment','payment','calculated',
   jsonb_build_object('add_to','accounting_period_end','months',9,'days',1),
   ARRAY['accounting_period_end'],true,true,'Normal companies; large/very large pay in instalments.'),
  ('ct600_client_approval_target','corporation_tax_return','ct600_preparation_and_filing','CT600 client approval (internal)','client_approval','calculated',
   jsonb_build_object('offset_days_before','ct600_filing','default_days',14),
   ARRAY['ct600_filing'],false,true,null),
  ('confirmation_statement_due','confirmation_statement','confirmation_statement_filing','Confirmation statement due','filing','companies_house_api',
   jsonb_build_object('api_field','confirmation_statement_next_due','fallback','review_period_end_plus_14_days'),
   ARRAY['company_number','review_period_end'],true,true,null),
  ('sa_tax_return_filing','self_assessment_non_mtd','sa100_tax_return','SA tax return filing','filing','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('sa_balancing_payment','self_assessment_non_mtd','sa100_tax_return','SA balancing payment','payment','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('sa_first_payment_on_account','self_assessment_non_mtd','sa100_tax_return','SA first payment on account','payment','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,'Where applicable based on prior year liability.'),
  ('sa_second_payment_on_account','self_assessment_non_mtd','sa100_tax_return','SA second payment on account','payment','calculated',
   jsonb_build_object('fixed_date','31 July','after_tax_year',true),ARRAY['tax_year'],true,true,'Where applicable based on prior year liability.'),
  ('paper_tax_return_deadline','self_assessment_non_mtd','sa100_tax_return','Paper SA tax return filing','filing','calculated',
   jsonb_build_object('fixed_date','31 October','after_tax_year',true),ARRAY['tax_year'],false,false,'Default disabled unless firm files paper returns.'),
  ('mtd_itsa_q1_update','self_assessment_mtd_quarterly','mtd_itsa_quarterly_update','MTD ITSA quarter 1 update','filing','calculated',
   jsonb_build_object('period_end','5 July','due_date','7 August'),ARRAY['tax_year'],true,true,null),
  ('mtd_itsa_q2_update','self_assessment_mtd_quarterly','mtd_itsa_quarterly_update','MTD ITSA quarter 2 update','filing','calculated',
   jsonb_build_object('period_end','5 October','due_date','7 November'),ARRAY['tax_year'],true,true,null),
  ('mtd_itsa_q3_update','self_assessment_mtd_quarterly','mtd_itsa_quarterly_update','MTD ITSA quarter 3 update','filing','calculated',
   jsonb_build_object('period_end','5 January','due_date','7 February'),ARRAY['tax_year'],true,true,null),
  ('mtd_itsa_q4_update','self_assessment_mtd_quarterly','mtd_itsa_quarterly_update','MTD ITSA quarter 4 update','filing','calculated',
   jsonb_build_object('period_end','5 April','due_date','7 May'),ARRAY['tax_year'],true,true,null),
  ('mtd_itsa_final_declaration_due','mtd_itsa_final_declaration','mtd_itsa_final_declaration','MTD ITSA final declaration','filing','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('uk_property_cgt_report_and_pay','capital_gains_tax_return','cgt_return','UK property CGT report and pay','filing','calculated',
   jsonb_build_object('add_to','completion_date','days',60),ARRAY['completion_date','property_type'],true,true,'UK residential property: report and pay within 60 days of completion.'),
  ('partnership_tax_return_filing','partnership_tax_return','sa800_partnership_tax_return','Partnership tax return filing','filing','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('partner_statement_delivery_target','partnership_tax_return','sa800_partnership_tax_return','Partner statement delivery (internal)','internal_target','calculated',
   jsonb_build_object('offset_days_before','partnership_tax_return_filing','default_days',30),ARRAY['partnership_tax_return_filing'],false,true,null),
  ('vat_return_filing','vat_return','vat_return_period','VAT return filing','filing','calculated',
   jsonb_build_object('add_to','vat_period_end','months',1,'days',7),ARRAY['vat_period_end','vat_scheme'],true,true,'Standard scheme; annual accounting / POA use scheme-specific rules.'),
  ('vat_payment','vat_return','vat_return_period','VAT payment','payment','calculated',
   jsonb_build_object('add_to','vat_period_end','months',1,'days',7),ARRAY['vat_period_end','vat_scheme'],true,true,null),
  ('fps_submission','payroll','payroll_run','FPS submission','filing','calculated',
   jsonb_build_object('on_or_before','pay_date'),ARRAY['pay_date'],false,true,null),
  ('eps_submission','payroll','payroll_run','EPS submission','filing','calculated',
   jsonb_build_object('fixed_day',19,'month_offset','next_tax_month'),ARRAY['tax_month_end'],false,true,'Required when EPS values apply.'),
  ('paye_nic_payment','payroll','payroll_run','PAYE / NIC payment','payment','calculated',
   jsonb_build_object('fixed_day_electronic',22,'fixed_day_post',19,'month_offset','next_tax_month','default','electronic'),ARRAY['tax_month_end'],true,true,null),
  ('p60_delivery','payroll','payroll_run','P60 delivery','filing','calculated',
   jsonb_build_object('fixed_date','31 May','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('p11d_filing','p11d_benefits','p11d_preparation_and_filing','P11D filing','filing','calculated',
   jsonb_build_object('fixed_date','6 July','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('class_1a_payment','p11d_benefits','p11d_preparation_and_filing','Class 1A NIC payment','payment','calculated',
   jsonb_build_object('fixed_date_electronic','22 July','fixed_date_post','19 July','after_tax_year',true,'default','electronic'),ARRAY['tax_year'],true,true,null),
  ('cis_return_filing','cis_monthly_return','cis_monthly_return','CIS return filing','filing','calculated',
   jsonb_build_object('fixed_day',19,'month_offset','next_tax_month'),ARRAY['cis_period_end'],false,true,null),
  ('cis_payment','cis_monthly_return','cis_monthly_return','CIS payment','payment','calculated',
   jsonb_build_object('fixed_day_electronic',22,'fixed_day_post',19,'month_offset','next_tax_month','default','electronic'),ARRAY['cis_period_end'],true,true,null),
  ('charity_commission_annual_return','charity_accounts','charity_accounts_preparation','Charity Commission annual return','filing','calculated',
   jsonb_build_object('add_months_to','financial_year_end','months',10),ARRAY['financial_year_end','charity_number'],true,true,null),
  ('charity_accounts_to_companies_house','charity_accounts','charity_accounts_preparation','Charity accounts to Companies House','filing','companies_house_api',
   jsonb_build_object('api_field','accounts_next_due','fallback','9_months_after_year_end'),ARRAY['company_number','financial_year_end'],true,true,'Charitable companies only.'),
  ('gift_aid_claim_window','gift_aid_claim','gift_aid_claim','Gift Aid claim window','renewal','calculated',
   jsonb_build_object('claim_window_years',4),ARRAY['donation_year_end'],false,false,'Warning window — claims valid for up to 4 years.'),
  ('trust_tax_return_filing','trust_tax_return','trust_estate_tax_return','Trust / estate tax return filing','filing','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,null),
  ('trust_tax_payment','trust_tax_return','trust_estate_tax_return','Trust / estate tax payment','payment','calculated',
   jsonb_build_object('fixed_date','31 January','after_tax_year',true),ARRAY['tax_year'],true,true,null)
ON CONFLICT (deadline_code) DO NOTHING;

-- Backfill canonical_service_code on existing rows (best-effort)
WITH mapping(legacy, canonical) AS (VALUES
  ('bookkeeping','bookkeeping'),
  ('cgt_60_day','capital_gains_tax_return'),
  ('cis','cis_monthly_return'),
  ('company_accounts','accounts_production_ltd'),
  ('confirmation_statement','confirmation_statement'),
  ('corporation_tax','corporation_tax_return'),
  ('mtd_quarterly','self_assessment_mtd_quarterly'),
  ('p11d','p11d_benefits'),
  ('payroll','payroll'),
  ('pensions','auto_enrolment_pension'),
  ('registered_office','registered_office'),
  ('sa_mtd','self_assessment_mtd_quarterly'),
  ('sa_non_mtd','self_assessment_non_mtd'),
  ('vat_return','vat_return'),
  ('advisory','tax_planning_advisory')
)
UPDATE public.services_catalog sc
   SET canonical_service_code = m.canonical
  FROM mapping m
 WHERE sc.canonical_service_code IS NULL AND lower(sc.code) = m.legacy;

UPDATE public.engagements e
   SET canonical_service_code = sc.canonical_service_code
  FROM public.services_catalog sc
 WHERE e.canonical_service_code IS NULL
   AND e.service_id = sc.id
   AND sc.canonical_service_code IS NOT NULL;

UPDATE public.quote_lines ql
   SET canonical_service_code = sc.canonical_service_code
  FROM public.services_catalog sc, public.quotes q
 WHERE ql.canonical_service_code IS NULL
   AND ql.service_id = sc.id
   AND sc.canonical_service_code IS NOT NULL
   AND ql.quote_id = q.id
   AND q.status IN ('draft','sent');

WITH job_mapping(legacy, canonical) AS (VALUES
  ('bookkeeping','bookkeeping'),
  ('cgt_60_day','capital_gains_tax_return'),
  ('cis','cis_monthly_return'),
  ('company_accounts','accounts_production_ltd'),
  ('confirmation_statement','confirmation_statement'),
  ('corporation_tax','corporation_tax_return'),
  ('mtd_quarterly','self_assessment_mtd_quarterly'),
  ('p11d','p11d_benefits'),
  ('payroll','payroll'),
  ('pensions','auto_enrolment_pension'),
  ('registered_office','registered_office'),
  ('sa_mtd','self_assessment_mtd_quarterly'),
  ('sa_non_mtd','self_assessment_non_mtd'),
  ('vat_return','vat_return')
)
UPDATE public.jobs j
   SET canonical_service_code = jm.canonical
  FROM job_mapping jm
 WHERE j.canonical_service_code IS NULL AND lower(j.service_type) = jm.legacy;

WITH dl_mapping(legacy, canonical) AS (VALUES
  ('bookkeeping','bookkeeping'),
  ('cgt_60_day','capital_gains_tax_return'),
  ('cis','cis_monthly_return'),
  ('company_accounts','accounts_production_ltd'),
  ('confirmation_statement','confirmation_statement'),
  ('corporation_tax','corporation_tax_return'),
  ('mtd_quarterly','self_assessment_mtd_quarterly'),
  ('p11d','p11d_benefits'),
  ('payroll','payroll'),
  ('pensions','auto_enrolment_pension'),
  ('registered_office','registered_office'),
  ('sa_mtd','self_assessment_mtd_quarterly'),
  ('sa_non_mtd','self_assessment_non_mtd'),
  ('vat_return','vat_return')
)
UPDATE public.deadlines d
   SET canonical_service_code = dm.canonical
  FROM dl_mapping dm
 WHERE d.canonical_service_code IS NULL AND lower(d.service_code) = dm.legacy;

CREATE OR REPLACE FUNCTION public._touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_services_updated_at ON public.canonical_services;
CREATE TRIGGER trg_canonical_services_updated_at BEFORE UPDATE ON public.canonical_services
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_canonical_job_templates_updated_at ON public.canonical_job_templates;
CREATE TRIGGER trg_canonical_job_templates_updated_at BEFORE UPDATE ON public.canonical_job_templates
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_canonical_deadline_rules_updated_at ON public.canonical_deadline_rules;
CREATE TRIGGER trg_canonical_deadline_rules_updated_at BEFORE UPDATE ON public.canonical_deadline_rules
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
