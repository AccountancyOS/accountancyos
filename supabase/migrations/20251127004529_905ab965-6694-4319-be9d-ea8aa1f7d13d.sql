-- Create workpaper_instances table
CREATE TABLE workpaper_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  template_id UUID REFERENCES templates(id),
  questionnaire_instance_id UUID REFERENCES questionnaire_instances(id),
  
  -- Workpaper data
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  
  -- Field data with audit trail
  field_values JSONB NOT NULL DEFAULT '{}',
  field_overrides JSONB DEFAULT '{}',
  field_notes JSONB DEFAULT '{}',
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  finalised_at TIMESTAMPTZ,
  finalised_by UUID,
  
  CONSTRAINT valid_status CHECK (status IN ('draft', 'in_progress', 'ready_for_review', 'finalised'))
);

-- Create filings table
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  workpaper_instance_id UUID REFERENCES workpaper_instances(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  
  -- Filing type
  filing_type TEXT NOT NULL,
  filing_body TEXT NOT NULL,
  
  -- Period
  period_start DATE,
  period_end DATE,
  tax_year TEXT,
  
  -- Filing data
  filing_data JSONB NOT NULL DEFAULT '{}',
  
  -- Generated documents
  generated_documents JSONB DEFAULT '[]',
  
  -- Tax calculations
  tax_due NUMERIC(12,2),
  tax_refund NUMERIC(12,2),
  payment_deadline DATE,
  second_payment_date DATE,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- Client approval
  approval_requested_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejection_reason TEXT,
  
  -- Filing confirmation
  filed_at TIMESTAMPTZ,
  filed_by UUID,
  filing_reference TEXT,
  filing_receipt JSONB,
  
  -- Lock
  is_locked BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_status CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'ready_to_file', 'filed', 'rejected'))
);

-- Add indexes
CREATE INDEX idx_workpaper_instances_job_id ON workpaper_instances(job_id);
CREATE INDEX idx_workpaper_instances_organization_id ON workpaper_instances(organization_id);
CREATE INDEX idx_workpaper_instances_status ON workpaper_instances(status);

CREATE INDEX idx_filings_job_id ON filings(job_id);
CREATE INDEX idx_filings_organization_id ON filings(organization_id);
CREATE INDEX idx_filings_status ON filings(status);
CREATE INDEX idx_filings_filing_type ON filings(filing_type);

-- Enable RLS
ALTER TABLE workpaper_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;

-- RLS policies for workpaper_instances
CREATE POLICY "Users can view workpapers in their organization"
  ON workpaper_instances FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert workpapers in their organization"
  ON workpaper_instances FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update workpapers in their organization"
  ON workpaper_instances FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete workpapers in their organization"
  ON workpaper_instances FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS policies for filings
CREATE POLICY "Users can view filings in their organization"
  ON filings FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert filings in their organization"
  ON filings FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update filings in their organization"
  ON filings FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete filings in their organization"
  ON filings FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Triggers for updated_at
CREATE TRIGGER update_workpaper_instances_updated_at
  BEFORE UPDATE ON workpaper_instances
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_filings_updated_at
  BEFORE UPDATE ON filings
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();