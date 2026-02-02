-- Phase 5.1: Document Management Enhancement
-- Add columns to job_documents for visibility, signature tracking, and auto-archive

ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS client_visible BOOLEAN DEFAULT false;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS signature_required BOOLEAN DEFAULT false;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS signed_by UUID;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS signature_ip TEXT;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS signature_typed_name TEXT;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS scroll_verified BOOLEAN DEFAULT false;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS auto_archive_at DATE;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Phase 5.2: Contacts table - add can_sign column for directors
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS can_sign BOOLEAN DEFAULT false;

-- Create index for document queries
CREATE INDEX IF NOT EXISTS idx_job_documents_client_visible ON job_documents(job_id, client_visible) WHERE client_visible = true;
CREATE INDEX IF NOT EXISTS idx_job_documents_signature_pending ON job_documents(signature_required, signed_at) WHERE signature_required = true AND signed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_documents_archive ON job_documents(auto_archive_at, archived) WHERE archived = false;