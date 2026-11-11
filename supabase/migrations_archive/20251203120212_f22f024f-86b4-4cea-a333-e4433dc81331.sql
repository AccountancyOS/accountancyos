-- Phase A: Gold-Standard Email Architecture Database Schema

-- 1. Create email_threads table for conversation tracking
CREATE TABLE public.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_thread_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  subject TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  initiated_by TEXT NOT NULL DEFAULT 'unknown' CHECK (initiated_by IN ('accountancyos', 'client', 'unknown')),
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(organization_id, external_thread_id, provider)
);

-- 2. Create email_attachments table
CREATE TABLE public.email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,
  is_inline BOOLEAN DEFAULT false,
  content_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Create email_push_subscriptions table for webhook tracking
CREATE TABLE public.email_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES public.connected_mailboxes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  subscription_id TEXT,
  resource_uri TEXT,
  history_id TEXT,
  delta_link TEXT,
  expiration_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Expand email_queue table
ALTER TABLE public.email_queue 
  ADD COLUMN IF NOT EXISTS mailbox_id UUID REFERENCES public.connected_mailboxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('invoice', 'chase', 'onboarding', 'filing', 'ad-hoc', 'portal', 'system')),
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'postmark' CHECK (provider IN ('postmark', 'gmail', 'outlook')),
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Update email_queue status to support all states
-- First drop default then add check constraint
ALTER TABLE public.email_queue 
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status SET DEFAULT 'queued';

-- Add check constraint for status
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_queue_status_check'
  ) THEN
    ALTER TABLE public.email_queue 
      ADD CONSTRAINT email_queue_status_check 
      CHECK (status IN ('draft', 'queued', 'pending', 'sent', 'failed', 'ignored'));
  END IF;
END $$;

-- 5. Add columns to email_messages for conversation tracking
ALTER TABLE public.email_messages 
  ADD COLUMN IF NOT EXISTS thread_ref UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_reason TEXT CHECK (link_reason IN ('reply_to_known', 'sender_match_reference', 'manual', 'accountancyos_initiated')),
  ADD COLUMN IF NOT EXISTS link_reference TEXT,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;

-- 6. Enable RLS on new tables
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for email_threads
CREATE POLICY "Users can view threads in their organization"
  ON public.email_threads FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert threads in their organization"
  ON public.email_threads FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update threads in their organization"
  ON public.email_threads FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete threads in their organization"
  ON public.email_threads FOR DELETE
  USING (user_has_organization_access(organization_id));

-- 8. RLS Policies for email_attachments (via email_messages)
CREATE POLICY "Users can view attachments via email messages"
  ON public.email_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_attachments.email_message_id
    AND user_has_organization_access(em.organization_id)
  ));

CREATE POLICY "Users can insert attachments via email messages"
  ON public.email_attachments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_attachments.email_message_id
    AND user_has_organization_access(em.organization_id)
  ));

CREATE POLICY "Users can delete attachments via email messages"
  ON public.email_attachments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_attachments.email_message_id
    AND user_has_organization_access(em.organization_id)
  ));

-- 9. RLS Policies for email_push_subscriptions (via connected_mailboxes)
CREATE POLICY "Users can view their push subscriptions"
  ON public.email_push_subscriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.connected_mailboxes cm
    WHERE cm.id = email_push_subscriptions.mailbox_id
    AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their push subscriptions"
  ON public.email_push_subscriptions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.connected_mailboxes cm
    WHERE cm.id = email_push_subscriptions.mailbox_id
    AND cm.user_id = auth.uid()
  ));

-- 10. Add UPDATE policy to email_queue
CREATE POLICY "Users can update email queue in their organization"
  ON public.email_queue FOR UPDATE
  USING (user_has_organization_access(organization_id));

-- 11. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_threads_org_id ON public.email_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_external_id ON public.email_threads(external_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_client_id ON public.email_threads(client_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_company_id ON public.email_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_job_id ON public.email_threads(job_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_message_id ON public.email_attachments(email_message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_ref ON public.email_messages(thread_ref);
CREATE INDEX IF NOT EXISTS idx_email_messages_needs_review ON public.email_messages(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_mailbox_id ON public.email_queue(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_client_id ON public.email_queue(client_id);
CREATE INDEX IF NOT EXISTS idx_email_push_subscriptions_mailbox ON public.email_push_subscriptions(mailbox_id);

-- 12. Insert additional merge fields
INSERT INTO public.template_merge_fields (field_key, field_label, field_category, description, example_value) VALUES
('client.full_name', 'Client Full Name', 'client', 'Full name of the client', 'John Smith'),
('company.utr', 'Company UTR', 'company', 'Unique Taxpayer Reference', '1234567890'),
('filing.type', 'Filing Type', 'filing', 'Type of filing', 'Self Assessment'),
('filing.tax_year', 'Tax Year', 'filing', 'Tax year for the filing', '2024/25'),
('filing.period_start', 'Period Start', 'filing', 'Start of filing period', '06/04/2024'),
('filing.period_end', 'Period End', 'filing', 'End of filing period', '05/04/2025'),
('deadline.filing_date', 'Filing Deadline', 'deadline', 'Due date for filing', '31/01/2026'),
('deadline.payment_date', 'Payment Deadline', 'deadline', 'Due date for payment', '31/01/2026'),
('tax.amount_due', 'Tax Amount Due', 'tax', 'Tax amount payable', '£5,432.00'),
('tax.amount_refund', 'Tax Refund', 'tax', 'Tax refund due', '£1,234.00'),
('invoice.amount', 'Invoice Amount', 'invoice', 'Total invoice amount', '£750.00'),
('invoice.due_date', 'Invoice Due Date', 'invoice', 'Invoice payment due date', '15/12/2024'),
('payment.reference', 'Payment Reference', 'payment', 'Payment reference number', 'INV-2024-001'),
('firm.name', 'Firm Name', 'firm', 'Name of the accounting firm', 'Smith & Co'),
('firm.email_signature', 'Email Signature', 'firm', 'Standard email signature', 'Best regards,\nSmith & Co')
ON CONFLICT (field_key) DO NOTHING;