
-- Phase 4: Document folders + CRM follow-up sequences

-- 1. Client-scoped document folders
CREATE TABLE public.document_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.document_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, parent_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_folders TO authenticated;
GRANT ALL ON public.document_folders TO service_role;

ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage document folders"
  ON public.document_folders
  FOR ALL
  TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

CREATE INDEX idx_document_folders_client ON public.document_folders(client_id, parent_id);

-- 2. Add folder_id to job_documents
ALTER TABLE public.job_documents
  ADD COLUMN folder_id UUID REFERENCES public.document_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_job_documents_folder ON public.job_documents(folder_id) WHERE folder_id IS NOT NULL;

-- 3. CRM follow-up sequences (Klaviyo-style)
CREATE TABLE public.crm_followup_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_stage TEXT NOT NULL DEFAULT 'new',
  is_active BOOLEAN NOT NULL DEFAULT true,
  stop_on_stages JSONB NOT NULL DEFAULT '["won","lost"]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_followup_sequences TO authenticated;
GRANT ALL ON public.crm_followup_sequences TO service_role;

ALTER TABLE public.crm_followup_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage followup sequences"
  ON public.crm_followup_sequences
  FOR ALL
  TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()));

-- 4. Steps within a sequence
CREATE TABLE public.crm_followup_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.crm_followup_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','task','sms')),
  subject TEXT,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_followup_steps TO authenticated;
GRANT ALL ON public.crm_followup_steps TO service_role;

ALTER TABLE public.crm_followup_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage followup steps via sequence"
  ON public.crm_followup_steps
  FOR ALL
  TO authenticated
  USING (sequence_id IN (
    SELECT id FROM public.crm_followup_sequences
    WHERE organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  ))
  WITH CHECK (sequence_id IN (
    SELECT id FROM public.crm_followup_sequences
    WHERE organization_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  ));

-- 5. updated_at triggers (reuse existing function)
CREATE TRIGGER trg_document_folders_updated_at
  BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_followup_sequences_updated_at
  BEFORE UPDATE ON public.crm_followup_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_followup_steps_updated_at
  BEFORE UPDATE ON public.crm_followup_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
