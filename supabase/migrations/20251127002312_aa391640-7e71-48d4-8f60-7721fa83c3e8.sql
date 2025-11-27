-- Add VAT configuration to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS vat_scheme TEXT CHECK (vat_scheme IN ('STANDARD', 'FLAT_RATE', 'CASH_ACCOUNTING', 'ANNUAL_ACCOUNTING', 'NONE')),
ADD COLUMN IF NOT EXISTS vat_frequency TEXT CHECK (vat_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
ADD COLUMN IF NOT EXISTS vat_stagger_group INTEGER CHECK (vat_stagger_group IN (1, 2, 3));

-- Add service configuration to engagements for payroll settings
ALTER TABLE engagements 
ADD COLUMN IF NOT EXISTS service_config JSONB DEFAULT '{}';

COMMENT ON COLUMN engagements.service_config IS 'Configuration for service-specific settings like payroll frequency: {"payroll_frequency": "MONTHLY", "pay_day": 25}';

-- Create deadlines table
CREATE TABLE IF NOT EXISTS deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity linking
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  
  -- Deadline info
  name TEXT NOT NULL,
  description TEXT,
  deadline_type TEXT NOT NULL CHECK (deadline_type IN ('statutory', 'internal', 'custom')),
  filing_body TEXT CHECK (filing_body IN ('HMRC', 'COMPANIES_HOUSE', 'INTERNAL', 'CUSTOM')),
  service_code TEXT,
  
  -- Dates
  period_start DATE,
  period_end DATE,
  due_date DATE NOT NULL,
  payment_date DATE,
  warning_date DATE,
  active_window_start DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'filed', 'overdue', 'cancelled')),
  completed_at TIMESTAMPTZ,
  filed_at TIMESTAMPTZ,
  
  -- Risk scoring
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_factors JSONB DEFAULT '[]',
  
  -- Recurrence
  recurrence_rule JSONB,
  parent_deadline_id UUID REFERENCES deadlines(id) ON DELETE CASCADE,
  
  -- Ownership
  owner_id UUID,
  
  -- Metadata
  required_documents JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for deadlines
CREATE INDEX IF NOT EXISTS idx_deadlines_organization_id ON deadlines(organization_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_client_id ON deadlines(client_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_company_id ON deadlines(company_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
CREATE INDEX IF NOT EXISTS idx_deadlines_owner_id ON deadlines(owner_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_job_id ON deadlines(job_id);

-- Enable RLS on deadlines
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;

-- RLS policies for deadlines
CREATE POLICY "Users can view deadlines in their organization"
  ON deadlines FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert deadlines in their organization"
  ON deadlines FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update deadlines in their organization"
  ON deadlines FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete deadlines in their organization"
  ON deadlines FOR DELETE
  USING (user_has_organization_access(organization_id));

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Content
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  
  -- Entity references
  entity_type TEXT CHECK (entity_type IN ('deadline', 'job', 'document', 'message', 'task')),
  entity_id UUID,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  -- Payload for additional data
  payload JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS on notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid() AND user_has_organization_access(organization_id));

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid() AND user_has_organization_access(organization_id));

-- Create email queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Recipient
  to_email TEXT NOT NULL,
  to_name TEXT,
  
  -- Content
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  
  -- Merge data
  merge_data JSONB DEFAULT '{}',
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- References
  entity_type TEXT,
  entity_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for email queue
CREATE INDEX IF NOT EXISTS idx_email_queue_organization_id ON email_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_at ON email_queue(scheduled_at);

-- Enable RLS on email queue
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for email queue
CREATE POLICY "Users can view email queue in their organization"
  ON email_queue FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert email queue in their organization"
  ON email_queue FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

-- Create trigger for updated_at on deadlines
CREATE OR REPLACE TRIGGER update_deadlines_updated_at
  BEFORE UPDATE ON deadlines
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();