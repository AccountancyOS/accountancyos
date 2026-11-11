-- Phase 4: RLS Hardening - Lock critical tables to RPC-only writes
-- Phase 5: Email Module - Mailbox constraints and failed email handling

-- ============================================
-- PHASE 4: RLS HARDENING FOR CRITICAL TABLES
-- ============================================

-- Ledger entries: RPC-only writes (most critical)
DROP POLICY IF EXISTS "ledger_entries_no_direct_insert" ON ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_no_direct_update" ON ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_no_direct_delete" ON ledger_entries;

CREATE POLICY "ledger_entries_no_direct_insert" ON ledger_entries
  FOR INSERT WITH CHECK (false);
CREATE POLICY "ledger_entries_no_direct_update" ON ledger_entries
  FOR UPDATE USING (false);
CREATE POLICY "ledger_entries_no_direct_delete" ON ledger_entries
  FOR DELETE USING (false);

-- Journals: RPC-only writes
DROP POLICY IF EXISTS "journals_no_direct_insert" ON journals;
DROP POLICY IF EXISTS "journals_no_direct_update" ON journals;
DROP POLICY IF EXISTS "journals_no_direct_delete" ON journals;

CREATE POLICY "journals_no_direct_insert" ON journals
  FOR INSERT WITH CHECK (false);
CREATE POLICY "journals_no_direct_update" ON journals
  FOR UPDATE USING (false);
CREATE POLICY "journals_no_direct_delete" ON journals
  FOR DELETE USING (false);

-- Invoice payments: RPC-only writes
DROP POLICY IF EXISTS "invoice_payments_no_direct_insert" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_no_direct_update" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_no_direct_delete" ON invoice_payments;

CREATE POLICY "invoice_payments_no_direct_insert" ON invoice_payments
  FOR INSERT WITH CHECK (false);
CREATE POLICY "invoice_payments_no_direct_update" ON invoice_payments
  FOR UPDATE USING (false);
CREATE POLICY "invoice_payments_no_direct_delete" ON invoice_payments
  FOR DELETE USING (false);

-- Bill payments: RPC-only writes
DROP POLICY IF EXISTS "bill_payments_no_direct_insert" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_no_direct_update" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_no_direct_delete" ON bill_payments;

CREATE POLICY "bill_payments_no_direct_insert" ON bill_payments
  FOR INSERT WITH CHECK (false);
CREATE POLICY "bill_payments_no_direct_update" ON bill_payments
  FOR UPDATE USING (false);
CREATE POLICY "bill_payments_no_direct_delete" ON bill_payments
  FOR DELETE USING (false);

-- Filing model snapshots: Already immutable, but ensure RPC-only
DROP POLICY IF EXISTS "filing_model_snapshots_no_direct_insert" ON filing_model_snapshots;
DROP POLICY IF EXISTS "filing_model_snapshots_no_direct_update" ON filing_model_snapshots;
DROP POLICY IF EXISTS "filing_model_snapshots_no_direct_delete" ON filing_model_snapshots;

CREATE POLICY "filing_model_snapshots_no_direct_insert" ON filing_model_snapshots
  FOR INSERT WITH CHECK (false);
CREATE POLICY "filing_model_snapshots_no_direct_update" ON filing_model_snapshots
  FOR UPDATE USING (false);
CREATE POLICY "filing_model_snapshots_no_direct_delete" ON filing_model_snapshots
  FOR DELETE USING (false);

-- Automation executions: RPC-only writes (system controlled)
DROP POLICY IF EXISTS "automation_executions_no_direct_insert" ON automation_executions;
DROP POLICY IF EXISTS "automation_executions_no_direct_update" ON automation_executions;
DROP POLICY IF EXISTS "automation_executions_no_direct_delete" ON automation_executions;

CREATE POLICY "automation_executions_no_direct_insert" ON automation_executions
  FOR INSERT WITH CHECK (false);
CREATE POLICY "automation_executions_no_direct_update" ON automation_executions
  FOR UPDATE USING (false);
CREATE POLICY "automation_executions_no_direct_delete" ON automation_executions
  FOR DELETE USING (false);

-- ============================================
-- PHASE 5: EMAIL MODULE HARDENING
-- ============================================

-- Add mailbox_type column for personal vs shared mailboxes
ALTER TABLE connected_mailboxes 
  ADD COLUMN IF NOT EXISTS mailbox_type TEXT DEFAULT 'personal';

-- Add constraint for valid mailbox types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'connected_mailboxes_mailbox_type_check'
  ) THEN
    ALTER TABLE connected_mailboxes 
      ADD CONSTRAINT connected_mailboxes_mailbox_type_check 
      CHECK (mailbox_type IN ('personal', 'shared'));
  END IF;
END $$;

-- Create unique index for one personal mailbox per user per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_personal_mailbox_per_user 
  ON connected_mailboxes (user_id, provider) 
  WHERE mailbox_type = 'personal';

-- Create unique index for one shared mailbox per org per provider  
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_shared_mailbox_per_org 
  ON connected_mailboxes (organization_id, provider) 
  WHERE mailbox_type = 'shared';

-- Add failed email handling columns to email_queue
ALTER TABLE email_queue 
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Create email safe RPCs

-- Queue email safe
CREATE OR REPLACE FUNCTION public.queue_email_safe(
  p_organization_id UUID,
  p_user_id UUID,
  p_to_email TEXT,
  p_to_name TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_body_html TEXT DEFAULT NULL,
  p_template_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_merge_data JSONB DEFAULT '{}',
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_id UUID;
  v_status TEXT;
BEGIN
  -- Check permission
  IF NOT user_has_role_at_least(p_user_id, p_organization_id, 'staff') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Validate email
  IF p_to_email IS NULL OR trim(p_to_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient email is required');
  END IF;
  
  -- Set status based on scheduled time
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > now() THEN
    v_status := 'queued';
  ELSE
    v_status := 'pending';
  END IF;
  
  -- Insert email
  INSERT INTO email_queue (
    organization_id,
    to_email,
    to_name,
    subject,
    body_html,
    template_id,
    entity_type,
    entity_id,
    merge_data,
    scheduled_at,
    status
  ) VALUES (
    p_organization_id,
    p_to_email,
    p_to_name,
    p_subject,
    p_body_html,
    p_template_id,
    p_entity_type,
    p_entity_id,
    p_merge_data,
    COALESCE(p_scheduled_at, now()),
    v_status
  ) RETURNING id INTO v_email_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    p_organization_id,
    p_user_id,
    'email_queued',
    'email_queue',
    v_email_id,
    NULL,
    jsonb_build_object('to_email', p_to_email, 'status', v_status)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'email_id', v_email_id,
    'status', v_status
  );
END;
$$;

-- Update queued email safe (only if not sending)
CREATE OR REPLACE FUNCTION public.update_queued_email_safe(
  p_email_id UUID,
  p_user_id UUID,
  p_subject TEXT DEFAULT NULL,
  p_body_html TEXT DEFAULT NULL,
  p_to_email TEXT DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email RECORD;
  v_org_id UUID;
  v_before_state JSONB;
BEGIN
  -- Get email
  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;
  
  v_org_id := v_email.organization_id;
  
  -- Check permission
  IF NOT user_has_role_at_least(p_user_id, v_org_id, 'staff') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Only allow editing if not sending/sent
  IF v_email.status IN ('sending', 'sent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot edit email that is sending or sent');
  END IF;
  
  v_before_state := jsonb_build_object(
    'subject', v_email.subject,
    'body_html', substring(v_email.body_html, 1, 100),
    'to_email', v_email.to_email
  );
  
  -- Update email
  UPDATE email_queue SET
    subject = COALESCE(p_subject, subject),
    body_html = COALESCE(p_body_html, body_html),
    to_email = COALESCE(p_to_email, to_email),
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
    updated_at = now()
  WHERE id = p_email_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'email_updated',
    'email_queue',
    p_email_id,
    v_before_state,
    jsonb_build_object(
      'subject', COALESCE(p_subject, v_email.subject),
      'to_email', COALESCE(p_to_email, v_email.to_email)
    )
  );
  
  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$$;

-- Retry failed email safe
CREATE OR REPLACE FUNCTION public.retry_failed_email_safe(
  p_email_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email RECORD;
  v_org_id UUID;
BEGIN
  -- Get email
  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;
  
  v_org_id := v_email.organization_id;
  
  -- Check permission
  IF NOT user_has_role_at_least(p_user_id, v_org_id, 'staff') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Only allow retrying failed emails
  IF v_email.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only failed emails can be retried');
  END IF;
  
  -- Update email for retry
  UPDATE email_queue SET
    status = 'pending',
    retry_count = COALESCE(retry_count, 0) + 1,
    last_error_code = NULL,
    last_error_message = NULL,
    updated_at = now()
  WHERE id = p_email_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'email_retry',
    'email_queue',
    p_email_id,
    jsonb_build_object('status', 'failed', 'retry_count', v_email.retry_count),
    jsonb_build_object('status', 'pending', 'retry_count', COALESCE(v_email.retry_count, 0) + 1)
  );
  
  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$$;

-- Acknowledge failed email safe (hide from default views but retain)
CREATE OR REPLACE FUNCTION public.acknowledge_failed_email_safe(
  p_email_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email RECORD;
  v_org_id UUID;
BEGIN
  -- Get email
  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;
  
  v_org_id := v_email.organization_id;
  
  -- Check permission (manager+ to acknowledge failures)
  IF NOT user_has_role_at_least(p_user_id, v_org_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager role');
  END IF;
  
  -- Only allow acknowledging failed emails
  IF v_email.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only failed emails can be acknowledged');
  END IF;
  
  -- Update email
  UPDATE email_queue SET
    acknowledged_at = now(),
    acknowledged_by = p_user_id,
    updated_at = now()
  WHERE id = p_email_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'email_acknowledged',
    'email_queue',
    p_email_id,
    NULL,
    jsonb_build_object('acknowledged_at', now())
  );
  
  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$$;

-- Add automation rule settings columns
ALTER TABLE automation_rules 
  ADD COLUMN IF NOT EXISTS email_mode TEXT DEFAULT 'draft_by_default',
  ADD COLUMN IF NOT EXISTS send_immediately_override BOOLEAN DEFAULT false;

-- Add constraint for email_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_rules_email_mode_check'
  ) THEN
    ALTER TABLE automation_rules 
      ADD CONSTRAINT automation_rules_email_mode_check 
      CHECK (email_mode IN ('draft_by_default', 'send_by_default'));
  END IF;
END $$;

-- Create automation dry run RPC
CREATE OR REPLACE FUNCTION public.automation_dry_run(
  p_rule_id UUID,
  p_user_id UUID,
  p_sample_event JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_org_id UUID;
  v_would_trigger BOOLEAN := false;
  v_trigger_reason TEXT := '';
  v_resolved_placeholders JSONB := '{}';
  v_actions_would_execute JSONB := '[]';
BEGIN
  -- Get rule
  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;
  
  v_org_id := v_rule.organization_id;
  
  -- Check permission (must be able to manage automation rules)
  IF NOT can_manage_automation_rules_check(p_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Check if rule is active
  IF NOT v_rule.is_active THEN
    v_trigger_reason := 'Rule is inactive';
    v_would_trigger := false;
  ELSE
    -- Evaluate trigger conditions against sample event
    -- This is a simplified evaluation - full evaluation happens in edge function
    IF p_sample_event IS NOT NULL THEN
      IF v_rule.trigger_config IS NOT NULL THEN
        -- Check if event type matches
        IF p_sample_event->>'event_type' = v_rule.trigger_type THEN
          v_would_trigger := true;
          v_trigger_reason := 'Event type matches trigger';
        ELSE
          v_would_trigger := false;
          v_trigger_reason := 'Event type does not match: expected ' || v_rule.trigger_type || ', got ' || COALESCE(p_sample_event->>'event_type', 'null');
        END IF;
      ELSE
        v_would_trigger := true;
        v_trigger_reason := 'No trigger conditions configured';
      END IF;
    ELSE
      v_would_trigger := true;
      v_trigger_reason := 'No sample event provided - assuming match';
    END IF;
  END IF;
  
  -- Build list of actions that would execute
  IF v_would_trigger THEN
    v_actions_would_execute := jsonb_build_array(
      jsonb_build_object(
        'action_type', v_rule.action_type,
        'action_config', v_rule.action_config,
        'email_mode', COALESCE(v_rule.email_mode, 'draft_by_default')
      )
    );
  END IF;
  
  -- Write audit log for dry run
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'automation_dry_run',
    'automation_rule',
    p_rule_id,
    NULL,
    jsonb_build_object(
      'would_trigger', v_would_trigger,
      'reason', v_trigger_reason,
      'sample_event', p_sample_event
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'would_trigger', v_would_trigger,
    'trigger_reason', v_trigger_reason,
    'resolved_placeholders', v_resolved_placeholders,
    'actions_would_execute', v_actions_would_execute,
    'rule_name', v_rule.name,
    'email_mode', COALESCE(v_rule.email_mode, 'draft_by_default')
  );
END;
$$;

-- Create check automation rate limit function
CREATE OR REPLACE FUNCTION public.check_automation_rate_limit(
  p_organization_id UUID,
  p_rule_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_rule_hour_count INTEGER := 0;
  v_rule_day_count INTEGER := 0;
  v_org_hour_count INTEGER := 0;
  v_org_day_count INTEGER := 0;
  v_hour_start TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
BEGIN
  -- Get org settings
  SELECT * INTO v_settings FROM org_settings WHERE organization_id = p_organization_id;
  
  -- Use defaults if no settings
  IF v_settings IS NULL THEN
    v_settings := ROW(
      p_organization_id,
      'owner_admin_manager',
      'INV-', 1, 6,
      'BILL-', 1, 6,
      false,
      25, 150, 250, 1500
    );
  END IF;
  
  v_hour_start := date_trunc('hour', now());
  v_day_start := date_trunc('day', now());
  
  -- Get rule-level counts if rule specified
  IF p_rule_id IS NOT NULL THEN
    SELECT COALESCE(SUM(action_count), 0) INTO v_rule_hour_count
    FROM automation_rate_limits
    WHERE automation_rule_id = p_rule_id
      AND window_type = 'hour'
      AND window_start = v_hour_start;
      
    SELECT COALESCE(SUM(action_count), 0) INTO v_rule_day_count
    FROM automation_rate_limits
    WHERE automation_rule_id = p_rule_id
      AND window_type = 'day'
      AND window_start = v_day_start;
  END IF;
  
  -- Get org-level counts
  SELECT COALESCE(SUM(action_count), 0) INTO v_org_hour_count
  FROM automation_rate_limits
  WHERE organization_id = p_organization_id
    AND window_type = 'hour'
    AND window_start = v_hour_start;
    
  SELECT COALESCE(SUM(action_count), 0) INTO v_org_day_count
  FROM automation_rate_limits
  WHERE organization_id = p_organization_id
    AND window_type = 'day'
    AND window_start = v_day_start;
  
  RETURN jsonb_build_object(
    'allowed', (
      (p_rule_id IS NULL OR v_rule_hour_count < v_settings.automation_max_actions_per_rule_hour)
      AND (p_rule_id IS NULL OR v_rule_day_count < v_settings.automation_max_actions_per_rule_day)
      AND v_org_hour_count < v_settings.automation_max_actions_org_hour
      AND v_org_day_count < v_settings.automation_max_actions_org_day
    ),
    'rule_hour_count', v_rule_hour_count,
    'rule_hour_limit', v_settings.automation_max_actions_per_rule_hour,
    'rule_day_count', v_rule_day_count,
    'rule_day_limit', v_settings.automation_max_actions_per_rule_day,
    'org_hour_count', v_org_hour_count,
    'org_hour_limit', v_settings.automation_max_actions_org_hour,
    'org_day_count', v_org_day_count,
    'org_day_limit', v_settings.automation_max_actions_org_day
  );
END;
$$;

-- Create increment automation rate limit function
CREATE OR REPLACE FUNCTION public.increment_automation_rate_limit(
  p_organization_id UUID,
  p_rule_id UUID,
  p_increment INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour_start TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
BEGIN
  v_hour_start := date_trunc('hour', now());
  v_day_start := date_trunc('day', now());
  
  -- Upsert hourly count
  INSERT INTO automation_rate_limits (organization_id, automation_rule_id, window_start, window_type, action_count)
  VALUES (p_organization_id, p_rule_id, v_hour_start, 'hour', p_increment)
  ON CONFLICT (organization_id, automation_rule_id, window_start, window_type)
  DO UPDATE SET action_count = automation_rate_limits.action_count + p_increment;
  
  -- Upsert daily count
  INSERT INTO automation_rate_limits (organization_id, automation_rule_id, window_start, window_type, action_count)
  VALUES (p_organization_id, p_rule_id, v_day_start, 'day', p_increment)
  ON CONFLICT (organization_id, automation_rule_id, window_start, window_type)
  DO UPDATE SET action_count = automation_rate_limits.action_count + p_increment;
END;
$$;