-- Phase 3: Bills Lifecycle Safe RPCs
-- Add tracking columns to bills table
ALTER TABLE bills ADD COLUMN IF NOT EXISTS locked_fields JSONB DEFAULT '{}';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS override_history JSONB DEFAULT '[]';

-- Create approve_bill_safe RPC
CREATE OR REPLACE FUNCTION public.approve_bill_safe(
  p_bill_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_org_id UUID;
BEGIN
  -- Get bill and validate
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  v_org_id := v_bill.organization_id;
  
  -- Check permission (manager+)
  IF NOT can_approve_bills(p_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager role or higher');
  END IF;
  
  -- Only DRAFT bills can be approved
  IF v_bill.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT bills can be approved');
  END IF;
  
  -- Update bill status
  UPDATE bills SET
    status = 'AWAITING_PAYMENT',
    approved_at = now(),
    approved_by = p_user_id,
    locked_fields = jsonb_build_object(
      'supplier_id', true,
      'issue_date', true,
      'currency', true,
      'exchange_rate', true,
      'total_net', true,
      'total_vat', true,
      'total_gross', true
    ),
    updated_at = now()
  WHERE id = p_bill_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'bill_approved',
    'bill',
    p_bill_id,
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'AWAITING_PAYMENT', 'approved_at', now())
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'bill_id', p_bill_id,
    'status', 'AWAITING_PAYMENT'
  );
END;
$$;

-- Create void_bill_safe RPC
CREATE OR REPLACE FUNCTION public.void_bill_safe(
  p_bill_id UUID,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_org_id UUID;
  v_has_payments BOOLEAN;
BEGIN
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required for voiding a bill');
  END IF;

  -- Get bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  v_org_id := v_bill.organization_id;
  
  -- Check for payments
  SELECT EXISTS(SELECT 1 FROM bill_payments WHERE bill_id = p_bill_id) INTO v_has_payments;
  
  -- Permission check based on payment status
  IF v_has_payments THEN
    -- Only owner/admin can void bills with payments
    IF NOT can_override_locked_records(p_user_id, v_org_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot void bill with payments: requires admin/owner permission');
    END IF;
  ELSE
    -- Manager+ can void unpaid bills
    IF NOT can_approve_bills(p_user_id, v_org_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager role or higher');
    END IF;
  END IF;
  
  -- Cannot void already voided
  IF v_bill.status = 'VOID' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill is already voided');
  END IF;
  
  -- Update bill
  UPDATE bills SET
    status = 'VOID',
    void_reason = p_reason,
    voided_at = now(),
    voided_by = p_user_id,
    updated_at = now()
  WHERE id = p_bill_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'bill_voided',
    'bill',
    p_bill_id,
    jsonb_build_object('status', v_bill.status),
    jsonb_build_object('status', 'VOID', 'reason', p_reason),
    jsonb_build_object('had_payments', v_has_payments)
  );
  
  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;

-- Create record_bill_payment_safe RPC
CREATE OR REPLACE FUNCTION public.record_bill_payment_safe(
  p_bill_id UUID,
  p_user_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_bank_account_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'bank_transfer',
  p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_org_id UUID;
  v_payment_id UUID;
  v_new_status TEXT;
  v_total_paid NUMERIC;
BEGIN
  -- Get bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  v_org_id := v_bill.organization_id;
  
  -- Check permission (staff+)
  IF NOT can_manage_bills(p_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Only approved bills can receive payments
  IF v_bill.status NOT IN ('AWAITING_PAYMENT', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill must be approved before recording payments');
  END IF;
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be positive');
  END IF;
  
  -- Create payment record
  INSERT INTO bill_payments (
    bill_id,
    amount,
    payment_date,
    bank_account_id,
    payment_method,
    reference,
    created_by
  ) VALUES (
    p_bill_id,
    p_amount,
    p_payment_date,
    p_bank_account_id,
    p_payment_method,
    p_reference,
    p_user_id
  ) RETURNING id INTO v_payment_id;
  
  -- Calculate total paid (trigger should handle this, but we'll verify)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM bill_payments WHERE bill_id = p_bill_id;
  
  -- Determine new status
  IF v_total_paid >= v_bill.total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;
  
  -- Update bill (trigger may have done this, but ensure consistency)
  UPDATE bills SET
    amount_paid = v_total_paid,
    remaining_balance = total_gross - v_total_paid,
    status = v_new_status,
    updated_at = now()
  WHERE id = p_bill_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'bill_payment_recorded',
    'bill_payment',
    v_payment_id,
    NULL,
    jsonb_build_object(
      'bill_id', p_bill_id,
      'amount', p_amount,
      'payment_date', p_payment_date,
      'new_bill_status', v_new_status,
      'total_paid', v_total_paid
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'bill_status', v_new_status,
    'total_paid', v_total_paid
  );
END;
$$;

-- Create reverse_bill_payment_safe RPC
CREATE OR REPLACE FUNCTION public.reverse_bill_payment_safe(
  p_payment_id UUID,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_bill RECORD;
  v_org_id UUID;
  v_total_paid NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required for payment reversal');
  END IF;

  -- Get payment
  SELECT * INTO v_payment FROM bill_payments WHERE id = p_payment_id;
  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;
  
  -- Get bill
  SELECT * INTO v_bill FROM bills WHERE id = v_payment.bill_id;
  v_org_id := v_bill.organization_id;
  
  -- Check permission (manager+)
  IF NOT can_approve_bills(p_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager role or higher');
  END IF;
  
  -- Soft delete by setting payment_type to reversal and negating
  -- Instead of hard delete, we add a reversal entry
  INSERT INTO bill_payments (
    bill_id,
    amount,
    payment_date,
    bank_account_id,
    payment_method,
    reference,
    payment_type,
    notes,
    created_by
  ) VALUES (
    v_payment.bill_id,
    -v_payment.amount,
    CURRENT_DATE,
    v_payment.bank_account_id,
    v_payment.payment_method,
    'REVERSAL: ' || COALESCE(v_payment.reference, ''),
    'reversal',
    p_reason,
    p_user_id
  );
  
  -- Recalculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM bill_payments WHERE bill_id = v_payment.bill_id;
  
  -- Determine new status
  IF v_total_paid <= 0 THEN
    v_new_status := 'AWAITING_PAYMENT';
  ELSIF v_total_paid >= v_bill.total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;
  
  -- Update bill
  UPDATE bills SET
    amount_paid = v_total_paid,
    remaining_balance = total_gross - v_total_paid,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_payment.bill_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'bill_payment_reversed',
    'bill_payment',
    p_payment_id,
    jsonb_build_object('amount', v_payment.amount),
    jsonb_build_object('reason', p_reason, 'new_bill_status', v_new_status),
    jsonb_build_object('original_payment_date', v_payment.payment_date)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'bill_id', v_payment.bill_id,
    'bill_status', v_new_status,
    'total_paid', v_total_paid
  );
END;
$$;

-- Create override_bill_lock_safe RPC (owner/admin only)
CREATE OR REPLACE FUNCTION public.override_bill_lock_safe(
  p_bill_id UUID,
  p_user_id UUID,
  p_changes JSONB,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_org_id UUID;
  v_before_state JSONB;
BEGIN
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required for override');
  END IF;

  -- Get bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  v_org_id := v_bill.organization_id;
  
  -- Only owner/admin can override
  IF NOT can_override_locked_records(p_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires admin/owner');
  END IF;
  
  -- Store before state
  v_before_state := to_jsonb(v_bill);
  
  -- Apply changes dynamically
  UPDATE bills SET
    supplier_id = COALESCE((p_changes->>'supplier_id')::UUID, supplier_id),
    issue_date = COALESCE((p_changes->>'issue_date')::DATE, issue_date),
    due_date = COALESCE((p_changes->>'due_date')::DATE, due_date),
    reference = COALESCE(p_changes->>'reference', reference),
    notes = COALESCE(p_changes->>'notes', notes),
    override_history = COALESCE(override_history, '[]'::jsonb) || jsonb_build_object(
      'changed_at', now(),
      'changed_by', p_user_id,
      'reason', p_reason,
      'changes', p_changes
    ),
    updated_at = now()
  WHERE id = p_bill_id;
  
  -- Write audit log
  PERFORM write_audit_log(
    v_org_id,
    p_user_id,
    'bill_lock_override',
    'bill',
    p_bill_id,
    v_before_state,
    p_changes,
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;