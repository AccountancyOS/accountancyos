-- Fix portal_access table first
ALTER TABLE public.portal_access ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Now create the client_has_portal_access function
CREATE OR REPLACE FUNCTION public.client_has_portal_access(
  check_user_id UUID,
  check_client_id UUID DEFAULT NULL,
  check_company_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_access
    WHERE user_id = check_user_id
    AND (is_active IS NULL OR is_active = true)
    AND (
      (check_client_id IS NOT NULL AND client_id = check_client_id) OR
      (check_company_id IS NOT NULL AND company_id = check_company_id)
    )
  )
$$;

-- Token-based questionnaire access policies
DROP POLICY IF EXISTS "Users can view questionnaire instances in their organization" ON public.questionnaire_instances;
DROP POLICY IF EXISTS "Users can update questionnaire instances in their organization" ON public.questionnaire_instances;

CREATE POLICY "Organization users can view questionnaire instances"
ON public.questionnaire_instances FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Token-based questionnaire view access"
ON public.questionnaire_instances FOR SELECT
USING (
  access_token IS NOT NULL 
  AND (token_expires_at IS NULL OR token_expires_at > now())
);

CREATE POLICY "Organization users can update questionnaire instances"
ON public.questionnaire_instances FOR UPDATE
USING (user_has_organization_access(organization_id));

CREATE POLICY "Token-based questionnaire update access"
ON public.questionnaire_instances FOR UPDATE
USING (
  access_token IS NOT NULL 
  AND (token_expires_at IS NULL OR token_expires_at > now())
  AND status != 'submitted'
);

CREATE POLICY "Organization users can insert questionnaire instances"
ON public.questionnaire_instances FOR INSERT
WITH CHECK (user_has_organization_access(organization_id));

-- Token-based response access
DROP POLICY IF EXISTS "Users can view questionnaire responses in their organization" ON public.questionnaire_responses;
DROP POLICY IF EXISTS "Users can insert questionnaire responses in their organization" ON public.questionnaire_responses;
DROP POLICY IF EXISTS "Users can update questionnaire responses in their organization" ON public.questionnaire_responses;

CREATE POLICY "Organization users can view questionnaire responses"
ON public.questionnaire_responses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_instance_id
    AND user_has_organization_access(qi.organization_id)
  )
);

CREATE POLICY "Token-based response view access"
ON public.questionnaire_responses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_instance_id
    AND qi.access_token IS NOT NULL
    AND (qi.token_expires_at IS NULL OR qi.token_expires_at > now())
  )
);

CREATE POLICY "Organization users can insert questionnaire responses"
ON public.questionnaire_responses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_instance_id
    AND user_has_organization_access(qi.organization_id)
  )
);

CREATE POLICY "Token-based response insert access"
ON public.questionnaire_responses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_instance_id
    AND qi.access_token IS NOT NULL
    AND (qi.token_expires_at IS NULL OR qi.token_expires_at > now())
    AND qi.status != 'submitted'
  )
);

CREATE POLICY "Organization users can update questionnaire responses"
ON public.questionnaire_responses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_instance_id
    AND user_has_organization_access(qi.organization_id)
  )
);

CREATE POLICY "Token-based response update access"
ON public.questionnaire_responses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_instance_id
    AND qi.access_token IS NOT NULL
    AND (qi.token_expires_at IS NULL OR qi.token_expires_at > now())
    AND qi.status != 'submitted'
  )
);

-- Client-side RLS policies for portal data access

-- Client tasks - clients can view and update their own tasks
CREATE POLICY "Portal clients can view their tasks"
ON public.client_tasks FOR SELECT
USING (
  client_has_portal_access(auth.uid(), client_id, company_id)
  AND visibility = 'client_visible'
);

CREATE POLICY "Portal clients can update their tasks"
ON public.client_tasks FOR UPDATE
USING (
  client_has_portal_access(auth.uid(), client_id, company_id)
  AND visibility = 'client_visible'
);

-- Client messages - clients can view client-visible messages
CREATE POLICY "Portal clients can view their messages"
ON public.client_messages FOR SELECT
USING (
  client_has_portal_access(auth.uid(), client_id, company_id)
  AND visibility = 'client_visible'
);

CREATE POLICY "Portal clients can send messages"
ON public.client_messages FOR INSERT
WITH CHECK (
  client_has_portal_access(auth.uid(), client_id, company_id)
  AND sender_type = 'client'
);

-- Jobs - clients can view their jobs
CREATE POLICY "Portal clients can view their jobs"
ON public.jobs FOR SELECT
USING (
  client_has_portal_access(auth.uid(), client_id, company_id)
);

-- Deadlines - clients can view their deadlines
CREATE POLICY "Portal clients can view their deadlines"
ON public.deadlines FOR SELECT
USING (
  client_has_portal_access(auth.uid(), client_id, company_id)
);

-- Filings - clients can view their filings
CREATE POLICY "Portal clients can view their filings"
ON public.filings FOR SELECT
USING (
  client_has_portal_access(auth.uid(), client_id, company_id)
);

-- Job documents - clients can view and upload documents
CREATE POLICY "Portal clients can view their job documents"
ON public.job_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id
    AND client_has_portal_access(auth.uid(), j.client_id, j.company_id)
  )
);

CREATE POLICY "Portal clients can upload job documents"
ON public.job_documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id
    AND client_has_portal_access(auth.uid(), j.client_id, j.company_id)
  )
);

-- Storage policies for questionnaire files
CREATE POLICY "Authenticated users can upload questionnaire files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'questionnaire-files'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can read questionnaire files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'questionnaire-files'
  AND auth.role() = 'authenticated'
);