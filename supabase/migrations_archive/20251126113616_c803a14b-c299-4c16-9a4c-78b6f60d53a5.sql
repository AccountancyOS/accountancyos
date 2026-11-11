-- Templates system tables
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('workpaper', 'email', 'job', 'task', 'checklist', 'automation')),
  service TEXT, -- Accounts, SA, VAT, Bookkeeping, Payroll, CoSec, Advisory
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
  tags JSONB DEFAULT '[]'::jsonb,
  content JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores template-specific data structure
  version_number INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_notes TEXT
);

-- Client Portal: Tasks
CREATE TABLE IF NOT EXISTS public.client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete')),
  visibility TEXT NOT NULL DEFAULT 'client_visible' CHECK (visibility IN ('client_visible', 'internal_only')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  task_order INTEGER DEFAULT 0,
  template_id UUID REFERENCES public.templates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_or_company_required CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Client Portal: Messages/Conversation
CREATE TABLE IF NOT EXISTS public.client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('staff', 'client', 'system')),
  message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'email', 'note', 'system_event')),
  visibility TEXT NOT NULL DEFAULT 'client_visible' CHECK (visibility IN ('client_visible', 'internal_only')),
  subject TEXT,
  content TEXT NOT NULL,
  parent_message_id UUID REFERENCES public.client_messages(id),
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_or_company_required CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Template merge fields registry
CREATE TABLE IF NOT EXISTS public.template_merge_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,
  field_label TEXT NOT NULL,
  field_category TEXT NOT NULL, -- client, company, service, job, user, organization
  description TEXT,
  example_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automation rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- new_client, engagement_signed, job_created, job_status_change, deadline_approaching
  trigger_config JSONB DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL, -- create_job, create_tasks, send_email, post_message
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_merge_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for templates
CREATE POLICY "Users can view templates in their organization"
  ON public.templates FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins can insert templates"
  ON public.templates FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id) AND has_organization_role('owner') OR has_organization_role('admin'));

CREATE POLICY "Admins can update templates"
  ON public.templates FOR UPDATE
  USING (user_has_organization_access(organization_id) AND has_organization_role('owner') OR has_organization_role('admin'));

CREATE POLICY "Admins can delete templates"
  ON public.templates FOR DELETE
  USING (user_has_organization_access(organization_id) AND has_organization_role('owner') OR has_organization_role('admin'));

-- RLS Policies for template_versions
CREATE POLICY "Users can view template versions in their organization"
  ON public.template_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.templates
    WHERE templates.id = template_versions.template_id
    AND user_has_organization_access(templates.organization_id)
  ));

CREATE POLICY "Admins can insert template versions"
  ON public.template_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.templates
    WHERE templates.id = template_versions.template_id
    AND user_has_organization_access(templates.organization_id)
    AND (has_organization_role('owner') OR has_organization_role('admin'))
  ));

-- RLS Policies for client_tasks
CREATE POLICY "Users can view tasks in their organization"
  ON public.client_tasks FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert tasks in their organization"
  ON public.client_tasks FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update tasks in their organization"
  ON public.client_tasks FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete tasks in their organization"
  ON public.client_tasks FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for client_messages
CREATE POLICY "Users can view messages in their organization"
  ON public.client_messages FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert messages in their organization"
  ON public.client_messages FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update messages in their organization"
  ON public.client_messages FOR UPDATE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for template_merge_fields (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view merge fields"
  ON public.template_merge_fields FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for automation_rules
CREATE POLICY "Users can view automation rules in their organization"
  ON public.automation_rules FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins can manage automation rules"
  ON public.automation_rules FOR ALL
  USING (user_has_organization_access(organization_id) AND (has_organization_role('owner') OR has_organization_role('admin')));

-- Seed merge fields
INSERT INTO public.template_merge_fields (field_key, field_label, field_category, description, example_value) VALUES
  ('client.first_name', 'Client First Name', 'client', 'First name of the individual client', 'John'),
  ('client.last_name', 'Client Last Name', 'client', 'Last name of the individual client', 'Smith'),
  ('client.email', 'Client Email', 'client', 'Email address of the client', 'john@example.com'),
  ('client.phone', 'Client Phone', 'client', 'Phone number of the client', '07700 900000'),
  ('company.name', 'Company Name', 'company', 'Registered company name', 'Acme Ltd'),
  ('company.company_number', 'Company Number', 'company', 'Companies House number', '12345678'),
  ('service.name', 'Service Name', 'service', 'Name of the service', 'Annual Accounts'),
  ('job.period_end', 'Job Period End', 'job', 'Period end date for the job', '31/12/2024'),
  ('user.first_name', 'Staff First Name', 'user', 'First name of staff member', 'Sarah'),
  ('organization.name', 'Practice Name', 'organization', 'Name of the accounting firm', 'Smith & Co Accountants')
ON CONFLICT (field_key) DO NOTHING;

-- Triggers for updated_at
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_client_tasks_updated_at
  BEFORE UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();