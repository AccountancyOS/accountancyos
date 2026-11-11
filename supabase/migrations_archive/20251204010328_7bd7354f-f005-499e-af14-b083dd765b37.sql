-- Phase 5: Workpapers & Filing Engine
-- Adds filing documents table, auto rollover columns, and services catalog enhancements

-- Create storage bucket for filing documents (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('filing-documents', 'filing-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for filing documents
CREATE POLICY "Org users can upload filing docs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'filing-documents' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Org users can view filing docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'filing-documents');

CREATE POLICY "Org users can delete filing docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'filing-documents' AND auth.uid() IS NOT NULL);

-- Create filing_documents table for generated PDFs
CREATE TABLE IF NOT EXISTS public.filing_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  storage_path TEXT,
  public_url TEXT,
  mime_type TEXT DEFAULT 'application/pdf',
  file_size INTEGER,
  version INTEGER DEFAULT 1,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  generated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on filing_documents
ALTER TABLE public.filing_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for filing_documents
CREATE POLICY "Users can view filing documents in their organization"
ON public.filing_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.filings f
    WHERE f.id = filing_documents.filing_id
    AND user_has_organization_access(f.organization_id)
  )
);

CREATE POLICY "Users can insert filing documents in their organization"
ON public.filing_documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.filings f
    WHERE f.id = filing_documents.filing_id
    AND user_has_organization_access(f.organization_id)
  )
);

CREATE POLICY "Users can delete filing documents in their organization"
ON public.filing_documents FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.filings f
    WHERE f.id = filing_documents.filing_id
    AND user_has_organization_access(f.organization_id)
  )
);

-- Add columns to filings table for API submission and rollover
ALTER TABLE public.filings
ADD COLUMN IF NOT EXISTS next_year_job_id UUID REFERENCES public.jobs(id),
ADD COLUMN IF NOT EXISTS submission_payload JSONB,
ADD COLUMN IF NOT EXISTS api_response JSONB,
ADD COLUMN IF NOT EXISTS api_submission_id TEXT,
ADD COLUMN IF NOT EXISTS approval_token TEXT,
ADD COLUMN IF NOT EXISTS approval_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Add is_recurring flag to services_catalog for auto-rollover config
ALTER TABLE public.services_catalog
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS records_request_template_id UUID REFERENCES public.templates(id);

-- Add columns to jobs table for rollover tracking
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS source_job_id UUID REFERENCES public.jobs(id);

-- Add created_by_rollover to questionnaire_instances
ALTER TABLE public.questionnaire_instances
ADD COLUMN IF NOT EXISTS created_by_rollover BOOLEAN DEFAULT false;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_filing_documents_filing_id ON public.filing_documents(filing_id);
CREATE INDEX IF NOT EXISTS idx_filings_next_year_job_id ON public.filings(next_year_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_source_job_id ON public.jobs(source_job_id);

-- Function to generate approval token for client filing approval
CREATE OR REPLACE FUNCTION generate_filing_approval_token(p_filing_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate secure random token
  v_token := encode(gen_random_bytes(32), 'hex');
  
  -- Update filing with token (expires in 7 days)
  UPDATE public.filings
  SET approval_token = v_token,
      approval_token_expires_at = NOW() + INTERVAL '7 days'
  WHERE id = p_filing_id;
  
  RETURN v_token;
END;
$$;

-- Function to validate and use approval token
CREATE OR REPLACE FUNCTION validate_filing_approval_token(p_token TEXT)
RETURNS TABLE (
  filing_id UUID,
  is_valid BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filing RECORD;
BEGIN
  -- Find filing by token
  SELECT f.id, f.status, f.approval_token_expires_at
  INTO v_filing
  FROM public.filings f
  WHERE f.approval_token = p_token;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Invalid approval token'::TEXT;
    RETURN;
  END IF;
  
  IF v_filing.approval_token_expires_at < NOW() THEN
    RETURN QUERY SELECT v_filing.id, FALSE, 'Approval token has expired'::TEXT;
    RETURN;
  END IF;
  
  IF v_filing.status != 'awaiting_approval' THEN
    RETURN QUERY SELECT v_filing.id, FALSE, 'Filing is not awaiting approval'::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT v_filing.id, TRUE, NULL::TEXT;
END;
$$;