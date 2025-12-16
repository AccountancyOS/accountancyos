-- Phase 11 Permissions Hardening: Safe RPCs with Audit Logging

-- ============================================================================
-- PART 1: Create Invoice Safe (staff+)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
BEGIN
  v_user_id := auth.uid();
  
  -- Permission check: staff+
  IF NOT public.can_create_invoices(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires staff role or higher');
  END IF;
  
  -- Generate invoice number
  SELECT 'INV-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)), 0) + 1)::text, 6, '0')
  INTO v_invoice_number
  FROM invoices 
  WHERE organization_id = p_organization_id;
  
  -- Create the invoice
  INSERT INTO invoices (
    organization_id,
    client_id,
    company_id,
    customer_id,
    invoice_number,
    issue_date,
    due_date,
    currency,
    notes,
    status
  )
  VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    (p_input->>'customer_id')::uuid,
    v_invoice_number,
    COALESCE((p_input->>'issue_date')::date, CURRENT_DATE),
    COALESCE((p_input->>'due_date')::date, CURRENT_DATE + INTERVAL '30 days'),
    COALESCE(p_input->>'currency', 'GBP'),
    p_input->>'notes',
    'DRAFT'
  )
  RETURNING id INTO v_invoice_id;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    new_value,
    metadata
  )
  VALUES (
    p_organization_id,
    'invoice',
    v_invoice_id,
    'created',
    v_user_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'status', 'DRAFT'),
    jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number
  );
END;
$$;

-- ============================================================================
-- PART 2: Update Invoice Draft Safe (staff+ for DRAFT)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_old_value jsonb;
BEGIN
  v_user_id := auth.uid();
  
  -- Get invoice and verify it exists
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  -- Check status - only DRAFT can be edited by staff
  IF v_invoice.status != 'DRAFT' THEN
    -- Admin+ can edit non-draft with override
    IF NOT public.user_has_role_at_least(v_user_id, v_invoice.organization_id, 'admin') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot edit non-draft invoice. Admin override required.');
    END IF;
  ELSE
    -- Staff+ can edit draft
    IF NOT public.can_edit_invoices(v_user_id, v_invoice.organization_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires staff role or higher');
    END IF;
  END IF;
  
  -- Store old value for audit
  v_old_value := to_jsonb(v_invoice);
  
  -- Update invoice fields
  UPDATE invoices
  SET
    customer_id = COALESCE((p_input->>'customer_id')::uuid, customer_id),
    issue_date = COALESCE((p_input->>'issue_date')::date, issue_date),
    due_date = COALESCE((p_input->>'due_date')::date, due_date),
    currency = COALESCE(p_input->>'currency', currency),
    notes = COALESCE(p_input->>'notes', notes),
    updated_at = now(),
    override_metadata = CASE 
      WHEN v_invoice.status != 'DRAFT' 
      THEN jsonb_build_object('override_by', v_user_id, 'override_at', now(), 'reason', p_input->>'override_reason')
      ELSE override_metadata
    END
  WHERE id = p_invoice_id;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    old_value,
    new_value,
    metadata
  )
  VALUES (
    v_invoice.organization_id,
    'invoice',
    p_invoice_id,
    CASE WHEN v_invoice.status != 'DRAFT' THEN 'override' ELSE 'updated' END,
    v_user_id,
    v_old_value,
    p_input,
    CASE WHEN v_invoice.status != 'DRAFT' 
      THEN jsonb_build_object('override_reason', p_input->>'override_reason')
      ELSE '{}'::jsonb
    END
  );
  
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- ============================================================================
-- PART 3: Issue Invoice Safe (manager+)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.issue_invoice_safe(
  p_invoice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_line_count int;
BEGIN
  v_user_id := auth.uid();
  
  -- Get invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  -- Permission check: manager+
  IF NOT public.can_issue_invoices(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager role or higher');
  END IF;
  
  -- Validate status
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be issued');
  END IF;
  
  -- Validate has lines
  SELECT COUNT(*) INTO v_line_count FROM invoice_lines WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot issue invoice without line items');
  END IF;
  
  -- Update to AWAITING_PAYMENT (issued)
  UPDATE invoices
  SET
    status = 'AWAITING_PAYMENT',
    issued_at = now(),
    issued_by = v_user_id,
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    old_value,
    new_value
  )
  VALUES (
    v_invoice.organization_id,
    'invoice',
    p_invoice_id,
    'issued',
    v_user_id,
    'DRAFT',
    'AWAITING_PAYMENT'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'status', 'AWAITING_PAYMENT',
    'issued_at', now()
  );
END;
$$;

-- ============================================================================
-- PART 4: Void Invoice Safe (admin+)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.void_invoice_safe(
  p_invoice_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
BEGIN
  v_user_id := auth.uid();
  
  -- Get invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  -- Permission check: admin+
  IF NOT public.can_void_invoices(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires admin role or higher');
  END IF;
  
  -- Validate status - cannot void already voided
  IF v_invoice.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is already voided');
  END IF;
  
  -- Require reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Void reason is required');
  END IF;
  
  -- Update to VOIDED
  UPDATE invoices
  SET
    status = 'VOIDED',
    voided_at = now(),
    voided_by = v_user_id,
    void_reason = p_reason,
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    old_value,
    new_value,
    metadata
  )
  VALUES (
    v_invoice.organization_id,
    'invoice',
    p_invoice_id,
    'voided',
    v_user_id,
    v_invoice.status,
    'VOIDED',
    jsonb_build_object('void_reason', p_reason)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'status', 'VOIDED',
    'voided_at', now()
  );
END;
$$;

-- ============================================================================
-- PART 5: Record Invoice Payment Safe (manager+)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_invoice_payment_safe(
  p_invoice_id uuid,
  p_payment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_payment_id uuid;
  v_is_locked boolean;
  v_total_paid numeric;
  v_new_status text;
BEGIN
  v_user_id := auth.uid();
  
  -- Get invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  -- Permission check: manager+
  IF NOT public.can_record_payments(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager role or higher');
  END IF;
  
  -- Validate status - cannot pay draft or voided
  IF v_invoice.status IN ('DRAFT', 'VOIDED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot record payment for ' || v_invoice.status || ' invoice');
  END IF;
  
  -- Check period lock
  SELECT public.is_period_locked(
    v_invoice.organization_id,
    CASE WHEN v_invoice.company_id IS NOT NULL THEN 'company' ELSE 'client' END,
    COALESCE(v_invoice.company_id, v_invoice.client_id),
    COALESCE((p_payment->>'payment_date')::date, CURRENT_DATE)
  ) INTO v_is_locked;
  
  IF v_is_locked THEN
    -- Check if admin can override
    IF NOT public.can_override_locked_records(v_user_id, v_invoice.organization_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Payment date is within a locked period. Admin override required.');
    END IF;
  END IF;
  
  -- Insert payment
  INSERT INTO invoice_payments (
    invoice_id,
    amount,
    payment_date,
    payment_method,
    reference,
    notes
  )
  VALUES (
    p_invoice_id,
    (p_payment->>'amount')::numeric,
    COALESCE((p_payment->>'payment_date')::date, CURRENT_DATE),
    p_payment->>'payment_method',
    p_payment->>'reference',
    p_payment->>'notes'
  )
  RETURNING id INTO v_payment_id;
  
  -- Calculate new total and status (trigger should handle this, but we determine for response)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid 
  FROM invoice_payments WHERE invoice_id = p_invoice_id;
  
  IF v_total_paid >= v_invoice.total_gross THEN
    v_new_status := 'PAID';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'PART_PAID';
  ELSE
    v_new_status := v_invoice.status;
  END IF;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    new_value,
    metadata
  )
  VALUES (
    v_invoice.organization_id,
    'invoice_payment',
    v_payment_id,
    'payment_recorded',
    v_user_id,
    p_payment,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'period_override', v_is_locked
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'invoice_status', v_new_status,
    'total_paid', v_total_paid
  );
END;
$$;

-- ============================================================================
-- PART 6: Queue Email Safe (staff+)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_email_safe(
  p_organization_id uuid,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Permission check: staff+
  IF NOT public.can_send_emails(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires staff role or higher');
  END IF;
  
  -- Insert into queue
  INSERT INTO email_queue (
    organization_id,
    to_email,
    to_name,
    subject,
    body_html,
    entity_type,
    entity_id,
    merge_data,
    status,
    queued_by
  )
  VALUES (
    p_organization_id,
    p_input->>'to_email',
    p_input->>'to_name',
    p_input->>'subject',
    p_input->>'body_html',
    p_input->>'entity_type',
    (p_input->>'entity_id')::uuid,
    COALESCE(p_input->'merge_data', '{}'::jsonb),
    'pending',
    v_user_id
  )
  RETURNING id INTO v_email_id;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    metadata
  )
  VALUES (
    p_organization_id,
    'email_queue',
    v_email_id,
    'queued',
    v_user_id,
    jsonb_build_object('to_email', p_input->>'to_email', 'subject', p_input->>'subject')
  );
  
  RETURN jsonb_build_object('success', true, 'email_id', v_email_id);
END;
$$;