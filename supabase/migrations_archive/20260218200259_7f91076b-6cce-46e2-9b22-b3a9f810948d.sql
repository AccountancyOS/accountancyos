
-- ============================================================
-- Chaser Policies v2: Full Schema
-- ============================================================

-- 1. Add missing service codes for new chaser policy types
-- These will be inserted per-org in the seeding step below

-- 2. Create automation_chaser_policies table
CREATE TABLE public.automation_chaser_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  trigger_type text NOT NULL CHECK (trigger_type IN ('COMPANY_YEAR_END', 'TAX_YEAR_END', 'MTD_QUARTER_END', 'VAT_PERIOD_END', 'MANUAL', 'JOB_CREATED')),
  trigger_offset_days int NOT NULL DEFAULT 0,
  frequency_unit text NOT NULL DEFAULT 'MONTH' CHECK (frequency_unit IN ('DAY', 'WEEK', 'MONTH')),
  frequency_interval int NOT NULL DEFAULT 1,
  min_frequency_interval int NOT NULL DEFAULT 1,
  max_frequency_interval int NOT NULL DEFAULT 12,
  email_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  stop_condition_type text NOT NULL DEFAULT 'JOB_STATUS_EQUALS',
  stop_condition_value text NOT NULL DEFAULT 'records_received',
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_chaser_policy_org_service UNIQUE (organization_id, service_code)
);

ALTER TABLE public.automation_chaser_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chaser policies for their org"
  ON public.automation_chaser_policies FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert chaser policies for their org"
  ON public.automation_chaser_policies FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update chaser policies for their org"
  ON public.automation_chaser_policies FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete chaser policies for their org"
  ON public.automation_chaser_policies FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

-- 3. Create automation_chaser_runs table
CREATE TABLE public.automation_chaser_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.automation_chaser_policies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STOPPED', 'PAUSED')),
  trigger_date timestamptz NOT NULL,
  period_start date,
  period_end date,
  next_send_at timestamptz,
  frequency_unit text NOT NULL,
  frequency_interval int NOT NULL,
  email_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  stop_condition_value text NOT NULL DEFAULT 'records_received',
  last_sent_at timestamptz,
  send_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_chaser_run_job_policy UNIQUE (job_id, policy_id)
);

ALTER TABLE public.automation_chaser_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chaser runs for their org"
  ON public.automation_chaser_runs FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert chaser runs for their org"
  ON public.automation_chaser_runs FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update chaser runs for their org"
  ON public.automation_chaser_runs FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete chaser runs for their org"
  ON public.automation_chaser_runs FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE INDEX idx_chaser_runs_status_next ON public.automation_chaser_runs (status, next_send_at);
CREATE INDEX idx_chaser_runs_job ON public.automation_chaser_runs (job_id);

-- 4. Create automation_chaser_messages table
CREATE TABLE public.automation_chaser_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  chaser_run_id uuid NOT NULL REFERENCES public.automation_chaser_runs(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  rendered_subject text NOT NULL DEFAULT '',
  rendered_body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'CANCELLED')),
  send_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failure_reason text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_chaser_message_idempotency UNIQUE (idempotency_key)
);

ALTER TABLE public.automation_chaser_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chaser messages for their org"
  ON public.automation_chaser_messages FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert chaser messages for their org"
  ON public.automation_chaser_messages FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update chaser messages for their org"
  ON public.automation_chaser_messages FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE INDEX idx_chaser_messages_run_status ON public.automation_chaser_messages (chaser_run_id, status);

-- 5. Create chaser_job_periods table (idempotent job creation tracking)
CREATE TABLE public.chaser_job_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('company', 'client')),
  entity_id uuid NOT NULL,
  period_end date NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_chaser_job_period UNIQUE (organization_id, service_code, entity_id, period_end)
);

ALTER TABLE public.chaser_job_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chaser job periods for their org"
  ON public.chaser_job_periods FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert chaser job periods for their org"
  ON public.chaser_job_periods FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

-- 6. Seed default chaser policies for ALL existing organizations
-- Each org gets one policy per service code
INSERT INTO public.automation_chaser_policies (organization_id, service_code, name, description, trigger_type, trigger_offset_days, frequency_unit, frequency_interval, min_frequency_interval, max_frequency_interval)
SELECT
  o.id,
  v.service_code,
  v.name,
  v.description,
  v.trigger_type,
  v.trigger_offset_days,
  v.frequency_unit,
  v.frequency_interval,
  v.min_freq,
  v.max_freq
FROM public.organizations o
CROSS JOIN (VALUES
  ('CT600', 'CT600 Records Chaser', 'Remind clients to send records for corporation tax', 'COMPANY_YEAR_END', 0, 'MONTH', 1, 1, 6),
  ('SA-RETURN', 'SA Records Chaser', 'Remind clients to send self assessment records', 'TAX_YEAR_END', 0, 'MONTH', 1, 1, 6),
  ('VAT-RETURN', 'VAT Records Chaser', 'Remind clients to send VAT records', 'VAT_PERIOD_END', 0, 'WEEK', 1, 1, 4),
  ('ANNUAL-ACC', 'Annual Accounts Records Chaser', 'Remind clients to send records for annual accounts', 'COMPANY_YEAR_END', 0, 'MONTH', 1, 1, 6),
  ('CONFIRM-STMT', 'Confirmation Statement Chaser', 'Remind clients about confirmation statement', 'COMPANY_YEAR_END', 0, 'MONTH', 1, 1, 6),
  ('PAYROLL', 'Payroll Records Chaser', 'Remind clients to send payroll records', 'JOB_CREATED', 0, 'MONTH', 1, 1, 6),
  ('BK-MONTHLY', 'Monthly Bookkeeping Records Chaser', 'Remind clients to send monthly bookkeeping records', 'JOB_CREATED', 0, 'MONTH', 1, 1, 6),
  ('BK-ANNUAL', 'Annual Bookkeeping Records Chaser', 'Remind clients to send annual bookkeeping records', 'JOB_CREATED', 0, 'MONTH', 1, 1, 6)
) AS v(service_code, name, description, trigger_type, trigger_offset_days, frequency_unit, frequency_interval, min_freq, max_freq)
ON CONFLICT (organization_id, service_code) DO NOTHING;

-- Also seed for service codes that may or may not exist yet in services_catalog per-org
-- We seed the policies regardless — the policy references service_code as text, not FK

-- Additional policies for codes not in services_catalog yet (SA-MTD, CGT)
INSERT INTO public.automation_chaser_policies (organization_id, service_code, name, description, trigger_type, trigger_offset_days, frequency_unit, frequency_interval, min_frequency_interval, max_frequency_interval)
SELECT
  o.id,
  v.service_code,
  v.name,
  v.description,
  v.trigger_type,
  v.trigger_offset_days,
  v.frequency_unit,
  v.frequency_interval,
  v.min_freq,
  v.max_freq
FROM public.organizations o
CROSS JOIN (VALUES
  ('SA-MTD-QUARTERLY', 'SA MTD Quarterly Records Chaser', 'Remind clients to send MTD quarterly records', 'MTD_QUARTER_END', 0, 'MONTH', 1, 1, 6),
  ('SA-MTD-ANNUAL', 'SA MTD Annual Confirmation Chaser', 'Remind clients about MTD annual confirmation', 'TAX_YEAR_END', 0, 'MONTH', 1, 1, 6),
  ('CGT', 'CGT Records Chaser', 'Remind clients to send CGT records', 'MANUAL', 0, 'WEEK', 2, 1, 8)
) AS v(service_code, name, description, trigger_type, trigger_offset_days, frequency_unit, frequency_interval, min_freq, max_freq)
ON CONFLICT (organization_id, service_code) DO NOTHING;

-- 7. Deprecate legacy records-chaser workflow templates
UPDATE public.automation_workflow_templates
SET default_enabled = false
WHERE key IN (
  'LTD_ACCOUNTS_CT_ANNUAL', 'SA_NON_MTD_ANNUAL', 'SA_MTD_QUARTERLY',
  'SA_MTD_ANNUAL_EOPS', 'VAT_QUARTERLY'
);

-- Stop active workflow instances for deprecated templates
UPDATE public.automation_workflow_instances
SET status = 'stopped', updated_at = now()
WHERE template_id IN (
  SELECT id FROM public.automation_workflow_templates
  WHERE key IN ('LTD_ACCOUNTS_CT_ANNUAL', 'SA_NON_MTD_ANNUAL', 'SA_MTD_QUARTERLY', 'SA_MTD_ANNUAL_EOPS', 'VAT_QUARTERLY')
)
AND status IN ('active', 'waiting');

-- 8. Create trigger for updated_at on chaser_policies
CREATE TRIGGER update_chaser_policies_updated_at
  BEFORE UPDATE ON public.automation_chaser_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chaser_runs_updated_at
  BEFORE UPDATE ON public.automation_chaser_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
