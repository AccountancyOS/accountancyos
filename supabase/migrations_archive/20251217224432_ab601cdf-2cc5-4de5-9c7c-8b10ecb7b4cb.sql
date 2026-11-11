
-- =============================================================================
-- CORRECTIVE MIGRATION: Drop all overloads and create canonical RPC functions
-- =============================================================================

-- 1) DROP ALL EXISTING OVERLOADS
-- -----------------------------------------------------------------------------

-- create_invoice_draft_safe (2 overloads)
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(uuid, text, uuid, uuid, text, date, date, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(uuid, text, uuid, text, text, text, text, text, date, date, text, text, uuid, jsonb) CASCADE;

-- update_invoice_draft_safe (3 overloads)
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, uuid, text, date, date, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, text, text, text, date, date, text, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, jsonb) CASCADE;

-- issue_invoice_safe (2 overloads)
DROP FUNCTION IF EXISTS public.issue_invoice_safe(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.issue_invoice_safe(uuid, text) CASCADE;

-- record_invoice_payment_safe (2 overloads)
DROP FUNCTION IF EXISTS public.record_invoice_payment_safe(uuid, numeric, date, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.record_invoice_payment_safe(uuid, jsonb) CASCADE;

-- queue_email_safe (2 overloads)
DROP FUNCTION IF EXISTS public.queue_email_safe(uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.queue_email_safe(uuid, text, text, text, text, uuid, text, uuid, jsonb, timestamptz) CASCADE;

-- get_invoice_with_lines_safe
DROP FUNCTION IF EXISTS public.get_invoice_with_lines_safe(uuid) CASCADE;

-- Bill functions (single overloads but drop for clean slate)
DROP FUNCTION IF EXISTS public.create_bill_draft_safe(uuid, text, uuid, uuid, text, text, date, date, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.approve_bill_safe(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.void_bill_safe(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.record_bill_payment_safe(uuid, numeric, date, uuid, text, text) CASCADE;

-- Other safe functions
DROP FUNCTION IF EXISTS public.void_invoice_safe(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_automation_rule_safe(uuid, text, text, jsonb, text, jsonb, boolean, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_automation_rule_safe(uuid, text, text, jsonb, text, jsonb, boolean, text) CASCADE;
DROP FUNCTION IF EXISTS public.delete_automation_rule_safe(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.toggle_automation_rule_safe(uuid, boolean) CASCADE;

-- 2) CREATE/REPLACE RPC CONTEXT HELPERS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_rpc_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.rpc', '1', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_rpc_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.rpc', true), '') = '1';
$$;

-- 3) CANONICAL INVOICE FUNCTIONS
-- -----------------------------------------------------------------------------

-- create_invoice_draft_safe (CANONICAL)
CREATE FUNCTION public.create_invoice_draft_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_invoice_type text DEFAULT 'SALES',
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency text DEFAULT 'GBP',
  p_customer_id uuid DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice_id uuid;
  v_line jsonb;
  v_line_number int := 0;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_line_net numeric;
  v_line_vat numeric;
  v_line_gross numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_validated_lines jsonb[] := '{}';
BEGIN
  -- Set RPC context for RLS bypass
  PERFORM public.set_rpc_context();
  
  -- Validate user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Validate org membership
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  -- Validate entity_type
  IF p_entity_type NOT IN ('client', 'company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entity_type');
  END IF;
  
  -- Validate and compute lines FIRST (before any mutation)
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      -- Validate description
      IF (v_line->>'description') IS NULL OR length(trim(v_line->>'description')) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': description required');
      END IF;
      
      -- Parse and validate numeric fields
      v_quantity := COALESCE((v_line->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
      v_vat_rate := COALESCE((v_line->>'vat_rate')::numeric, 0);
      
      IF v_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': quantity must be positive');
      END IF;
      
      IF v_unit_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': unit_price cannot be negative');
      END IF;
      
      -- Server-side calculation
      v_line_net := ROUND(v_quantity * v_unit_price, 2);
      v_line_vat := ROUND(v_line_net * v_vat_rate / 100, 2);
      v_line_gross := v_line_net + v_line_vat;
      
      v_total_net := v_total_net + v_line_net;
      v_total_vat := v_total_vat + v_line_vat;
      v_total_gross := v_total_gross + v_line_gross;
      
      -- Store validated line
      v_validated_lines := array_append(v_validated_lines, jsonb_build_object(
        'line_number', v_line_number,
        'description', trim(v_line->>'description'),
        'quantity', v_quantity,
        'unit_price', v_unit_price,
        'vat_rate', v_vat_rate,
        'net_amount', v_line_net,
        'vat_amount', v_line_vat,
        'gross_amount', v_line_gross,
        'account_id', v_line->>'account_id',
        'vat_code_id', v_line->>'vat_code_id'
      ));
    END LOOP;
  END IF;
  
  -- All validation passed, now create invoice
  INSERT INTO invoices (
    organization_id,
    client_id,
    company_id,
    invoice_type,
    contact_name,
    contact_email,
    invoice_number,
    reference,
    issue_date,
    due_date,
    notes,
    currency,
    customer_id,
    status,
    total_net,
    total_vat,
    total_gross,
    amount_paid,
    remaining_balance
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    COALESCE(p_invoice_type, 'SALES'),
    p_contact_name,
    p_contact_email,
    p_invoice_number,
    p_reference,
    COALESCE(p_issue_date, CURRENT_DATE),
    COALESCE(p_due_date, CURRENT_DATE + 30),
    p_notes,
    COALESCE(p_currency, 'GBP'),
    p_customer_id,
    'DRAFT',
    v_total_net,
    v_total_vat,
    v_total_gross,
    0,
    v_total_gross
  )
  RETURNING id INTO v_invoice_id;
  
  -- Insert validated lines
  FOR i IN 1..array_length(v_validated_lines, 1) LOOP
    INSERT INTO invoice_lines (
      invoice_id,
      line_number,
      description,
      quantity,
      unit_price,
      vat_rate,
      net_amount,
      vat_amount,
      gross_amount,
      account_id,
      vat_code_id
    ) VALUES (
      v_invoice_id,
      (v_validated_lines[i]->>'line_number')::int,
      v_validated_lines[i]->>'description',
      (v_validated_lines[i]->>'quantity')::numeric,
      (v_validated_lines[i]->>'unit_price')::numeric,
      (v_validated_lines[i]->>'vat_rate')::numeric,
      (v_validated_lines[i]->>'net_amount')::numeric,
      (v_validated_lines[i]->>'vat_amount')::numeric,
      (v_validated_lines[i]->>'gross_amount')::numeric,
      NULLIF(v_validated_lines[i]->>'account_id', '')::uuid,
      NULLIF(v_validated_lines[i]->>'vat_code_id', '')::uuid
    );
  END LOOP;
  
  -- Audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (p_organization_id, 'invoice', v_invoice_id, 'created', v_user_id,
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$;

-- update_invoice_draft_safe (CANONICAL)
CREATE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_lines jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_before_state jsonb;
  v_after_state jsonb;
  v_line jsonb;
  v_line_number int := 0;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_line_net numeric;
  v_line_vat numeric;
  v_line_gross numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_validated_lines jsonb[] := '{}';
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get invoice and validate
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be edited');
  END IF;
  
  -- Capture before state
  v_before_state := jsonb_build_object(
    'contact_name', v_invoice.contact_name,
    'reference', v_invoice.reference,
    'total_gross', v_invoice.total_gross
  );
  
  -- Validate lines FIRST if provided
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      IF (v_line->>'description') IS NULL OR length(trim(v_line->>'description')) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': description required');
      END IF;
      
      v_quantity := COALESCE((v_line->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
      v_vat_rate := COALESCE((v_line->>'vat_rate')::numeric, 0);
      
      IF v_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': quantity must be positive');
      END IF;
      
      v_line_net := ROUND(v_quantity * v_unit_price, 2);
      v_line_vat := ROUND(v_line_net * v_vat_rate / 100, 2);
      v_line_gross := v_line_net + v_line_vat;
      
      v_total_net := v_total_net + v_line_net;
      v_total_vat := v_total_vat + v_line_vat;
      v_total_gross := v_total_gross + v_line_gross;
      
      v_validated_lines := array_append(v_validated_lines, jsonb_build_object(
        'line_number', v_line_number,
        'description', trim(v_line->>'description'),
        'quantity', v_quantity,
        'unit_price', v_unit_price,
        'vat_rate', v_vat_rate,
        'net_amount', v_line_net,
        'vat_amount', v_line_vat,
        'gross_amount', v_line_gross,
        'account_id', v_line->>'account_id',
        'vat_code_id', v_line->>'vat_code_id'
      ));
    END LOOP;
  END IF;
  
  -- All validation passed, now update
  UPDATE invoices SET
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    customer_id = COALESCE(p_customer_id, customer_id),
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Replace lines if provided
  IF p_lines IS NOT NULL THEN
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    FOR i IN 1..COALESCE(array_length(v_validated_lines, 1), 0) LOOP
      INSERT INTO invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
      ) VALUES (
        p_invoice_id,
        (v_validated_lines[i]->>'line_number')::int,
        v_validated_lines[i]->>'description',
        (v_validated_lines[i]->>'quantity')::numeric,
        (v_validated_lines[i]->>'unit_price')::numeric,
        (v_validated_lines[i]->>'vat_rate')::numeric,
        (v_validated_lines[i]->>'net_amount')::numeric,
        (v_validated_lines[i]->>'vat_amount')::numeric,
        (v_validated_lines[i]->>'gross_amount')::numeric,
        NULLIF(v_validated_lines[i]->>'account_id', '')::uuid,
        NULLIF(v_validated_lines[i]->>'vat_code_id', '')::uuid
      );
    END LOOP;
    
    -- Update totals
    UPDATE invoices SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross,
      remaining_balance = v_total_gross - COALESCE(amount_paid, 0)
    WHERE id = p_invoice_id;
  END IF;
  
  -- Capture after state
  SELECT jsonb_build_object(
    'contact_name', contact_name,
    'reference', reference,
    'total_gross', total_gross
  ) INTO v_after_state FROM invoices WHERE id = p_invoice_id;
  
  -- Audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, before_state, after_state)
  VALUES (v_invoice.organization_id, 'invoice', p_invoice_id, 'updated', v_user_id, v_before_state, v_after_state);
  
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- issue_invoice_safe (CANONICAL)
CREATE FUNCTION public.issue_invoice_safe(
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_invoice_number text;
  v_org_settings record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF NOT public.user_has_role_at_least(v_user_id, v_invoice.organization_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: manager role required');
  END IF;
  
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be issued');
  END IF;
  
  -- Generate invoice number atomically
  SELECT * INTO v_org_settings FROM org_settings WHERE organization_id = v_invoice.organization_id;
  v_invoice_number := COALESCE(v_org_settings.invoice_prefix, 'INV-') || 
    LPAD(COALESCE(v_org_settings.next_invoice_number, 1)::text, COALESCE(v_org_settings.invoice_padding, 5), '0');
  
  -- Increment sequence
  UPDATE org_settings SET next_invoice_number = COALESCE(next_invoice_number, 1) + 1
  WHERE organization_id = v_invoice.organization_id;
  
  -- Update invoice
  UPDATE invoices SET
    status = 'ISSUED',
    invoice_number = v_invoice_number,
    issued_at = now(),
    issued_by = v_user_id,
    locked_fields = '["contact_name","contact_email","invoice_number","issue_date","currency","customer_id","total_net","total_vat","total_gross"]'::jsonb
  WHERE id = p_invoice_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_invoice.organization_id, 'invoice', p_invoice_id, 'issued', v_user_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'status', 'ISSUED'));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;

-- void_invoice_safe (CANONICAL)
CREATE FUNCTION public.void_invoice_safe(
  p_invoice_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  -- Check permissions based on payment status
  IF v_invoice.amount_paid > 0 THEN
    IF NOT public.user_has_role_at_least(v_user_id, v_invoice.organization_id, 'admin') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin required to void paid invoices');
    END IF;
  ELSE
    IF NOT public.user_has_role_at_least(v_user_id, v_invoice.organization_id, 'manager') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Manager required to void invoices');
    END IF;
  END IF;
  
  IF v_invoice.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice already voided');
  END IF;
  
  UPDATE invoices SET
    status = 'VOIDED',
    void_reason = p_reason,
    voided_at = now(),
    voided_by = v_user_id
  WHERE id = p_invoice_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_invoice.organization_id, 'invoice', p_invoice_id, 'voided', v_user_id,
    jsonb_build_object('reason', p_reason));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- record_invoice_payment_safe (CANONICAL)
CREATE FUNCTION public.record_invoice_payment_safe(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_payment_id uuid;
  v_new_amount_paid numeric;
  v_new_status text;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF v_invoice.status NOT IN ('ISSUED', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot record payment on this invoice');
  END IF;
  
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be positive');
  END IF;
  
  -- Create payment record
  INSERT INTO invoice_payments (
    invoice_id, amount, payment_date, bank_account_id, payment_method, reference, created_by
  ) VALUES (
    p_invoice_id, p_amount, p_payment_date, p_bank_account_id, p_payment_method, p_reference, v_user_id
  ) RETURNING id INTO v_payment_id;
  
  -- Update invoice totals
  v_new_amount_paid := COALESCE(v_invoice.amount_paid, 0) + p_amount;
  v_new_status := CASE 
    WHEN v_new_amount_paid >= v_invoice.total_gross THEN 'PAID'
    ELSE 'PART_PAID'
  END;
  
  UPDATE invoices SET
    amount_paid = v_new_amount_paid,
    remaining_balance = total_gross - v_new_amount_paid,
    status = v_new_status
  WHERE id = p_invoice_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_invoice.organization_id, 'invoice_payment', v_payment_id, 'created', v_user_id,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id));
  
  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;

-- get_invoice_with_lines_safe (CANONICAL - whitelisted projection)
CREATE FUNCTION public.get_invoice_with_lines_safe(
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice jsonb;
  v_lines jsonb;
  v_org_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get org_id first for membership check
  SELECT organization_id INTO v_org_id FROM invoices WHERE id = p_invoice_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  -- Whitelisted invoice fields only
  SELECT jsonb_build_object(
    'id', i.id,
    'organization_id', i.organization_id,
    'client_id', i.client_id,
    'company_id', i.company_id,
    'customer_id', i.customer_id,
    'invoice_type', i.invoice_type,
    'status', i.status,
    'invoice_number', i.invoice_number,
    'contact_name', i.contact_name,
    'contact_email', i.contact_email,
    'reference', i.reference,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'notes', i.notes,
    'currency', i.currency,
    'total_net', i.total_net,
    'total_vat', i.total_vat,
    'total_gross', i.total_gross,
    'amount_paid', i.amount_paid,
    'remaining_balance', i.remaining_balance,
    'created_at', i.created_at,
    'updated_at', i.updated_at
  ) INTO v_invoice
  FROM invoices i
  WHERE i.id = p_invoice_id;
  
  -- Whitelisted line fields only
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', il.id,
    'line_number', il.line_number,
    'description', il.description,
    'quantity', il.quantity,
    'unit_price', il.unit_price,
    'vat_rate', il.vat_rate,
    'vat_code_id', il.vat_code_id,
    'account_id', il.account_id,
    'net_amount', il.net_amount,
    'vat_amount', il.vat_amount,
    'gross_amount', il.gross_amount
  ) ORDER BY il.line_number), '[]'::jsonb) INTO v_lines
  FROM invoice_lines il
  WHERE il.invoice_id = p_invoice_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'invoice', v_invoice,
    'lines', v_lines
  );
END;
$$;

-- 4) CANONICAL BILL FUNCTIONS
-- -----------------------------------------------------------------------------

-- create_bill_draft_safe (CANONICAL)
CREATE FUNCTION public.create_bill_draft_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_supplier_id uuid DEFAULT NULL,
  p_bill_number text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency text DEFAULT 'GBP',
  p_lines jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_bill_id uuid;
  v_line jsonb;
  v_line_number int := 0;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_line_net numeric;
  v_line_vat numeric;
  v_line_gross numeric;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_validated_lines jsonb[] := '{}';
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF p_entity_type NOT IN ('client', 'company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entity_type');
  END IF;
  
  -- Validate lines first
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      IF (v_line->>'description') IS NULL OR length(trim(v_line->>'description')) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': description required');
      END IF;
      
      v_quantity := COALESCE((v_line->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
      v_vat_rate := COALESCE((v_line->>'vat_rate')::numeric, 0);
      
      IF v_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Line ' || v_line_number || ': quantity must be positive');
      END IF;
      
      v_line_net := ROUND(v_quantity * v_unit_price, 2);
      v_line_vat := ROUND(v_line_net * v_vat_rate / 100, 2);
      v_line_gross := v_line_net + v_line_vat;
      
      v_total_net := v_total_net + v_line_net;
      v_total_vat := v_total_vat + v_line_vat;
      v_total_gross := v_total_gross + v_line_gross;
      
      v_validated_lines := array_append(v_validated_lines, jsonb_build_object(
        'line_number', v_line_number,
        'description', trim(v_line->>'description'),
        'quantity', v_quantity,
        'unit_price', v_unit_price,
        'vat_rate', v_vat_rate,
        'net_amount', v_line_net,
        'vat_amount', v_line_vat,
        'gross_amount', v_line_gross,
        'account_id', v_line->>'account_id',
        'vat_code_id', v_line->>'vat_code_id'
      ));
    END LOOP;
  END IF;
  
  -- Create bill
  INSERT INTO bills (
    organization_id,
    client_id,
    company_id,
    supplier_id,
    bill_number,
    reference,
    issue_date,
    due_date,
    notes,
    currency,
    status,
    total_net,
    total_vat,
    total_gross,
    amount_paid,
    remaining_balance
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_supplier_id,
    p_bill_number,
    p_reference,
    COALESCE(p_issue_date, CURRENT_DATE),
    COALESCE(p_due_date, CURRENT_DATE + 30),
    p_notes,
    COALESCE(p_currency, 'GBP'),
    'DRAFT',
    v_total_net,
    v_total_vat,
    v_total_gross,
    0,
    v_total_gross
  )
  RETURNING id INTO v_bill_id;
  
  -- Insert lines
  FOR i IN 1..COALESCE(array_length(v_validated_lines, 1), 0) LOOP
    INSERT INTO bill_lines (
      bill_id, line_number, description, quantity, unit_price,
      vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
    ) VALUES (
      v_bill_id,
      (v_validated_lines[i]->>'line_number')::int,
      v_validated_lines[i]->>'description',
      (v_validated_lines[i]->>'quantity')::numeric,
      (v_validated_lines[i]->>'unit_price')::numeric,
      (v_validated_lines[i]->>'vat_rate')::numeric,
      (v_validated_lines[i]->>'net_amount')::numeric,
      (v_validated_lines[i]->>'vat_amount')::numeric,
      (v_validated_lines[i]->>'gross_amount')::numeric,
      NULLIF(v_validated_lines[i]->>'account_id', '')::uuid,
      NULLIF(v_validated_lines[i]->>'vat_code_id', '')::uuid
    );
  END LOOP;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (p_organization_id, 'bill', v_bill_id, 'created', v_user_id,
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross));
  
  RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id);
END;
$$;

-- approve_bill_safe (CANONICAL)
CREATE FUNCTION public.approve_bill_safe(
  p_bill_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_bill record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_bill.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF NOT public.user_has_role_at_least(v_user_id, v_bill.organization_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Manager role required');
  END IF;
  
  IF v_bill.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT bills can be approved');
  END IF;
  
  UPDATE bills SET
    status = 'APPROVED',
    approved_at = now(),
    approved_by = v_user_id
  WHERE id = p_bill_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (v_bill.organization_id, 'bill', p_bill_id, 'approved', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;

-- void_bill_safe (CANONICAL)
CREATE FUNCTION public.void_bill_safe(
  p_bill_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_bill record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_bill.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF NOT public.user_has_role_at_least(v_user_id, v_bill.organization_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin role required');
  END IF;
  
  UPDATE bills SET
    status = 'VOIDED',
    void_reason = p_reason,
    voided_at = now(),
    voided_by = v_user_id
  WHERE id = p_bill_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_bill.organization_id, 'bill', p_bill_id, 'voided', v_user_id,
    jsonb_build_object('reason', p_reason));
  
  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;

-- record_bill_payment_safe (CANONICAL)
CREATE FUNCTION public.record_bill_payment_safe(
  p_bill_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_bill record;
  v_payment_id uuid;
  v_new_amount_paid numeric;
  v_new_status text;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_bill.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF v_bill.status NOT IN ('APPROVED', 'AWAITING_PAYMENT', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot record payment on this bill');
  END IF;
  
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be positive');
  END IF;
  
  INSERT INTO bill_payments (
    bill_id, amount, payment_date, bank_account_id, payment_method, reference, created_by
  ) VALUES (
    p_bill_id, p_amount, p_payment_date, p_bank_account_id, p_payment_method, p_reference, v_user_id
  ) RETURNING id INTO v_payment_id;
  
  v_new_amount_paid := COALESCE(v_bill.amount_paid, 0) + p_amount;
  v_new_status := CASE 
    WHEN v_new_amount_paid >= v_bill.total_gross THEN 'PAID'
    ELSE 'PART_PAID'
  END;
  
  UPDATE bills SET
    amount_paid = v_new_amount_paid,
    remaining_balance = total_gross - v_new_amount_paid,
    status = v_new_status
  WHERE id = p_bill_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_bill.organization_id, 'bill_payment', v_payment_id, 'created', v_user_id,
    jsonb_build_object('amount', p_amount, 'bill_id', p_bill_id));
  
  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;

-- 5) CANONICAL EMAIL/CUSTOMER/AUTOMATION FUNCTIONS
-- -----------------------------------------------------------------------------

-- queue_email_safe (CANONICAL)
CREATE FUNCTION public.queue_email_safe(
  p_organization_id uuid,
  p_to_email text,
  p_to_name text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_body_html text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_merge_data jsonb DEFAULT '{}'::jsonb,
  p_scheduled_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email_id uuid;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF p_to_email IS NULL OR length(trim(p_to_email)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient email required');
  END IF;
  
  INSERT INTO email_queue (
    organization_id, to_email, to_name, subject, body_html,
    template_id, entity_type, entity_id, merge_data, scheduled_at, status, created_by
  ) VALUES (
    p_organization_id, p_to_email, p_to_name, p_subject, p_body_html,
    p_template_id, p_entity_type, p_entity_id, p_merge_data,
    COALESCE(p_scheduled_at, now()), 'pending', v_user_id
  ) RETURNING id INTO v_email_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (p_organization_id, 'email_queue', v_email_id, 'queued', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'email_id', v_email_id);
END;
$$;

-- create_customer_safe (CANONICAL)
CREATE FUNCTION public.create_customer_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_billing_address jsonb DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_vat_number text DEFAULT NULL,
  p_payment_terms_days integer DEFAULT 30,
  p_default_currency text DEFAULT 'GBP',
  p_internal_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer name required');
  END IF;
  
  INSERT INTO customers (
    organization_id, client_id, company_id, name, email, phone,
    billing_address, company_name, vat_number, payment_terms_days, default_currency, internal_notes
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    trim(p_name), p_email, p_phone,
    p_billing_address, p_company_name, p_vat_number, p_payment_terms_days, p_default_currency, p_internal_notes
  ) RETURNING id INTO v_customer_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (p_organization_id, 'customer', v_customer_id, 'created', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'customer_id', v_customer_id);
END;
$$;

-- create_automation_rule_safe (CANONICAL)
CREATE FUNCTION public.create_automation_rule_safe(
  p_organization_id uuid,
  p_name text,
  p_trigger_type text,
  p_trigger_config jsonb DEFAULT '{}'::jsonb,
  p_action_type text DEFAULT NULL,
  p_action_config jsonb DEFAULT '{}'::jsonb,
  p_is_active boolean DEFAULT true,
  p_email_mode text DEFAULT 'draft'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rule_id uuid;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF NOT public.user_has_role_at_least(v_user_id, p_organization_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Manager role required');
  END IF;
  
  INSERT INTO automation_rules (
    organization_id, name, trigger_type, trigger_config, action_type, action_config, is_active, email_mode
  ) VALUES (
    p_organization_id, p_name, p_trigger_type, p_trigger_config, p_action_type, p_action_config, p_is_active, p_email_mode
  ) RETURNING id INTO v_rule_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (p_organization_id, 'automation_rule', v_rule_id, 'created', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'rule_id', v_rule_id);
END;
$$;

-- update_automation_rule_safe (CANONICAL)
CREATE FUNCTION public.update_automation_rule_safe(
  p_rule_id uuid,
  p_name text DEFAULT NULL,
  p_trigger_type text DEFAULT NULL,
  p_trigger_config jsonb DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_action_config jsonb DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_email_mode text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rule record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_rule.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF NOT public.user_has_role_at_least(v_user_id, v_rule.organization_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Manager role required');
  END IF;
  
  UPDATE automation_rules SET
    name = COALESCE(p_name, name),
    trigger_type = COALESCE(p_trigger_type, trigger_type),
    trigger_config = COALESCE(p_trigger_config, trigger_config),
    action_type = COALESCE(p_action_type, action_type),
    action_config = COALESCE(p_action_config, action_config),
    is_active = COALESCE(p_is_active, is_active),
    email_mode = COALESCE(p_email_mode, email_mode),
    updated_at = now()
  WHERE id = p_rule_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (v_rule.organization_id, 'automation_rule', p_rule_id, 'updated', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
END;
$$;

-- delete_automation_rule_safe (CANONICAL)
CREATE FUNCTION public.delete_automation_rule_safe(
  p_rule_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rule record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_rule.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  IF NOT public.user_has_role_at_least(v_user_id, v_rule.organization_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin role required');
  END IF;
  
  DELETE FROM automation_rules WHERE id = p_rule_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (v_rule.organization_id, 'automation_rule', p_rule_id, 'deleted', v_user_id);
  
  RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
END;
$$;

-- toggle_automation_rule_safe (CANONICAL)
CREATE FUNCTION public.toggle_automation_rule_safe(
  p_rule_id uuid,
  p_is_active boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rule record;
BEGIN
  PERFORM public.set_rpc_context();
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_rule.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  UPDATE automation_rules SET is_active = p_is_active, updated_at = now() WHERE id = p_rule_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_rule.organization_id, 'automation_rule', p_rule_id, 'toggled', v_user_id,
    jsonb_build_object('is_active', p_is_active));
  
  RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
END;
$$;

-- 6) FIX RLS POLICIES: SELECT org-scoped, WRITE requires RPC context
-- -----------------------------------------------------------------------------

-- Drop existing policies first
DROP POLICY IF EXISTS invoices_select_org ON invoices;
DROP POLICY IF EXISTS invoices_insert_rpc ON invoices;
DROP POLICY IF EXISTS invoices_update_rpc ON invoices;
DROP POLICY IF EXISTS invoices_delete_rpc ON invoices;

DROP POLICY IF EXISTS invoice_lines_select_org ON invoice_lines;
DROP POLICY IF EXISTS invoice_lines_insert_rpc ON invoice_lines;
DROP POLICY IF EXISTS invoice_lines_update_rpc ON invoice_lines;
DROP POLICY IF EXISTS invoice_lines_delete_rpc ON invoice_lines;

DROP POLICY IF EXISTS bills_select_org ON bills;
DROP POLICY IF EXISTS bills_insert_rpc ON bills;
DROP POLICY IF EXISTS bills_update_rpc ON bills;
DROP POLICY IF EXISTS bills_delete_rpc ON bills;

DROP POLICY IF EXISTS bill_lines_select_org ON bill_lines;
DROP POLICY IF EXISTS bill_lines_insert_rpc ON bill_lines;
DROP POLICY IF EXISTS bill_lines_update_rpc ON bill_lines;
DROP POLICY IF EXISTS bill_lines_delete_rpc ON bill_lines;

DROP POLICY IF EXISTS customers_select_org ON customers;
DROP POLICY IF EXISTS customers_insert_rpc ON customers;
DROP POLICY IF EXISTS customers_update_rpc ON customers;
DROP POLICY IF EXISTS customers_delete_rpc ON customers;

DROP POLICY IF EXISTS email_queue_select_org ON email_queue;
DROP POLICY IF EXISTS email_queue_insert_rpc ON email_queue;
DROP POLICY IF EXISTS email_queue_update_rpc ON email_queue;
DROP POLICY IF EXISTS email_queue_delete_rpc ON email_queue;

DROP POLICY IF EXISTS automation_rules_select_org ON automation_rules;
DROP POLICY IF EXISTS automation_rules_insert_rpc ON automation_rules;
DROP POLICY IF EXISTS automation_rules_update_rpc ON automation_rules;
DROP POLICY IF EXISTS automation_rules_delete_rpc ON automation_rules;

-- INVOICES
CREATE POLICY invoices_select_org ON invoices FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY invoices_insert_rpc ON invoices FOR INSERT
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY invoices_update_rpc ON invoices FOR UPDATE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY invoices_delete_rpc ON invoices FOR DELETE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

-- INVOICE_LINES
CREATE POLICY invoice_lines_select_org ON invoice_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND public.user_in_organization(auth.uid(), i.organization_id)));

CREATE POLICY invoice_lines_insert_rpc ON invoice_lines FOR INSERT
  WITH CHECK (public.is_rpc_context());

CREATE POLICY invoice_lines_update_rpc ON invoice_lines FOR UPDATE
  USING (public.is_rpc_context()) WITH CHECK (public.is_rpc_context());

CREATE POLICY invoice_lines_delete_rpc ON invoice_lines FOR DELETE
  USING (public.is_rpc_context());

-- BILLS
CREATE POLICY bills_select_org ON bills FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY bills_insert_rpc ON bills FOR INSERT
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY bills_update_rpc ON bills FOR UPDATE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY bills_delete_rpc ON bills FOR DELETE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

-- BILL_LINES
CREATE POLICY bill_lines_select_org ON bill_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND public.user_in_organization(auth.uid(), b.organization_id)));

CREATE POLICY bill_lines_insert_rpc ON bill_lines FOR INSERT
  WITH CHECK (public.is_rpc_context());

CREATE POLICY bill_lines_update_rpc ON bill_lines FOR UPDATE
  USING (public.is_rpc_context()) WITH CHECK (public.is_rpc_context());

CREATE POLICY bill_lines_delete_rpc ON bill_lines FOR DELETE
  USING (public.is_rpc_context());

-- CUSTOMERS
CREATE POLICY customers_select_org ON customers FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY customers_insert_rpc ON customers FOR INSERT
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY customers_update_rpc ON customers FOR UPDATE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY customers_delete_rpc ON customers FOR DELETE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

-- EMAIL_QUEUE
CREATE POLICY email_queue_select_org ON email_queue FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY email_queue_insert_rpc ON email_queue FOR INSERT
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY email_queue_update_rpc ON email_queue FOR UPDATE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY email_queue_delete_rpc ON email_queue FOR DELETE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

-- AUTOMATION_RULES
CREATE POLICY automation_rules_select_org ON automation_rules FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY automation_rules_insert_rpc ON automation_rules FOR INSERT
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY automation_rules_update_rpc ON automation_rules FOR UPDATE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id))
  WITH CHECK (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY automation_rules_delete_rpc ON automation_rules FOR DELETE
  USING (public.is_rpc_context() AND public.user_in_organization(auth.uid(), organization_id));
