-- Create automation_rule_templates table (dedicated table per CTO mandate)
CREATE TABLE public.automation_rule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config JSONB DEFAULT '{}',
  category TEXT DEFAULT 'general',
  is_system BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_rule_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view templates in their organization"
  ON public.automation_rule_templates
  FOR SELECT
  USING (
    organization_id IS NULL OR
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage templates in their organization"
  ON public.automation_rule_templates
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

-- Index
CREATE INDEX idx_automation_rule_templates_org ON public.automation_rule_templates(organization_id);
CREATE INDEX idx_automation_rule_templates_category ON public.automation_rule_templates(category);

-- Trigger for updated_at
CREATE TRIGGER update_automation_rule_templates_updated_at
  BEFORE UPDATE ON public.automation_rule_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Pre-seed UK accountancy automation templates (system templates, no org_id)
INSERT INTO public.automation_rule_templates (
  organization_id, name, description, trigger_type, trigger_config, action_type, action_config, category, is_system
) VALUES
(
  NULL,
  'Auto-create job 14 days before accounts deadline',
  'Automatically create an accounts job when the filing deadline is 14 days away',
  'deadline_approaching',
  '{"daysThreshold": 14, "deadlineType": "accounts_filing"}'::jsonb,
  'create_job',
  '{"jobName": "{{company.name}} - Annual Accounts {{period}}", "serviceType": "accounts"}'::jsonb,
  'deadlines',
  true
),
(
  NULL,
  'Notify manager when job completed',
  'Send a notification to the assigned manager when a job status changes to completed',
  'job_status_change',
  '{"toStatus": "completed"}'::jsonb,
  'send_notification',
  '{"title": "Job Completed: {{job.name}}", "message": "{{job.name}} for {{client.name}} has been marked as completed.", "notificationType": "success"}'::jsonb,
  'jobs',
  true
),
(
  NULL,
  'Create SA job when new client onboarded',
  'Automatically create a Self Assessment job when a new client is fully onboarded',
  'client_onboarded',
  '{}'::jsonb,
  'create_job',
  '{"jobName": "{{client.name}} - Self Assessment {{period}}", "serviceType": "self_assessment"}'::jsonb,
  'onboarding',
  true
),
(
  NULL,
  'Send reminder 7 days before VAT deadline',
  'Queue an email reminder when VAT return deadline is 7 days away',
  'deadline_approaching',
  '{"daysThreshold": 7, "deadlineType": "vat_return"}'::jsonb,
  'send_email',
  '{"subject": "VAT Return Reminder: Due in 7 days", "toEmail": "{{client.email}}"}'::jsonb,
  'deadlines',
  true
),
(
  NULL,
  'Create CT600 job when accounts filed',
  'Automatically create a Corporation Tax job when annual accounts are filed',
  'filing_status_change',
  '{"toStatus": "filed", "filingType": "accounts"}'::jsonb,
  'create_job',
  '{"jobName": "{{company.name}} - Corporation Tax {{period}}", "serviceType": "corporation_tax"}'::jsonb,
  'filings',
  true
),
(
  NULL,
  'Welcome email on onboarding approved',
  'Send a welcome email to the client when their onboarding is approved',
  'onboarding_approved',
  '{}'::jsonb,
  'send_email',
  '{"subject": "Welcome to {{organization.name}}", "toEmail": "{{client.email}}"}'::jsonb,
  'onboarding',
  true
),
(
  NULL,
  'Create payroll job monthly',
  'Create monthly payroll job when deadline approaches',
  'deadline_approaching',
  '{"daysThreshold": 5, "deadlineType": "payroll_rti"}'::jsonb,
  'create_job',
  '{"jobName": "{{company.name}} - Monthly Payroll {{period}}", "serviceType": "payroll"}'::jsonb,
  'payroll',
  true
),
(
  NULL,
  'Notify when deadline overdue',
  'Send urgent notification when a deadline becomes overdue',
  'deadline_approaching',
  '{"daysThreshold": 0}'::jsonb,
  'send_notification',
  '{"title": "OVERDUE: {{deadline.name}}", "message": "{{deadline.name}} for {{client.name}} is now overdue!", "notificationType": "error"}'::jsonb,
  'deadlines',
  true
);