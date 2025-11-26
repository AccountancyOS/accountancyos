-- Create jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  job_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  status TEXT NOT NULL DEFAULT 'not_started',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID,
  filing_deadline DATE,
  internal_target_date DATE,
  tags JSONB DEFAULT '[]'::jsonb,
  automation_source TEXT DEFAULT 'manual',
  progress INTEGER DEFAULT 0,
  template_id UUID,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT jobs_status_check CHECK (status IN ('not_started', 'in_progress', 'waiting_on_client', 'with_reviewer', 'filed', 'on_hold', 'cancelled', 'completed')),
  CONSTRAINT jobs_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT jobs_automation_source_check CHECK (automation_source IN ('manual', 'scheduled', 'template'))
);

-- Create job_tasks table
CREATE TABLE public.job_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo',
  task_order INTEGER DEFAULT 0,
  stage TEXT,
  dependencies JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT job_tasks_status_check CHECK (status IN ('todo', 'doing', 'done', 'blocked'))
);

-- Create job_templates table
CREATE TABLE public.job_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  default_status TEXT DEFAULT 'not_started',
  default_priority TEXT DEFAULT 'normal',
  default_tags JSONB DEFAULT '[]'::jsonb,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  recurrence_config JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create job_conversations table for task-level and job-level conversations
CREATE TABLE public.job_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  sender_id UUID,
  sender_type TEXT NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'client_visible',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT job_conversations_sender_type_check CHECK (sender_type IN ('accountant', 'client')),
  CONSTRAINT job_conversations_visibility_check CHECK (visibility IN ('client_visible', 'internal'))
);

-- Create job_documents table
CREATE TABLE public.job_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.job_tasks(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  version INTEGER DEFAULT 1
);

-- Create job_timeline table for audit log
CREATE TABLE public.job_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.job_tasks(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies for jobs
CREATE POLICY "Users can view jobs in their organization"
  ON public.jobs FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert jobs in their organization"
  ON public.jobs FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update jobs in their organization"
  ON public.jobs FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete jobs in their organization"
  ON public.jobs FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for job_tasks
CREATE POLICY "Users can view tasks in their organization"
  ON public.job_tasks FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert tasks in their organization"
  ON public.job_tasks FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update tasks in their organization"
  ON public.job_tasks FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete tasks in their organization"
  ON public.job_tasks FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for job_templates
CREATE POLICY "Users can view templates in their organization"
  ON public.job_templates FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Admins can manage templates"
  ON public.job_templates FOR ALL
  USING (user_has_organization_access(organization_id) AND (has_organization_role('owner') OR has_organization_role('admin')));

-- RLS Policies for job_conversations
CREATE POLICY "Users can view conversations in their organization"
  ON public.job_conversations FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert conversations in their organization"
  ON public.job_conversations FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

-- RLS Policies for job_documents
CREATE POLICY "Users can view documents in their organization"
  ON public.job_documents FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert documents in their organization"
  ON public.job_documents FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update documents in their organization"
  ON public.job_documents FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete documents in their organization"
  ON public.job_documents FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for job_timeline
CREATE POLICY "Users can view timeline in their organization"
  ON public.job_timeline FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert timeline in their organization"
  ON public.job_timeline FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

-- Create indexes for performance
CREATE INDEX idx_jobs_organization_id ON public.jobs(organization_id);
CREATE INDEX idx_jobs_client_id ON public.jobs(client_id);
CREATE INDEX idx_jobs_company_id ON public.jobs(company_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_assigned_to ON public.jobs(assigned_to);
CREATE INDEX idx_jobs_filing_deadline ON public.jobs(filing_deadline);

CREATE INDEX idx_job_tasks_job_id ON public.job_tasks(job_id);
CREATE INDEX idx_job_tasks_assigned_to ON public.job_tasks(assigned_to);
CREATE INDEX idx_job_tasks_status ON public.job_tasks(status);

CREATE INDEX idx_job_conversations_job_id ON public.job_conversations(job_id);
CREATE INDEX idx_job_conversations_task_id ON public.job_conversations(task_id);

CREATE INDEX idx_job_documents_job_id ON public.job_documents(job_id);
CREATE INDEX idx_job_documents_task_id ON public.job_documents(task_id);

CREATE INDEX idx_job_timeline_job_id ON public.job_timeline(job_id);

-- Create triggers for updated_at
CREATE TRIGGER handle_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_job_tasks_updated_at
  BEFORE UPDATE ON public.job_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_job_templates_updated_at
  BEFORE UPDATE ON public.job_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();