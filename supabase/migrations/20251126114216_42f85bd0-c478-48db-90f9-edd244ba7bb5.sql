-- Questionnaire instances (sent to clients)
CREATE TABLE IF NOT EXISTS public.questionnaire_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id UUID, -- Will reference jobs table when it's created
  task_id UUID REFERENCES public.client_tasks(id) ON DELETE SET NULL,
  
  -- Instance-specific overrides
  name TEXT NOT NULL,
  questions JSONB NOT NULL, -- Snapshot of questions at send time
  
  -- Metadata
  service TEXT,
  period_start DATE,
  period_end DATE,
  period_label TEXT, -- e.g. "2024 Tax Year", "Q1 2024"
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'in_progress', 'submitted', 'reviewed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  
  -- Secure access
  access_token TEXT NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT client_or_company_required CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Questionnaire responses (answers)
CREATE TABLE IF NOT EXISTS public.questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_instance_id UUID NOT NULL REFERENCES public.questionnaire_instances(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL, -- ID from the questions JSONB
  
  -- Answer storage (type depends on question type)
  answer_text TEXT,
  answer_number NUMERIC,
  answer_boolean BOOLEAN,
  answer_date DATE,
  answer_array JSONB, -- For multi-select, file references
  
  -- Progress tracking
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(questionnaire_instance_id, question_id)
);

-- Questionnaire file uploads
CREATE TABLE IF NOT EXISTS public.questionnaire_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  questionnaire_instance_id UUID NOT NULL REFERENCES public.questionnaire_instances(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  
  -- File metadata
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  -- Linking to client documents
  is_archived_to_documents BOOLEAN DEFAULT false,
  document_folder TEXT,
  
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.questionnaire_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for questionnaire_instances
CREATE POLICY "Users can view questionnaire instances in their organization"
  ON public.questionnaire_instances FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert questionnaire instances in their organization"
  ON public.questionnaire_instances FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update questionnaire instances in their organization"
  ON public.questionnaire_instances FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete questionnaire instances in their organization"
  ON public.questionnaire_instances FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for questionnaire_responses
CREATE POLICY "Users can view responses in their organization"
  ON public.questionnaire_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.questionnaire_instances
    WHERE questionnaire_instances.id = questionnaire_responses.questionnaire_instance_id
    AND user_has_organization_access(questionnaire_instances.organization_id)
  ));

CREATE POLICY "Users can insert responses in their organization"
  ON public.questionnaire_responses FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.questionnaire_instances
    WHERE questionnaire_instances.id = questionnaire_responses.questionnaire_instance_id
    AND user_has_organization_access(questionnaire_instances.organization_id)
  ));

CREATE POLICY "Users can update responses in their organization"
  ON public.questionnaire_responses FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.questionnaire_instances
    WHERE questionnaire_instances.id = questionnaire_responses.questionnaire_instance_id
    AND user_has_organization_access(questionnaire_instances.organization_id)
  ));

-- RLS Policies for questionnaire_files
CREATE POLICY "Users can view questionnaire files in their organization"
  ON public.questionnaire_files FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert questionnaire files in their organization"
  ON public.questionnaire_files FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update questionnaire files in their organization"
  ON public.questionnaire_files FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete questionnaire files in their organization"
  ON public.questionnaire_files FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Triggers for updated_at
CREATE TRIGGER update_questionnaire_instances_updated_at
  BEFORE UPDATE ON public.questionnaire_instances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_questionnaire_responses_updated_at
  BEFORE UPDATE ON public.questionnaire_responses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to generate secure access token
CREATE OR REPLACE FUNCTION generate_questionnaire_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$;

-- Storage bucket for questionnaire files
INSERT INTO storage.buckets (id, name, public)
VALUES ('questionnaire-files', 'questionnaire-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for questionnaire files
CREATE POLICY "Users can upload questionnaire files in their organization"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view questionnaire files in their organization"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update questionnaire files in their organization"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete questionnaire files in their organization"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'questionnaire-files' AND
  auth.uid() IS NOT NULL
);