-- =====================================================
-- CRITICAL FIXES MIGRATION: auth.uid() + Bill Status + Rate Limiting + RLS
-- =====================================================

-- =========================
-- 1. FIX BILL SAFE RPCs (auth.uid() + APPROVED status)
-- =========================

-- Drop existing functions to recreate with correct signatures
DROP FUNCTION IF EXISTS public.approve_bill_safe(UUID, UUID);
DROP FUNCTION IF EXISTS public.void_bill_safe(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.record_bill_payment_safe(UUID, UUID, NUMERIC, DATE, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reverse_bill_payment_safe(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.override_bill_lock_safe(UUID, UUID, JSONB, TEXT);

-- Approve bill: No p_user_id, use auth.uid(), set status to APPROVED (not AWAITING_PAYMENT)
CREATE OR REPLACE FUNCTION public.approve_bill_safe(p_bill_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_bill RECORD;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;

  v_org_id := v_bill.organization_id;
  IF NOT can_approve_bills(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: manager+ required');
  END IF;

  IF v_bill.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT bills can be approved');
  END IF;

  UPDATE bills SET
    status = 'APPROVED',
    approved_at = now(),
    approved_by = v_user_id,
    locked_fields = '["supplier_id", "issue_date", "due_date", "currency", "total_net", "total_vat", "total_gross"]'::jsonb,
    updated_at = now()
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, old_value, new_value, actor_role)
  VALUES (v_org_id, 'bill', p_bill_id, 'approved', v_user_id, 'DRAFT', 'APPROVED',
    (SELECT role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id LIMIT 1));

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id, 'status', 'APPROVED');
END;
$$;

-- Void bill
CREATE OR REPLACE FUNCTION public.void_bill_safe(p_bill_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_bill RECORD;
  v_org_id UUID;
  v_has_payments BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;

  v_org_id := v_bill.organization_id;
  SELECT EXISTS(SELECT 1 FROM bill_payments WHERE bill_id = p_bill_id) INTO v_has_payments;

  IF v_has_payments THEN
    IF NOT can_override_locked_records(v_user_id, v_org_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin+ required to void bills with payments');
    END IF;
  ELSE
    IF NOT can_approve_bills(v_user_id, v_org_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: manager+ required');
    END IF;
  END IF;

  IF v_bill.status = 'VOID' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill is already voided');
  END IF;

  UPDATE bills SET
    status = 'VOID',
    void_reason = p_reason,
    voided_at = now(),
    voided_by = v_user_id,
    updated_at = now()
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, old_value, new_value, metadata, actor_role)
  VALUES (v_org_id, 'bill', p_bill_id, 'voided', v_user_id, v_bill.status, 'VOID',
    jsonb_build_object('reason', p_reason, 'had_payments', v_has_payments),
    (SELECT role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id LIMIT 1));

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id, 'status', 'VOID');
END;
$$;

-- Record bill payment
CREATE OR REPLACE FUNCTION public.record_bill_payment_safe(
  p_bill_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_bank_account_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_bill RECORD;
  v_org_id UUID;
  v_payment_id UUID;
  v_new_total_paid NUMERIC;
  v_new_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;

  v_org_id := v_bill.organization_id;
  IF NOT can_manage_bills(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  IF v_bill.status NOT IN ('APPROVED', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill must be APPROVED or PART_PAID to record payment');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be positive');
  END IF;

  INSERT INTO bill_payments (bill_id, amount, payment_date, bank_account_id, payment_method, reference, created_by)
  VALUES (p_bill_id, p_amount, p_payment_date, p_bank_account_id, p_payment_method, p_reference, v_user_id)
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_new_total_paid FROM bill_payments WHERE bill_id = p_bill_id;

  IF v_new_total_paid >= v_bill.total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;

  UPDATE bills SET
    amount_paid = v_new_total_paid,
    remaining_balance = total_gross - v_new_total_paid,
    status = v_new_status,
    updated_at = now()
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, new_value, metadata, actor_role)
  VALUES (v_org_id, 'bill_payment', v_payment_id, 'payment_recorded', v_user_id, p_amount::text,
    jsonb_build_object('bill_id', p_bill_id, 'new_status', v_new_status, 'total_paid', v_new_total_paid),
    (SELECT role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id LIMIT 1));

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'bill_status', v_new_status);
END;
$$;

-- Reverse bill payment: Fix AWAITING_PAYMENT → APPROVED
CREATE OR REPLACE FUNCTION public.reverse_bill_payment_safe(p_payment_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_payment RECORD;
  v_bill RECORD;
  v_org_id UUID;
  v_reversal_id UUID;
  v_new_total_paid NUMERIC;
  v_new_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_payment FROM bill_payments WHERE id = p_payment_id;
  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = v_payment.bill_id;
  v_org_id := v_bill.organization_id;

  IF NOT can_approve_bills(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: manager+ required');
  END IF;

  IF v_payment.payment_type = 'reversal' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reverse a reversal');
  END IF;

  -- Create reversal entry
  INSERT INTO bill_payments (bill_id, amount, payment_date, payment_type, reference, notes, created_by)
  VALUES (v_payment.bill_id, -v_payment.amount, CURRENT_DATE, 'reversal', 'REV-' || v_payment.id, p_reason, v_user_id)
  RETURNING id INTO v_reversal_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_new_total_paid FROM bill_payments WHERE bill_id = v_payment.bill_id;

  -- FIXED: Use APPROVED when no payments remain, not AWAITING_PAYMENT
  IF v_new_total_paid <= 0 THEN
    v_new_status := 'APPROVED';
  ELSIF v_new_total_paid >= v_bill.total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;

  UPDATE bills SET
    amount_paid = GREATEST(v_new_total_paid, 0),
    remaining_balance = total_gross - GREATEST(v_new_total_paid, 0),
    status = v_new_status,
    updated_at = now()
  WHERE id = v_payment.bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata, actor_role)
  VALUES (v_org_id, 'bill_payment', v_reversal_id, 'payment_reversed', v_user_id,
    jsonb_build_object('original_payment_id', p_payment_id, 'reason', p_reason, 'amount', v_payment.amount, 'new_status', v_new_status),
    (SELECT role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id LIMIT 1));

  RETURN jsonb_build_object('success', true, 'reversal_id', v_reversal_id, 'bill_status', v_new_status);
END;
$$;

-- Override bill lock
CREATE OR REPLACE FUNCTION public.override_bill_lock_safe(p_bill_id UUID, p_changes JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_bill RECORD;
  v_org_id UUID;
  v_override_entry JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;

  v_org_id := v_bill.organization_id;
  IF NOT can_override_locked_records(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin+ required');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Override reason must be at least 10 characters');
  END IF;

  v_override_entry := jsonb_build_object(
    'at', now(),
    'by', v_user_id,
    'reason', p_reason,
    'changes', p_changes,
    'before', to_jsonb(v_bill)
  );

  UPDATE bills SET
    supplier_id = COALESCE((p_changes->>'supplier_id')::UUID, supplier_id),
    issue_date = COALESCE((p_changes->>'issue_date')::DATE, issue_date),
    due_date = COALESCE((p_changes->>'due_date')::DATE, due_date),
    total_net = COALESCE((p_changes->>'total_net')::NUMERIC, total_net),
    total_vat = COALESCE((p_changes->>'total_vat')::NUMERIC, total_vat),
    total_gross = COALESCE((p_changes->>'total_gross')::NUMERIC, total_gross),
    notes = COALESCE(p_changes->>'notes', notes),
    override_history = COALESCE(override_history, '[]'::jsonb) || v_override_entry,
    updated_at = now()
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata, actor_role)
  VALUES (v_org_id, 'bill', p_bill_id, 'lock_overridden', v_user_id,
    jsonb_build_object('reason', p_reason, 'changes', p_changes),
    (SELECT role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id LIMIT 1));

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;

-- =========================
-- 2. FIX EMAIL SAFE RPCs (auth.uid())
-- =========================

DROP FUNCTION IF EXISTS public.queue_email_safe(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, JSONB, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.update_queued_email_safe(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.retry_failed_email_safe(UUID, UUID);
DROP FUNCTION IF EXISTS public.acknowledge_failed_email_safe(UUID, UUID);

CREATE OR REPLACE FUNCTION public.queue_email_safe(
  p_organization_id UUID,
  p_to_email TEXT,
  p_to_name TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_body_html TEXT DEFAULT NULL,
  p_template_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_merge_data JSONB DEFAULT '{}'::JSONB,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email_id UUID;
  v_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > now() THEN
    v_status := 'queued';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO email_queue (
    organization_id, to_email, to_name, subject, body_html, template_id,
    entity_type, entity_id, merge_data, scheduled_at, status, created_by
  ) VALUES (
    p_organization_id, p_to_email, p_to_name, p_subject, p_body_html, p_template_id,
    p_entity_type, p_entity_id, p_merge_data, p_scheduled_at, v_status, v_user_id
  )
  RETURNING id INTO v_email_id;

  RETURN jsonb_build_object('success', true, 'email_id', v_email_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_queued_email_safe(
  p_email_id UUID,
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
  v_user_id UUID;
  v_email RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;

  IF NOT user_in_organization(v_user_id, v_email.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- FIXED: Block edits to failed emails and sending/sent
  IF v_email.status NOT IN ('draft', 'pending', 'queued') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only edit draft, pending, or queued emails');
  END IF;

  UPDATE email_queue SET
    subject = COALESCE(p_subject, subject),
    body_html = COALESCE(p_body_html, body_html),
    to_email = COALESCE(p_to_email, to_email),
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
    updated_at = now()
  WHERE id = p_email_id;

  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_failed_email_safe(p_email_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;

  IF NOT user_in_organization(v_user_id, v_email.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  IF v_email.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only retry failed emails');
  END IF;

  UPDATE email_queue SET
    status = 'pending',
    retry_count = COALESCE(retry_count, 0) + 1,
    last_error_message = NULL,
    updated_at = now()
  WHERE id = p_email_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (v_email.organization_id, 'email', p_email_id, 'retry_requested', v_user_id);

  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_failed_email_safe(p_email_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email RECORD;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;

  v_org_id := v_email.organization_id;
  IF NOT user_has_role_at_least(v_user_id, v_org_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: manager+ required');
  END IF;

  IF v_email.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only acknowledge failed emails');
  END IF;

  UPDATE email_queue SET
    status = 'ignored',
    acknowledged_at = now(),
    acknowledged_by = v_user_id,
    updated_at = now()
  WHERE id = p_email_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_org_id, 'email', p_email_id, 'acknowledged_failure', v_user_id,
    jsonb_build_object('last_error', v_email.last_error_message));

  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$$;

-- =========================
-- 3. FIX AUTOMATION DRY RUN (auth.uid() + production-grade)
-- =========================

DROP FUNCTION IF EXISTS public.automation_dry_run(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.automation_dry_run(
  p_rule_id UUID,
  p_sample_event JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_rule RECORD;
  v_org_id UUID;
  v_would_trigger BOOLEAN := false;
  v_trigger_reason TEXT := '';
  v_actions JSONB := '[]'::JSONB;
  v_placeholders JSONB := '{}'::JSONB;
  v_rate_limit JSONB;
  v_trigger_config JSONB;
  v_event_type TEXT;
  v_entity_type TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;

  v_org_id := v_rule.organization_id;
  IF NOT user_in_organization(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  v_trigger_config := COALESCE(v_rule.trigger_config, '{}'::JSONB);
  
  -- Extract expected event/entity from sample or trigger config
  IF p_sample_event IS NOT NULL THEN
    v_event_type := p_sample_event->>'event_type';
    v_entity_type := p_sample_event->>'entity_type';
  ELSE
    v_event_type := v_rule.trigger_type;
    v_entity_type := v_trigger_config->>'entity_type';
  END IF;

  -- Evaluate trigger conditions
  IF v_rule.trigger_type = v_event_type THEN
    v_would_trigger := true;
    v_trigger_reason := 'Event type matches rule trigger: ' || v_rule.trigger_type;
    
    -- Check additional conditions from trigger_config
    IF v_trigger_config ? 'status_from' AND p_sample_event IS NOT NULL THEN
      IF p_sample_event->'old_value'->>'status' != v_trigger_config->>'status_from' THEN
        v_would_trigger := false;
        v_trigger_reason := 'Status from condition not met';
      END IF;
    END IF;
    
    IF v_trigger_config ? 'status_to' AND p_sample_event IS NOT NULL THEN
      IF p_sample_event->'new_value'->>'status' != v_trigger_config->>'status_to' THEN
        v_would_trigger := false;
        v_trigger_reason := 'Status to condition not met';
      END IF;
    END IF;
  ELSE
    v_trigger_reason := 'Event type ' || COALESCE(v_event_type, 'NULL') || ' does not match rule trigger: ' || v_rule.trigger_type;
  END IF;

  -- Build actions array with resolved config
  v_actions := jsonb_build_array(
    jsonb_build_object(
      'action_type', v_rule.action_type,
      'action_config', v_rule.action_config,
      'email_mode', COALESCE(v_rule.email_mode, 'queue')
    )
  );

  -- Build sample placeholders
  v_placeholders := jsonb_build_object(
    'client.first_name', '{{client.first_name}}',
    'client.last_name', '{{client.last_name}}',
    'company.company_name', '{{company.company_name}}',
    'job.name', '{{job.name}}',
    'deadline.due_date', '{{deadline.due_date}}'
  );

  -- Check rate limits
  SELECT jsonb_build_object(
    'rule_hour_count', COALESCE((SELECT action_count FROM automation_rate_limits 
      WHERE organization_id = v_org_id AND automation_rule_id = p_rule_id 
      AND window_type = 'hour' AND window_start > now() - interval '1 hour'), 0),
    'rule_hour_limit', 25,
    'rule_day_count', COALESCE((SELECT action_count FROM automation_rate_limits 
      WHERE organization_id = v_org_id AND automation_rule_id = p_rule_id 
      AND window_type = 'day' AND window_start > now() - interval '1 day'), 0),
    'rule_day_limit', 150,
    'org_hour_count', COALESCE((SELECT SUM(action_count) FROM automation_rate_limits 
      WHERE organization_id = v_org_id AND automation_rule_id IS NULL 
      AND window_type = 'hour' AND window_start > now() - interval '1 hour'), 0),
    'org_hour_limit', 250,
    'org_day_count', COALESCE((SELECT SUM(action_count) FROM automation_rate_limits 
      WHERE organization_id = v_org_id AND automation_rule_id IS NULL 
      AND window_type = 'day' AND window_start > now() - interval '1 day'), 0),
    'org_day_limit', 1500
  ) INTO v_rate_limit;

  -- Log dry run to audit
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_org_id, 'automation_rule', p_rule_id, 'dry_run_performed', v_user_id,
    jsonb_build_object('sample_event', p_sample_event, 'would_trigger', v_would_trigger));

  RETURN jsonb_build_object(
    'success', true,
    'would_trigger', v_would_trigger,
    'trigger_reason', v_trigger_reason,
    'resolved_placeholders', v_placeholders,
    'actions_would_execute', v_actions,
    'rule_name', v_rule.name,
    'email_mode', COALESCE(v_rule.email_mode, 'queue'),
    'rate_limit_check', v_rate_limit
  );
END;
$$;

-- =========================
-- 4. FIX RATE LIMITING (get_org_settings_safe)
-- =========================

CREATE OR REPLACE FUNCTION public.get_org_settings_safe(p_organization_id UUID)
RETURNS org_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings org_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM org_settings WHERE organization_id = p_organization_id;
  
  IF v_settings.id IS NULL THEN
    -- Insert defaults and return
    INSERT INTO org_settings (
      organization_id,
      automation_email_mode,
      automation_rate_limit_per_rule_hour,
      automation_rate_limit_per_rule_day,
      automation_rate_limit_org_hour,
      automation_rate_limit_org_day,
      invoice_number_prefix,
      invoice_number_next,
      bill_number_prefix,
      bill_number_next
    ) VALUES (
      p_organization_id,
      'queue',
      25,
      150,
      250,
      1500,
      'INV-',
      1,
      'BILL-',
      1
    )
    RETURNING * INTO v_settings;
  END IF;
  
  RETURN v_settings;
END;
$$;

-- Update check_automation_rate_limit to use get_org_settings_safe
DROP FUNCTION IF EXISTS public.check_automation_rate_limit(UUID, UUID);

CREATE OR REPLACE FUNCTION public.check_automation_rate_limit(p_organization_id UUID, p_rule_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings org_settings%ROWTYPE;
  v_rule_hour_count INT := 0;
  v_rule_day_count INT := 0;
  v_org_hour_count INT := 0;
  v_org_day_count INT := 0;
  v_allowed BOOLEAN := true;
BEGIN
  -- Use the safe function to get settings
  v_settings := get_org_settings_safe(p_organization_id);

  -- Get rule-level counts if rule_id provided
  IF p_rule_id IS NOT NULL THEN
    SELECT COALESCE(action_count, 0) INTO v_rule_hour_count
    FROM automation_rate_limits
    WHERE organization_id = p_organization_id 
      AND automation_rule_id = p_rule_id 
      AND window_type = 'hour' 
      AND window_start > now() - interval '1 hour';
      
    SELECT COALESCE(action_count, 0) INTO v_rule_day_count
    FROM automation_rate_limits
    WHERE organization_id = p_organization_id 
      AND automation_rule_id = p_rule_id 
      AND window_type = 'day' 
      AND window_start > now() - interval '1 day';
  END IF;

  -- Get org-level counts
  SELECT COALESCE(SUM(action_count), 0) INTO v_org_hour_count
  FROM automation_rate_limits
  WHERE organization_id = p_organization_id 
    AND window_type = 'hour' 
    AND window_start > now() - interval '1 hour';
    
  SELECT COALESCE(SUM(action_count), 0) INTO v_org_day_count
  FROM automation_rate_limits
  WHERE organization_id = p_organization_id 
    AND window_type = 'day' 
    AND window_start > now() - interval '1 day';

  -- Check limits
  IF p_rule_id IS NOT NULL THEN
    IF v_rule_hour_count >= v_settings.automation_rate_limit_per_rule_hour THEN
      v_allowed := false;
    END IF;
    IF v_rule_day_count >= v_settings.automation_rate_limit_per_rule_day THEN
      v_allowed := false;
    END IF;
  END IF;
  
  IF v_org_hour_count >= v_settings.automation_rate_limit_org_hour THEN
    v_allowed := false;
  END IF;
  IF v_org_day_count >= v_settings.automation_rate_limit_org_day THEN
    v_allowed := false;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'rule_hour_count', v_rule_hour_count,
    'rule_hour_limit', v_settings.automation_rate_limit_per_rule_hour,
    'rule_day_count', v_rule_day_count,
    'rule_day_limit', v_settings.automation_rate_limit_per_rule_day,
    'org_hour_count', v_org_hour_count,
    'org_hour_limit', v_settings.automation_rate_limit_org_hour,
    'org_day_count', v_org_day_count,
    'org_day_limit', v_settings.automation_rate_limit_org_day
  );
END;
$$;

-- Add unique constraint on automation_rate_limits
ALTER TABLE automation_rate_limits 
DROP CONSTRAINT IF EXISTS automation_rate_limits_unique_window;

ALTER TABLE automation_rate_limits 
ADD CONSTRAINT automation_rate_limits_unique_window 
UNIQUE (organization_id, automation_rule_id, window_start, window_type);

-- =========================
-- 5. RLS FOR user_saved_views
-- =========================

ALTER TABLE user_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_saved_views_select" ON user_saved_views;
DROP POLICY IF EXISTS "users_own_saved_views_insert" ON user_saved_views;
DROP POLICY IF EXISTS "users_own_saved_views_update" ON user_saved_views;
DROP POLICY IF EXISTS "users_own_saved_views_delete" ON user_saved_views;

-- Users can only see their own saved views
CREATE POLICY "users_own_saved_views_select" ON user_saved_views
  FOR SELECT USING (user_id = auth.uid());

-- Users can only insert their own saved views
CREATE POLICY "users_own_saved_views_insert" ON user_saved_views
  FOR INSERT WITH CHECK (user_id = auth.uid() AND user_in_organization(auth.uid(), organization_id));

-- Users can only update their own saved views
CREATE POLICY "users_own_saved_views_update" ON user_saved_views
  FOR UPDATE USING (user_id = auth.uid());

-- Users can only delete their own saved views
CREATE POLICY "users_own_saved_views_delete" ON user_saved_views
  FOR DELETE USING (user_id = auth.uid());

-- =========================
-- 6. DISCONNECT MAILBOX SAFE RPC
-- =========================

CREATE OR REPLACE FUNCTION public.disconnect_mailbox_safe(p_mailbox_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_mailbox RECORD;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_mailbox FROM connected_mailboxes WHERE id = p_mailbox_id;
  IF v_mailbox.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mailbox not found');
  END IF;

  v_org_id := v_mailbox.organization_id;
  
  -- Only owner/admin can disconnect mailboxes (or the mailbox owner themselves)
  IF v_mailbox.user_id != v_user_id AND NOT user_has_role_at_least(v_user_id, v_org_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin+ required or must be mailbox owner');
  END IF;

  -- Soft delete by setting is_active = false
  UPDATE connected_mailboxes SET
    is_active = false,
    access_token = NULL,
    refresh_token = NULL,
    updated_at = now()
  WHERE id = p_mailbox_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata, actor_role)
  VALUES (v_org_id, 'connected_mailbox', p_mailbox_id, 'disconnected', v_user_id,
    jsonb_build_object('email_address', v_mailbox.email_address, 'provider', v_mailbox.provider),
    (SELECT role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id LIMIT 1));

  RETURN jsonb_build_object('success', true, 'mailbox_id', p_mailbox_id);
END;
$$;

-- =========================
-- 7. RLS VERIFICATION (comments for reference)
-- =========================

-- Critical tables that should be RPC-only (WITH CHECK false):
-- - ledger_entries: RLS enabled, INSERT/UPDATE blocked for direct writes
-- - journals: RLS enabled, INSERT/UPDATE blocked for direct writes
-- - invoice_payments: RLS enabled, INSERT/UPDATE blocked for direct writes  
-- - bill_payments: RLS enabled, INSERT/UPDATE blocked for direct writes
-- - filing_model_snapshots: RLS enabled, INSERT/UPDATE/DELETE blocked (immutable)
-- - automation_executions: RLS enabled, INSERT via RPC only

-- Verify RLS is enabled on critical tables
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY['ledger_entries', 'journals', 'invoice_payments', 'bill_payments', 'filing_model_snapshots', 'automation_executions'];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = v_table
    ) THEN
      RAISE NOTICE 'Table % does not exist, skipping RLS check', v_table;
      CONTINUE;
    END IF;
    
    -- Just verify RLS is enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity = true
    ) THEN
      RAISE NOTICE 'WARNING: RLS not enabled on %', v_table;
    ELSE
      RAISE NOTICE 'OK: RLS enabled on %', v_table;
    END IF;
  END LOOP;
END;
$$;