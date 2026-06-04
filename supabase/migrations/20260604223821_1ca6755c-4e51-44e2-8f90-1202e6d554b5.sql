CREATE OR REPLACE FUNCTION public.client_has_portal_access(check_user_id uuid, check_client_id uuid DEFAULT NULL::uuid, check_company_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_access
    WHERE user_id = check_user_id
      AND (is_active IS NULL OR is_active = true)
      AND status = 'active'
      AND (
        (check_client_id IS NOT NULL AND client_id = check_client_id) OR
        (check_company_id IS NOT NULL AND company_id = check_company_id)
      )
  )
$$;

CREATE POLICY "Portal clients can view their client record"
  ON public.clients FOR SELECT TO public
  USING (public.client_has_portal_access(auth.uid(), id, NULL));

CREATE POLICY "Portal clients can view their company record"
  ON public.companies FOR SELECT TO public
  USING (public.client_has_portal_access(auth.uid(), NULL, id));

CREATE POLICY "Portal clients can view their onboarding documents"
  ON public.onboarding_documents FOR SELECT TO public
  USING (public.client_has_portal_access(auth.uid(), client_id, company_id));

CREATE POLICY "Portal clients can view their questionnaire instances"
  ON public.questionnaire_instances FOR SELECT TO public
  USING (public.client_has_portal_access(auth.uid(), client_id, company_id));

CREATE POLICY "Portal clients can view their questionnaire responses"
  ON public.questionnaire_responses FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_responses.questionnaire_instance_id
      AND public.client_has_portal_access(auth.uid(), qi.client_id, qi.company_id)
  ));

CREATE POLICY "Portal clients can view their questionnaire files"
  ON public.questionnaire_files FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.questionnaire_instances qi
    WHERE qi.id = questionnaire_files.questionnaire_instance_id
      AND public.client_has_portal_access(auth.uid(), qi.client_id, qi.company_id)
  ));

CREATE POLICY "Portal clients can view their invoices"
  ON public.invoices FOR SELECT TO public
  USING (public.client_has_portal_access(auth.uid(), client_id, company_id));

CREATE POLICY "Portal clients can view their invoice payments"
  ON public.invoice_payments FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_payments.invoice_id
      AND public.client_has_portal_access(auth.uid(), i.client_id, i.company_id)
  ));

CREATE POLICY "Portal clients can view their visibility settings"
  ON public.portal_visibility_settings FOR SELECT TO public
  USING (public.client_has_portal_access(auth.uid(), client_id, company_id));

DROP POLICY IF EXISTS "Portal clients can upload job documents" ON public.job_documents;
CREATE POLICY "Portal clients can upload job documents"
  ON public.job_documents FOR INSERT TO public
  WITH CHECK (
    client_visible = true
    AND COALESCE(archived, false) = false
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_documents.job_id
        AND public.client_has_portal_access(auth.uid(), j.client_id, j.company_id)
    )
  );

DROP POLICY IF EXISTS "Portal clients can update their tasks" ON public.client_tasks;
CREATE POLICY "Portal clients can update their tasks"
  ON public.client_tasks FOR UPDATE TO public
  USING (
    public.client_has_portal_access(auth.uid(), client_id, company_id)
    AND visibility = 'client_visible'
  )
  WITH CHECK (
    public.client_has_portal_access(auth.uid(), client_id, company_id)
    AND visibility = 'client_visible'
  );

DROP POLICY IF EXISTS "Portal clients can send messages" ON public.client_messages;
CREATE POLICY "Portal clients can send messages"
  ON public.client_messages FOR INSERT TO public
  WITH CHECK (
    public.client_has_portal_access(auth.uid(), client_id, company_id)
    AND sender_type = 'client'
    AND visibility = 'client_visible'
    AND sender_id = auth.uid()
  );