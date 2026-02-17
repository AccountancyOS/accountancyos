
-- =============================================================
-- Phase 2: Workpapers — Job Artifacts, Templates, Instances
-- =============================================================

-- 1. job_artifacts — unified store for things belonging to a job
CREATE TABLE public.job_artifacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'document', 'questionnaire_submission', 'workpaper_schedule',
    'external_workpaper', 'filing_snapshot', 'computation_output'
  )),
  source_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL,
  source_questionnaire_id UUID REFERENCES public.questionnaire_instances(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  period_label TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'void')),
  version INT NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_job_artifacts_org ON public.job_artifacts(organization_id);
CREATE INDEX idx_job_artifacts_job ON public.job_artifacts(job_id);
CREATE INDEX idx_job_artifacts_type ON public.job_artifacts(artifact_type);

ALTER TABLE public.job_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job artifacts in their org"
  ON public.job_artifacts FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create job artifacts in their org"
  ON public.job_artifacts FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update job artifacts in their org"
  ON public.job_artifacts FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete job artifacts in their org"
  ON public.job_artifacts FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

-- 2. workpaper_templates — practice-editable templates per job type
CREATE TABLE public.workpaper_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'SA_NON_MTD', 'SA_MTD', 'LTD_ACCOUNTS', 'CT600',
    'PARTNERSHIP', 'VAT', 'PAYROLL', 'CIS', 'BOOKKEEPING', 'OTHER'
  )),
  name TEXT NOT NULL,
  description TEXT,
  schema_json JSONB NOT NULL DEFAULT '{"sections":[]}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workpaper_templates_org ON public.workpaper_templates(organization_id);
CREATE INDEX idx_workpaper_templates_job_type ON public.workpaper_templates(job_type);

ALTER TABLE public.workpaper_templates ENABLE ROW LEVEL SECURITY;

-- System templates (org_id IS NULL) visible to all; org templates visible to members
CREATE POLICY "Users can view workpaper templates"
  ON public.workpaper_templates FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workpaper templates in their org"
  ON public.workpaper_templates FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update workpaper templates in their org"
  ON public.workpaper_templates FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete workpaper templates in their org"
  ON public.workpaper_templates FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
    AND is_system = false
  );

-- 3. job_workpaper_instances — snapshot of template onto a job
CREATE TABLE public.job_workpaper_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.workpaper_templates(id) ON DELETE SET NULL,
  template_version INT,
  name TEXT NOT NULL,
  instance_schema_json JSONB NOT NULL DEFAULT '{"sections":[]}',
  instance_data_json JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'locked')),
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  lock_reason TEXT,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jwi_org ON public.job_workpaper_instances(organization_id);
CREATE INDEX idx_jwi_job ON public.job_workpaper_instances(job_id);
CREATE INDEX idx_jwi_template ON public.job_workpaper_instances(template_id);

ALTER TABLE public.job_workpaper_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job workpaper instances in their org"
  ON public.job_workpaper_instances FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create job workpaper instances in their org"
  ON public.job_workpaper_instances FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update job workpaper instances in their org"
  ON public.job_workpaper_instances FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete job workpaper instances in their org"
  ON public.job_workpaper_instances FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

-- 4. Seed system default workpaper templates (org_id = NULL, is_system = true)
INSERT INTO public.workpaper_templates (organization_id, job_type, name, description, schema_json, is_default, is_system, version) VALUES
(NULL, 'SA_NON_MTD', 'Self Assessment Workpaper', 'Standard SA workpaper for non-MTD individual tax returns', '{"sections":[{"id":"identity","title":"Taxpayer Identity","fields":[{"id":"utr","label":"UTR","type":"text","required":true,"canonical_key":"identity.utr"},{"id":"nino","label":"NINO","type":"text","required":true,"canonical_key":"identity.nino"},{"id":"full_name","label":"Full Name","type":"text","required":true,"canonical_key":"identity.full_name"},{"id":"dob","label":"Date of Birth","type":"date","required":true,"canonical_key":"identity.dob"}]},{"id":"checklist","title":"Preparation Checklist","fields":[{"id":"p60_received","label":"P60 received","type":"yesno","required":false,"canonical_key":"checklist.p60_received"},{"id":"bank_interest_confirmed","label":"Bank interest confirmed","type":"yesno","required":false,"canonical_key":"checklist.bank_interest_confirmed"},{"id":"dividend_vouchers","label":"Dividend vouchers received","type":"yesno","required":false,"canonical_key":"checklist.dividend_vouchers"},{"id":"cgt_details","label":"CGT details gathered","type":"yesno","required":false,"canonical_key":"checklist.cgt_details"}]}]}', true, true, 1),

(NULL, 'CT600', 'Corporation Tax Workpaper', 'Standard CT600 workpaper for company tax returns', '{"sections":[{"id":"company_info","title":"Company Information","fields":[{"id":"company_name","label":"Company Name","type":"text","required":true,"canonical_key":"company.name"},{"id":"utr","label":"UTR","type":"text","required":true,"canonical_key":"company.utr"},{"id":"crn","label":"CRN","type":"text","required":true,"canonical_key":"company.crn"}]},{"id":"accounts_checklist","title":"Accounts Checklist","fields":[{"id":"tb_agreed","label":"Trial balance agreed","type":"yesno","required":false,"canonical_key":"checklist.tb_agreed"},{"id":"bank_rec_done","label":"Bank reconciliation complete","type":"yesno","required":false,"canonical_key":"checklist.bank_rec_done"},{"id":"directors_loan_reviewed","label":"Directors loan account reviewed","type":"yesno","required":false,"canonical_key":"checklist.directors_loan_reviewed"}]},{"id":"tax_adjustments","title":"Tax Adjustments Checklist","fields":[{"id":"disallowables_reviewed","label":"Disallowable expenses reviewed","type":"yesno","required":false,"canonical_key":"checklist.disallowables_reviewed"},{"id":"ca_computed","label":"Capital allowances computed","type":"yesno","required":false,"canonical_key":"checklist.ca_computed"},{"id":"losses_reviewed","label":"Losses reviewed","type":"yesno","required":false,"canonical_key":"checklist.losses_reviewed"}]}]}', true, true, 1),

(NULL, 'LTD_ACCOUNTS', 'Annual Accounts Workpaper', 'Standard workpaper for FRS105 annual accounts preparation', '{"sections":[{"id":"company_info","title":"Company Information","fields":[{"id":"company_name","label":"Company Name","type":"text","required":true,"canonical_key":"company.name"},{"id":"crn","label":"CRN","type":"text","required":true,"canonical_key":"company.crn"},{"id":"period_start","label":"Period Start","type":"date","required":true,"canonical_key":"period.start"},{"id":"period_end","label":"Period End","type":"date","required":true,"canonical_key":"period.end"}]},{"id":"preparation","title":"Preparation Checklist","fields":[{"id":"tb_imported","label":"Trial balance imported","type":"yesno","required":false,"canonical_key":"checklist.tb_imported"},{"id":"adjustments_posted","label":"Year-end adjustments posted","type":"yesno","required":false,"canonical_key":"checklist.adjustments_posted"},{"id":"disclosures_complete","label":"Disclosures complete","type":"yesno","required":false,"canonical_key":"checklist.disclosures_complete"}]}]}', true, true, 1),

(NULL, 'VAT', 'VAT Return Workpaper', 'Standard workpaper for VAT return preparation', '{"sections":[{"id":"vat_setup","title":"VAT Setup","fields":[{"id":"vrn","label":"VAT Registration Number","type":"text","required":true,"canonical_key":"vat.vrn"},{"id":"scheme","label":"VAT Scheme","type":"dropdown","required":true,"canonical_key":"vat.scheme","options":["Standard","Flat Rate","Cash Accounting"]}]},{"id":"checklist","title":"Preparation Checklist","fields":[{"id":"sales_reconciled","label":"Sales reconciled","type":"yesno","required":false,"canonical_key":"checklist.sales_reconciled"},{"id":"purchases_reconciled","label":"Purchases reconciled","type":"yesno","required":false,"canonical_key":"checklist.purchases_reconciled"},{"id":"ec_entries_checked","label":"EC entries checked","type":"yesno","required":false,"canonical_key":"checklist.ec_entries_checked"}]}]}', true, true, 1),

(NULL, 'PAYROLL', 'Payroll Workpaper', 'Standard workpaper for payroll processing', '{"sections":[{"id":"payroll_setup","title":"Payroll Details","fields":[{"id":"paye_ref","label":"PAYE Reference","type":"text","required":true,"canonical_key":"payroll.paye_ref"},{"id":"accounts_office_ref","label":"Accounts Office Reference","type":"text","required":true,"canonical_key":"payroll.accounts_office_ref"}]},{"id":"checklist","title":"Period Checklist","fields":[{"id":"starters_processed","label":"Starters processed","type":"yesno","required":false,"canonical_key":"checklist.starters_processed"},{"id":"leavers_processed","label":"Leavers processed","type":"yesno","required":false,"canonical_key":"checklist.leavers_processed"},{"id":"rti_submitted","label":"RTI submitted","type":"yesno","required":false,"canonical_key":"checklist.rti_submitted"}]}]}', true, true, 1),

(NULL, 'CIS', 'CIS Workpaper', 'Standard workpaper for CIS return preparation', '{"sections":[{"id":"cis_setup","title":"CIS Details","fields":[{"id":"contractor_utr","label":"Contractor UTR","type":"text","required":true,"canonical_key":"cis.contractor_utr"}]},{"id":"checklist","title":"Preparation Checklist","fields":[{"id":"subcontractors_verified","label":"Subcontractors verified","type":"yesno","required":false,"canonical_key":"checklist.subcontractors_verified"},{"id":"deductions_calculated","label":"Deductions calculated","type":"yesno","required":false,"canonical_key":"checklist.deductions_calculated"}]}]}', true, true, 1),

(NULL, 'PARTNERSHIP', 'Partnership Return Workpaper', 'Standard workpaper for partnership tax returns (SA800)', '{"sections":[{"id":"partnership_info","title":"Partnership Information","fields":[{"id":"partnership_name","label":"Partnership Name","type":"text","required":true,"canonical_key":"partnership.name"},{"id":"utr","label":"Partnership UTR","type":"text","required":true,"canonical_key":"partnership.utr"}]},{"id":"checklist","title":"Preparation Checklist","fields":[{"id":"accounts_agreed","label":"Partnership accounts agreed","type":"yesno","required":false,"canonical_key":"checklist.accounts_agreed"},{"id":"allocations_computed","label":"Profit allocations computed","type":"yesno","required":false,"canonical_key":"checklist.allocations_computed"},{"id":"partner_shares_exported","label":"Partner shares exported to individual returns","type":"yesno","required":false,"canonical_key":"checklist.partner_shares_exported"}]}]}', true, true, 1),

(NULL, 'SA_MTD', 'MTD ITSA Workpaper', 'Standard workpaper for Making Tax Digital ITSA', '{"sections":[{"id":"taxpayer_info","title":"Taxpayer Information","fields":[{"id":"utr","label":"UTR","type":"text","required":true,"canonical_key":"identity.utr"},{"id":"nino","label":"NINO","type":"text","required":true,"canonical_key":"identity.nino"}]},{"id":"quarterly_checklist","title":"Quarterly Update Checklist","fields":[{"id":"income_categorised","label":"Income categorised","type":"yesno","required":false,"canonical_key":"checklist.income_categorised"},{"id":"expenses_categorised","label":"Expenses categorised","type":"yesno","required":false,"canonical_key":"checklist.expenses_categorised"},{"id":"quarterly_update_submitted","label":"Quarterly update submitted","type":"yesno","required":false,"canonical_key":"checklist.quarterly_update_submitted"}]}]}', true, true, 1);

-- 5. Migration: existing workpaper_instances -> job_workpaper_instances
-- Copy existing workpaper_instances as job_workpaper_instances
INSERT INTO public.job_workpaper_instances (
  organization_id, job_id, client_id, company_id,
  template_id, name, instance_schema_json, instance_data_json,
  status, locked_at, locked_by,
  prepared_by, prepared_at, reviewed_by, reviewed_at,
  created_at, updated_at
)
SELECT
  wi.organization_id,
  wi.job_id,
  wi.client_id,
  wi.company_id,
  wi.template_id,
  wi.name,
  COALESCE(
    (SELECT wt.schema_json FROM public.workpaper_templates wt WHERE wt.id = wi.template_id),
    '{"sections":[]}'::jsonb
  ),
  wi.field_values,
  CASE
    WHEN wi.locked = true THEN 'locked'
    WHEN wi.status = 'ready_for_review' THEN 'in_review'
    ELSE 'draft'
  END,
  wi.finalised_at,
  wi.finalised_by,
  wi.prepared_by,
  wi.prepared_at,
  wi.reviewed_by,
  wi.reviewed_at,
  wi.created_at,
  wi.updated_at
FROM public.workpaper_instances wi;

-- 6. Migration: existing job documents -> job_artifacts (type = document)
INSERT INTO public.job_artifacts (
  organization_id, job_id, artifact_type, source_document_id,
  title, created_by, created_at, status, version
)
SELECT
  jd.organization_id,
  jd.job_id,
  'document',
  jd.id,
  jd.file_name,
  jd.uploaded_by,
  jd.uploaded_at,
  CASE WHEN jd.archived = true THEN 'void' ELSE 'active' END,
  COALESCE(jd.version, 1)
FROM public.job_documents jd
WHERE jd.job_id IS NOT NULL;

-- 7. Migration: questionnaire submissions linked to jobs -> job_artifacts
INSERT INTO public.job_artifacts (
  organization_id, client_id, company_id, job_id,
  artifact_type, source_questionnaire_id,
  title, period_label, created_at, status, version
)
SELECT
  qi.organization_id,
  qi.client_id,
  qi.company_id,
  qi.job_id,
  'questionnaire_submission',
  qi.id,
  qi.name,
  qi.period_label,
  qi.created_at,
  'active',
  1
FROM public.questionnaire_instances qi
WHERE qi.job_id IS NOT NULL AND qi.status = 'submitted';

-- 8. Auto-update updated_at trigger for new tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_job_artifacts_updated_at
  BEFORE UPDATE ON public.job_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workpaper_templates_updated_at
  BEFORE UPDATE ON public.workpaper_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jwi_updated_at
  BEFORE UPDATE ON public.job_workpaper_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
