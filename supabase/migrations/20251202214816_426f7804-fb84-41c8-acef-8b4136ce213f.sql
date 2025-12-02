-- Add job_id to email_messages for job tagging
ALTER TABLE public.email_messages 
ADD COLUMN job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;

-- Create index for job_id lookups
CREATE INDEX idx_email_messages_job_id ON public.email_messages(job_id) WHERE job_id IS NOT NULL;

-- Add full-text search column and index
ALTER TABLE public.email_messages 
ADD COLUMN search_vector tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE(subject, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(from_email, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(body_text, '')), 'C')
) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX idx_email_messages_search ON public.email_messages USING GIN(search_vector);

-- Create index for searching by to_emails array
CREATE INDEX idx_email_messages_to_emails ON public.email_messages USING GIN(to_emails);

-- Add composite indexes for common query patterns
CREATE INDEX idx_email_messages_org_client ON public.email_messages(organization_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_email_messages_org_company ON public.email_messages(organization_id, company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_email_messages_org_job ON public.email_messages(organization_id, job_id) WHERE job_id IS NOT NULL;