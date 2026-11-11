-- Phase 1: Companies House Filing Engine - Database Migrations

-- 1. Add environment and CH-specific columns to filings table
ALTER TABLE filings 
ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'test' CHECK (environment IN ('test', 'production')),
ADD COLUMN IF NOT EXISTS ch_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_submission_error TEXT;

-- 2. Add Companies House auth code to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS companies_house_auth_code TEXT;

-- 3. Add presenter_name to organization CH settings, remove api_key_encrypted
ALTER TABLE organization_integrations_companies_house 
ADD COLUMN IF NOT EXISTS presenter_name TEXT;

-- Drop the api_key_encrypted column (no longer needed - centralised API key)
ALTER TABLE organization_integrations_companies_house 
DROP COLUMN IF EXISTS api_key_encrypted;

-- 4. Create filing_submissions table for audit logging
CREATE TABLE IF NOT EXISTS filing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID REFERENCES filings(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  filing_type TEXT NOT NULL,
  request_payload TEXT,
  request_headers JSONB,
  response_status_code INTEGER,
  response_payload TEXT,
  response_headers JSONB,
  ch_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for filing_submissions
CREATE INDEX IF NOT EXISTS idx_filing_submissions_filing_id ON filing_submissions(filing_id);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_org_id ON filing_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_status ON filing_submissions(status);

-- Enable RLS on filing_submissions
ALTER TABLE filing_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for filing_submissions
CREATE POLICY "Users can view filing submissions in their org"
ON filing_submissions FOR SELECT
USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can insert filing submissions in their org"
ON filing_submissions FOR INSERT
WITH CHECK (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can update filing submissions in their org"
ON filing_submissions FOR UPDATE
USING (user_in_organization(auth.uid(), organization_id));

-- 5. Add comment for documentation
COMMENT ON TABLE filing_submissions IS 'Audit log for all filing submission attempts to Companies House and HMRC';
COMMENT ON COLUMN filings.environment IS 'Filing environment: test (sandbox) or production';
COMMENT ON COLUMN companies.companies_house_auth_code IS 'Company-specific Companies House authentication code for filings';