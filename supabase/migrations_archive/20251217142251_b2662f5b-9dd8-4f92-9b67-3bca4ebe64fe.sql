-- Phase 2 & 3: Invoice & Bill Safe RPCs
-- ======================================

-- Update invoice status enum to match spec (remove AWAITING_PAYMENT, add ISSUED)
-- Note: We keep AWAITING_PAYMENT for backward compatibility but use ISSUED as primary

-- Add locked_fields and override_history columns to invoices
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS locked_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS override_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id);

-- Add similar columns to bills
ALTER TABLE bills 
  ADD COLUMN IF NOT EXISTS locked_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS override_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id);

-- ============================================
-- INVOICE SAFE RPCs
-- ============================================

-- 2.1 Issue Invoice Safe (with atomic invoice number generation)
CREATE OR REPLACE FUNCTION issue_invoice_safe(
  p_invoice_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_user_id UUID;
  v_org_id UUID;
  v_settings org_settings;
  v_invoice_number TEXT;
  v_before_state JSONB;
  v_locked_fields JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Fetch invoice with lock
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  v_org_id := v_invoice.organization_id;
  
  -- Check permission
  IF NOT can_issue_invoices(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot issue invoices');
  END IF;
  
  -- Validate status
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be in DRAFT status to issue');
  END IF;
  
  -- Store before state
  v_before_state := to_jsonb(v_invoice);
  
  -- Get org settings and generate invoice number with row lock
  SELECT * INTO v_settings FROM org_settings WHERE organization_id = v_org_id FOR UPDATE;
  
  IF v_settings.organization_id IS NULL THEN
    -- Create default settings
    INSERT INTO org_settings (organization_id) VALUES (v_org_id)
    RETURNING * INTO v_settings;
  END IF;
  
  -- Generate invoice number: prefix + padded number
  v_invoice_number := v_settings.invoice_number_prefix || 
    LPAD(v_settings.invoice_number_next::TEXT, v_settings.invoice_number_padding, '0');
  
  -- Increment next number
  UPDATE org_settings 
  SET invoice_number_next = invoice_number_next + 1,
      updated_at = now()
  WHERE organization_id = v_org_id;
  
  -- Define locked fields (financial fields that cannot be edited after issue)
  v_locked_fields := jsonb_build_object(
    'customer_id', true,
    'invoice_number', true,
    'issue_date', true,
    'currency', true,
    'exchange_rate', true,
    'total_net', true,
    'total_vat', true,
    'total_gross', true,
    'lines', true
  );
  
  -- Update invoice
  UPDATE invoices SET
    status = 'ISSUED',
    invoice_number = COALESCE(v_invoice.invoice_number, v_invoice_number),
    issued_at = now(),
    issued_by = v_user_id,
    locked_fields = v_locked_fields,
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    'invoice',
    p_invoice_id,
    'issue',
    'status',
    'DRAFT',
    'ISSUED',
    v_before_state,
    (SELECT to_jsonb(i) FROM invoices i WHERE i.id = p_invoice_id),
    jsonb_build_object('invoice_number', COALESCE(v_invoice.invoice_number, v_invoice_number), 'notes', p_notes)
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'invoice_number', COALESCE(v_invoice.invoice_number, v_invoice_number)
  );
END;
$$;

-- 2.2 Update Issued Invoice Safe (only allowed fields)
CREATE OR REPLACE FUNCTION update_issued_invoice_safe(
  p_invoice_id UUID,
  p_updates JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_user_id UUID;
  v_org_id UUID;
  v_user_role TEXT;
  v_before_state JSONB;
  v_allowed_fields TEXT[] := ARRAY['notes', 'internal_notes', 'tags', 'attachments', 'message_to_customer'];
  v_manager_fields TEXT[] := ARRAY['due_date'];
  v_key TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  v_org_id := v_invoice.organization_id;
  
  -- Check basic permission
  IF NOT user_in_organization(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Get user role
  SELECT role INTO v_user_role FROM organization_users 
  WHERE user_id = v_user_id AND organization_id = v_org_id;
  
  -- Validate status - only issued, part_paid, or paid invoices
  IF v_invoice.status NOT IN ('ISSUED', 'PART_PAID', 'PAID', 'AWAITING_PAYMENT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot update invoice in ' || v_invoice.status || ' status');
  END IF;
  
  v_before_state := to_jsonb(v_invoice);
  
  -- Validate each field in updates
  FOR v_key IN SELECT jsonb_object_keys(p_updates)
  LOOP
    -- Check if field is allowed for all users
    IF v_key = ANY(v_allowed_fields) THEN
      CONTINUE;
    -- Check if field is allowed for manager+
    ELSIF v_key = ANY(v_manager_fields) THEN
      IF NOT user_has_role_at_least(v_user_id, v_org_id, 'manager') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied: ' || v_key || ' requires manager role');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Field ' || v_key || ' is locked on issued invoices');
    END IF;
  END LOOP;
  
  -- Apply updates
  UPDATE invoices SET
    notes = COALESCE(p_updates->>'notes', notes),
    due_date = COALESCE((p_updates->>'due_date')::DATE, due_date),
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    'invoice',
    p_invoice_id,
    'update_issued',
    NULL,
    NULL,
    NULL,
    v_before_state,
    (SELECT to_jsonb(i) FROM invoices i WHERE i.id = p_invoice_id),
    jsonb_build_object('updates', p_updates, 'reason', p_reason)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2.3 Override Invoice Lock Safe (admin/owner only with mandatory reason)
CREATE OR REPLACE FUNCTION override_invoice_lock_safe(
  p_invoice_id UUID,
  p_changes JSONB,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_user_id UUID;
  v_org_id UUID;
  v_before_state JSONB;
  v_override_entry JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_reason IS NULL OR p_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required for lock override');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  v_org_id := v_invoice.organization_id;
  
  -- Check permission - admin/owner only
  IF NOT can_override_invoice_lock(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: only admin/owner can override locks');
  END IF;
  
  v_before_state := to_jsonb(v_invoice);
  
  -- Build override history entry
  v_override_entry := jsonb_build_object(
    'timestamp', now(),
    'user_id', v_user_id,
    'reason', p_reason,
    'changes', p_changes,
    'before_values', jsonb_build_object()
  );
  
  -- Apply changes (this is intentionally permissive for admin override)
  UPDATE invoices SET
    customer_id = COALESCE((p_changes->>'customer_id')::UUID, customer_id),
    contact_name = COALESCE(p_changes->>'contact_name', contact_name),
    contact_email = COALESCE(p_changes->>'contact_email', contact_email),
    issue_date = COALESCE((p_changes->>'issue_date')::DATE, issue_date),
    due_date = COALESCE((p_changes->>'due_date')::DATE, due_date),
    notes = COALESCE(p_changes->>'notes', notes),
    override_history = COALESCE(override_history, '[]'::JSONB) || v_override_entry,
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write detailed audit log
  PERFORM write_audit_log(
    v_org_id,
    'invoice',
    p_invoice_id,
    'override_lock',
    NULL,
    NULL,
    NULL,
    v_before_state,
    (SELECT to_jsonb(i) FROM invoices i WHERE i.id = p_invoice_id),
    jsonb_build_object('changes', p_changes, 'reason', p_reason, 'override_type', 'admin_override')
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2.4 Void Invoice Safe
CREATE OR REPLACE FUNCTION void_invoice_safe(
  p_invoice_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_user_id UUID;
  v_org_id UUID;
  v_before_state JSONB;
  v_has_payments BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_reason IS NULL OR p_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required to void invoice');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  v_org_id := v_invoice.organization_id;
  
  IF v_invoice.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice already voided');
  END IF;
  
  -- Check if has payments
  v_has_payments := COALESCE(v_invoice.amount_paid, 0) > 0;
  
  -- Permission check based on payment status
  IF v_has_payments THEN
    -- Paid invoices: admin/owner only
    IF NOT can_void_paid_invoices(v_user_id, v_org_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: voiding paid invoices requires admin/owner');
    END IF;
  ELSE
    -- Unpaid invoices: manager+
    IF NOT can_void_unpaid_invoices(v_user_id, v_org_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot void invoices');
    END IF;
  END IF;
  
  v_before_state := to_jsonb(v_invoice);
  
  -- Update invoice
  UPDATE invoices SET
    status = 'VOIDED',
    void_reason = p_reason,
    voided_at = now(),
    voided_by = v_user_id,
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    'invoice',
    p_invoice_id,
    'void',
    'status',
    v_invoice.status,
    'VOIDED',
    v_before_state,
    (SELECT to_jsonb(i) FROM invoices i WHERE i.id = p_invoice_id),
    jsonb_build_object('reason', p_reason, 'had_payments', v_has_payments)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2.5 Record Invoice Payment Safe
CREATE OR REPLACE FUNCTION record_invoice_payment_safe(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_bank_account_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_user_id UUID;
  v_org_id UUID;
  v_payment_id UUID;
  v_remaining NUMERIC;
  v_new_status TEXT;
  v_new_paid NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  v_org_id := v_invoice.organization_id;
  
  -- Check permission
  IF NOT user_has_role_at_least(v_user_id, v_org_id, 'staff') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Validate invoice status
  IF v_invoice.status NOT IN ('ISSUED', 'PART_PAID', 'AWAITING_PAYMENT') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be issued before recording payment');
  END IF;
  
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be positive');
  END IF;
  
  -- Calculate new balances
  v_remaining := COALESCE(v_invoice.total_gross, 0) - COALESCE(v_invoice.amount_paid, 0);
  v_new_paid := COALESCE(v_invoice.amount_paid, 0) + p_amount;
  
  IF v_new_paid >= v_invoice.total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;
  
  -- Insert payment record
  INSERT INTO invoice_payments (
    invoice_id,
    amount,
    payment_date,
    bank_account_id,
    reference,
    payment_method,
    payment_type,
    created_by
  ) VALUES (
    p_invoice_id,
    p_amount,
    p_payment_date,
    p_bank_account_id,
    p_reference,
    p_payment_method,
    CASE WHEN p_amount > v_remaining THEN 'overpayment' ELSE 'normal' END,
    v_user_id
  )
  RETURNING id INTO v_payment_id;
  
  -- Update invoice
  UPDATE invoices SET
    amount_paid = v_new_paid,
    remaining_balance = GREATEST(v_invoice.total_gross - v_new_paid, 0),
    status = v_new_status,
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    'invoice_payment',
    v_payment_id,
    'create',
    NULL,
    NULL,
    NULL,
    NULL,
    (SELECT to_jsonb(ip) FROM invoice_payments ip WHERE ip.id = v_payment_id),
    jsonb_build_object('invoice_id', p_invoice_id, 'new_status', v_new_status)
  );
  
  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'new_status', v_new_status);
END;
$$;

-- 2.6 Reverse Invoice Payment Safe
CREATE OR REPLACE FUNCTION reverse_invoice_payment_safe(
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
  v_user_id UUID;
  v_org_id UUID;
  v_new_status TEXT;
  v_new_paid NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF p_reason IS NULL OR p_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required for payment reversal');
  END IF;

  SELECT * INTO v_payment FROM invoice_payments WHERE id = p_payment_id FOR UPDATE;
  
  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;
  
  SELECT * INTO v_invoice FROM invoices WHERE id = v_payment.invoice_id FOR UPDATE;
  v_org_id := v_invoice.organization_id;
  
  -- Check permission - manager+ for reversals
  IF NOT user_has_role_at_least(v_user_id, v_org_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: payment reversal requires manager role');
  END IF;
  
  -- Calculate new balances
  v_new_paid := GREATEST(COALESCE(v_invoice.amount_paid, 0) - v_payment.amount, 0);
  
  IF v_new_paid <= 0 THEN
    v_new_status := 'ISSUED';
  ELSIF v_new_paid < v_invoice.total_gross THEN
    v_new_status := 'PART_PAID';
  ELSE
    v_new_status := 'PAID';
  END IF;
  
  -- Instead of deleting, mark as reversed (soft delete pattern)
  UPDATE invoice_payments SET
    payment_type = 'reversed',
    notes = COALESCE(notes, '') || E'\n[REVERSED] ' || p_reason
  WHERE id = p_payment_id;
  
  -- Update invoice
  UPDATE invoices SET
    amount_paid = v_new_paid,
    remaining_balance = v_invoice.total_gross - v_new_paid,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_invoice.id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    'invoice_payment',
    p_payment_id,
    'reverse',
    'payment_type',
    v_payment.payment_type,
    'reversed',
    to_jsonb(v_payment),
    NULL,
    jsonb_build_object('reason', p_reason, 'invoice_id', v_invoice.id, 'new_status', v_new_status)
  );
  
  RETURN jsonb_build_object('success', true, 'new_invoice_status', v_new_status);
END;
$$;