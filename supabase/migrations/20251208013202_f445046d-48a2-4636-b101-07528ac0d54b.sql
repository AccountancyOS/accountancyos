-- Phase 3 Completion: Records Requests & Task Tracking
-- Add columns to client_tasks for rich records request functionality

ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id);
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'document';
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS target_folder TEXT;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS file_tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS verified_by UUID;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS conditional_visibility JSONB;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS source_template_task_id UUID;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add columns to job_tasks for template origin tracking
ALTER TABLE job_tasks ADD COLUMN IF NOT EXISTS source_template_task_id UUID;
ALTER TABLE job_tasks ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_client_tasks_job_id ON client_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_verified ON client_tasks(is_verified) WHERE is_verified = false;
CREATE INDEX IF NOT EXISTS idx_job_tasks_source_template ON job_tasks(source_template_task_id);

-- Add comment for request_type values
COMMENT ON COLUMN client_tasks.request_type IS 'Type of records request: document, questionnaire, or information';
COMMENT ON COLUMN client_tasks.target_folder IS 'Template path for file uploads, e.g., workpapers/{{period}}/bank-statements';
COMMENT ON COLUMN client_tasks.conditional_visibility IS 'DSL conditions for when this request should be visible to client';