
-- =====================================================================
-- Phase 1: Automation Engine — Safety, Suppression, Override, Audit
-- =====================================================================

-- Helper: insert-only guard
CREATE OR REPLACE FUNCTION public.fn_block_update_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
END;
$$;

-- =====================================================================
-- 1. automation_pauses
-- =====================================================================
CREATE TABLE public.automation_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('org','client','job','rule','chaser_policy','workflow_template')),
  target_id uuid,
  rule_id uuid,
  reason text,
  paused_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_pauses TO authenticated;
GRANT ALL ON public.automation_pauses TO service_role;
ALTER TABLE public.automation_pauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read pauses" ON public.automation_pauses FOR SELECT
  USING (user_in_organization(auth.uid(), organization_id));
CREATE POLICY "admins manage pauses" ON public.automation_pauses FOR ALL
  USING (user_in_organization(auth.uid(), organization_id)
         AND (has_organization_role(organization_id,'owner') OR has_organization_role(organization_id,'admin')))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));
CREATE INDEX idx_automation_pauses_org_scope ON public.automation_pauses(organization_id, scope, target_id);

-- =====================================================================
-- 2. email_suppressions  (NOTE: a `suppressed_emails` table already exists
--    from Lovable Email infra — keep separate; this is automation-scoped)
-- =====================================================================
CREATE TABLE public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  category text,
  reason text NOT NULL CHECK (reason IN ('bounce','complaint','unsubscribe','manual','hard_bounce')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_email_suppressions ON public.email_suppressions(organization_id, lower(email), coalesce(category,'__all__'));
GRANT SELECT, INSERT ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read suppressions" ON public.email_suppressions FOR SELECT
  USING (user_in_organization(auth.uid(), organization_id));
CREATE POLICY "members insert suppressions" ON public.email_suppressions FOR INSERT
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 3. email_unsubscribe_tokens
-- =====================================================================
CREATE TABLE public.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  category text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_unsub_tokens_email ON public.email_unsubscribe_tokens(organization_id, lower(email));
GRANT SELECT ON public.email_unsubscribe_tokens TO authenticated;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read unsub tokens" ON public.email_unsubscribe_tokens FOR SELECT
  USING (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 4. email_preferences
-- =====================================================================
CREATE TABLE public.email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text,
  client_id uuid,
  contact_id uuid,
  lead_id uuid,
  category text NOT NULL,
  opted_out_at timestamptz,
  opt_in_at timestamptz,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_prefs_lookup ON public.email_preferences(organization_id, category, lower(coalesce(email,'')));
CREATE INDEX idx_email_prefs_client ON public.email_preferences(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_email_prefs_contact ON public.email_preferences(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_email_prefs_lead ON public.email_preferences(lead_id) WHERE lead_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage email prefs" ON public.email_preferences FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 5. automation_client_overrides
-- =====================================================================
CREATE TABLE public.automation_client_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  chaser_policy_id uuid REFERENCES public.automation_chaser_policies(id) ON DELETE CASCADE,
  enabled boolean,
  config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((rule_id IS NOT NULL) <> (chaser_policy_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_client_override_rule ON public.automation_client_overrides(client_id, rule_id) WHERE rule_id IS NOT NULL;
CREATE UNIQUE INDEX uq_client_override_chaser ON public.automation_client_overrides(client_id, chaser_policy_id) WHERE chaser_policy_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_client_overrides TO authenticated;
GRANT ALL ON public.automation_client_overrides TO service_role;
ALTER TABLE public.automation_client_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage client overrides" ON public.automation_client_overrides FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 6. automation_job_overrides
-- =====================================================================
CREATE TABLE public.automation_job_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  chaser_policy_id uuid REFERENCES public.automation_chaser_policies(id) ON DELETE CASCADE,
  enabled boolean,
  config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((rule_id IS NOT NULL) <> (chaser_policy_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_job_override_rule ON public.automation_job_overrides(job_id, rule_id) WHERE rule_id IS NOT NULL;
CREATE UNIQUE INDEX uq_job_override_chaser ON public.automation_job_overrides(job_id, chaser_policy_id) WHERE chaser_policy_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_job_overrides TO authenticated;
GRANT ALL ON public.automation_job_overrides TO service_role;
ALTER TABLE public.automation_job_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage job overrides" ON public.automation_job_overrides FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 7. automation_audit_logs  (append-only)
-- =====================================================================
CREATE TABLE public.automation_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.automation_audit_logs TO authenticated;
GRANT ALL ON public.automation_audit_logs TO service_role;
ALTER TABLE public.automation_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read audit" ON public.automation_audit_logs FOR SELECT
  USING (user_in_organization(auth.uid(), organization_id));
CREATE POLICY "members insert audit" ON public.automation_audit_logs FOR INSERT
  WITH CHECK (user_in_organization(auth.uid(), organization_id));
CREATE TRIGGER trg_audit_block_update BEFORE UPDATE ON public.automation_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_update_delete();
CREATE TRIGGER trg_audit_block_delete BEFORE DELETE ON public.automation_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_update_delete();
CREATE INDEX idx_audit_org_entity ON public.automation_audit_logs(organization_id, entity_type, entity_id);

-- =====================================================================
-- 8. client_tax_authorisations
-- =====================================================================
CREATE TABLE public.client_tax_authorisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  client_service_id uuid,
  tax_service_type text NOT NULL CHECK (tax_service_type IN ('SA','CT','VAT','PAYE','CIS','MTD_IT','MTD_VAT','TRUST','PARTNERSHIP')),
  status text NOT NULL DEFAULT 'not_requested'
    CHECK (status IN ('not_requested','requested','code_sent','client_authenticating','authorised','rejected','expired','revoked')),
  requested_at timestamptz,
  authorised_at timestamptz,
  expires_at timestamptz,
  reference text,
  next_chase_at timestamptz,
  chaser_count integer NOT NULL DEFAULT 0,
  last_email_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Partial unique indexes to handle nullable client_service_id
CREATE UNIQUE INDEX uq_tax_auth_with_service ON public.client_tax_authorisations(organization_id, client_id, tax_service_type, client_service_id)
  WHERE client_service_id IS NOT NULL;
CREATE UNIQUE INDEX uq_tax_auth_no_service ON public.client_tax_authorisations(organization_id, client_id, tax_service_type)
  WHERE client_service_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_tax_authorisations TO authenticated;
GRANT ALL ON public.client_tax_authorisations TO service_role;
ALTER TABLE public.client_tax_authorisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage tax auth" ON public.client_tax_authorisations FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 9. record_request_items
-- =====================================================================
CREATE TABLE public.record_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  job_id uuid,
  label text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_requested' CHECK (status IN (
    'not_requested','requested','pending','received','invalid','missing',
    'waived','not_applicable','client_says_unavailable','reviewed','verified'
  )),
  due_at timestamptz,
  last_chased_at timestamptz,
  chaser_count integer NOT NULL DEFAULT 0,
  requested_by uuid REFERENCES auth.users(id),
  received_by uuid REFERENCES auth.users(id),
  verified_by uuid REFERENCES auth.users(id),
  waived_by uuid REFERENCES auth.users(id),
  waiver_reason text,
  source text,
  client_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_record_items_job ON public.record_request_items(job_id);
CREATE INDEX idx_record_items_client ON public.record_request_items(client_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_request_items TO authenticated;
GRANT ALL ON public.record_request_items TO service_role;
ALTER TABLE public.record_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage record items" ON public.record_request_items FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 10. client_approval_packs  (versioned)
-- =====================================================================
CREATE TABLE public.client_approval_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  job_id uuid,
  pack_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','approved','rejected','superseded','withdrawn')),
  version_number integer NOT NULL DEFAULT 1,
  superseded_by uuid REFERENCES public.client_approval_packs(id) ON DELETE SET NULL,
  sent_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  approved_by_contact_id uuid,
  approval_method text,
  approval_ip text,
  approval_user_agent text,
  approval_notes text,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_packs_job ON public.client_approval_packs(job_id);
CREATE INDEX idx_approval_packs_client ON public.client_approval_packs(client_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_approval_packs TO authenticated;
GRANT ALL ON public.client_approval_packs TO service_role;
ALTER TABLE public.client_approval_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage approval packs" ON public.client_approval_packs FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 11. recurring_invoice_schedules
-- =====================================================================
CREATE TABLE public.recurring_invoice_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  service_id uuid,
  cadence text NOT NULL CHECK (cadence IN ('weekly','fortnightly','monthly','quarterly','semi_annual','annual','custom')),
  start_date date NOT NULL,
  end_date date,
  billing_day integer,
  payment_terms_days integer NOT NULL DEFAULT 30,
  tax_rate_id uuid,
  invoice_template_id uuid,
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'GBP',
  auto_send boolean NOT NULL DEFAULT false,
  create_draft_only boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_invoice_id uuid,
  failure_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','completed','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recurring_invoice_due ON public.recurring_invoice_schedules(status, next_run_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_invoice_schedules TO authenticated;
GRANT ALL ON public.recurring_invoice_schedules TO service_role;
ALTER TABLE public.recurring_invoice_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage recurring invoices" ON public.recurring_invoice_schedules FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 12. revenue_events  (append-only)
-- =====================================================================
CREATE TABLE public.revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid,
  service_id uuid,
  invoice_id uuid,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  reversal_of_event_id uuid REFERENCES public.revenue_events(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'GBP',
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  recognition_period_start date,
  recognition_period_end date,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.revenue_events TO authenticated;
GRANT ALL ON public.revenue_events TO service_role;
ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read revenue" ON public.revenue_events FOR SELECT
  USING (user_in_organization(auth.uid(), organization_id));
CREATE POLICY "members insert revenue" ON public.revenue_events FOR INSERT
  WITH CHECK (user_in_organization(auth.uid(), organization_id));
CREATE TRIGGER trg_revenue_block_update BEFORE UPDATE ON public.revenue_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_update_delete();
CREATE TRIGGER trg_revenue_block_delete BEFORE DELETE ON public.revenue_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_update_delete();
CREATE INDEX idx_revenue_org_period ON public.revenue_events(organization_id, recognition_period_start, recognition_period_end);

-- =====================================================================
-- 13. automation_idempotency_keys
-- =====================================================================
CREATE TABLE public.automation_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  rule_id uuid,
  chaser_policy_id uuid,
  workflow_instance_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_idempotency_key ON public.automation_idempotency_keys(organization_id, key);
GRANT SELECT, INSERT ON public.automation_idempotency_keys TO authenticated;
GRANT ALL ON public.automation_idempotency_keys TO service_role;
ALTER TABLE public.automation_idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read idemp" ON public.automation_idempotency_keys FOR SELECT
  USING (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 14. automation_entity_link_suggestions
-- =====================================================================
CREATE TABLE public.automation_entity_link_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_entity_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  suggested_entity_type text NOT NULL,
  suggested_entity_id uuid NOT NULL,
  confidence_score numeric(5,4) NOT NULL DEFAULT 0,
  suggestion_reason text,
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_link_sugg_source ON public.automation_entity_link_suggestions(organization_id, source_entity_type, source_entity_id);
GRANT SELECT, INSERT, UPDATE ON public.automation_entity_link_suggestions TO authenticated;
GRANT ALL ON public.automation_entity_link_suggestions TO service_role;
ALTER TABLE public.automation_entity_link_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage link suggestions" ON public.automation_entity_link_suggestions FOR ALL
  USING (user_in_organization(auth.uid(), organization_id))
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- =====================================================================
-- 15. Extend existing tables
-- =====================================================================
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all_records'
    CHECK (scope IN ('new_records','all_records')),
  ADD COLUMN IF NOT EXISTS applies_to_records_created_after timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'auto'
    CHECK (send_mode IN ('auto','draft','task_only','disabled')),
  ADD COLUMN IF NOT EXISTS recipient_resolver text,
  ADD COLUMN IF NOT EXISTS idempotency_template text,
  ADD COLUMN IF NOT EXISTS is_sales boolean NOT NULL DEFAULT false;

ALTER TABLE public.automation_rule_templates
  ADD COLUMN IF NOT EXISTS default_scope text DEFAULT 'all_records',
  ADD COLUMN IF NOT EXISTS default_frequency jsonb,
  ADD COLUMN IF NOT EXISTS default_template_id uuid,
  ADD COLUMN IF NOT EXISTS default_send_mode text DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS default_recipient_resolver text,
  ADD COLUMN IF NOT EXISTS is_sales_category boolean NOT NULL DEFAULT false;

ALTER TABLE public.automation_chaser_policies
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'new_records'
    CHECK (scope IN ('new_records','all_records')),
  ADD COLUMN IF NOT EXISTS applies_to_records_created_after timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS suppression_category text,
  ADD COLUMN IF NOT EXISTS stop_on_unsubscribe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'auto'
    CHECK (send_mode IN ('auto','draft','task_only','disabled')),
  ADD COLUMN IF NOT EXISTS recipient_resolver text,
  ADD COLUMN IF NOT EXISTS is_sales boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

ALTER TABLE public.sla_definitions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS feeds_dashboard boolean NOT NULL DEFAULT true;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS requires_unsubscribe_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_merge_fields text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS recipient_rule text,
  ADD COLUMN IF NOT EXISTS validation_state text DEFAULT 'unvalidated',
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz;

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS requires_unsubscribe_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_merge_fields text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS recipient_rule text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS is_sales boolean NOT NULL DEFAULT false;

-- =====================================================================
-- 16. Seed 17 new trigger contracts
-- =====================================================================
INSERT INTO public.automation_trigger_contracts (key, name, description, payload_schema) VALUES
  ('LEAD_CREATED','Lead Created','New CRM lead created','{}'::jsonb),
  ('LEAD_STAGE_CHANGED','Lead Stage Changed','Lead pipeline stage changed','{}'::jsonb),
  ('LEAD_LOST','Lead Lost','Lead marked as lost','{}'::jsonb),
  ('LEAD_DORMANT','Lead Dormant','Lead has gone dormant','{}'::jsonb),
  ('QUOTE_ACCEPTED','Quote Accepted','Client accepted a quote','{}'::jsonb),
  ('QUOTE_REJECTED','Quote Rejected','Client rejected a quote','{}'::jsonb),
  ('ENGAGEMENT_LETTER_SENT','Engagement Letter Sent','Letter sent to client','{}'::jsonb),
  ('KYC_STATUS_CHANGED','KYC Status Changed','KYC subject status changed','{}'::jsonb),
  ('HMRC_AUTH_REQUESTED','HMRC Authorisation Requested','64-8 / agent auth requested','{}'::jsonb),
  ('HMRC_AUTH_COMPLETED','HMRC Authorisation Completed','HMRC authorisation completed','{}'::jsonb),
  ('RECORDS_REQUESTED','Records Requested','Records request sent to client','{}'::jsonb),
  ('RECORDS_PARTIAL','Records Partial','Some records received, others outstanding','{}'::jsonb),
  ('RECORDS_RECEIVED','Records Received','All records received','{}'::jsonb),
  ('RECORDS_VERIFIED','Records Verified','Records verified by accountant','{}'::jsonb),
  ('WORKPAPER_APPROVED','Workpaper Approved','Workpaper approved','{}'::jsonb),
  ('FILING_REJECTED','Filing Rejected','HMRC/CH rejected a filing','{}'::jsonb),
  ('INVOICE_PAYMENT_FAILED','Invoice Payment Failed','Payment attempt failed','{}'::jsonb),
  ('DOCUMENT_SIGNED','Document Signed','Document signed by client','{}'::jsonb),
  ('SERVICE_ACTIVATED','Service Activated','Service activated for a client','{}'::jsonb),
  ('SERVICE_DEACTIVATED','Service Deactivated','Service deactivated','{}'::jsonb),
  ('SERVICE_FEE_CHANGED','Service Fee Changed','Service fee changed','{}'::jsonb),
  ('JOB_CREATED','Job Created','New job created','{}'::jsonb),
  ('JOB_COMPLETED','Job Completed','Job marked complete','{}'::jsonb),
  ('WORKPAPER_CREATED','Workpaper Created','New workpaper created','{}'::jsonb),
  ('WORKPAPER_LOCKED','Workpaper Locked','Workpaper locked','{}'::jsonb),
  ('DOCUMENT_UPLOADED','Document Uploaded','Document uploaded','{}'::jsonb),
  ('DOCUMENT_SIGNATURE_REQUESTED','Document Signature Requested','Signature requested','{}'::jsonb),
  ('MESSAGE_RECEIVED','Message Received','Inbound message received','{}'::jsonb),
  ('INVOICE_CREATED','Invoice Created','Invoice created','{}'::jsonb),
  ('PAYMENT_DUE','Payment Due','Payment is due','{}'::jsonb),
  ('CLIENT_PORTAL_INVITE_SENT','Client Portal Invite Sent','Portal invite sent','{}'::jsonb),
  ('CLIENT_ONBOARDING_STARTED','Client Onboarding Started','Onboarding started','{}'::jsonb),
  ('RECORD_ITEM_STATUS_CHANGED','Record Item Status Changed','Record item status changed','{}'::jsonb),
  ('CLIENT_APPROVAL_PACK_SENT','Client Approval Pack Sent','Approval pack sent','{}'::jsonb),
  ('CLIENT_APPROVAL_PACK_APPROVED','Client Approval Pack Approved','Approval pack approved','{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- 17. updated_at triggers for new tables
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'automation_pauses','email_suppressions','email_unsubscribe_tokens','email_preferences',
    'automation_client_overrides','automation_job_overrides','client_tax_authorisations',
    'record_request_items','client_approval_packs','recurring_invoice_schedules',
    'automation_entity_link_suggestions'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END$$;
