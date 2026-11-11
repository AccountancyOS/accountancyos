-- ============================================================
-- GOLD STANDARD CORRECTIVE MIGRATION
-- 1. Add p_contact_email to invoice RPCs
-- 2. Clean up ALL legacy RLS policies
-- 3. Add guards to verify correctness
-- ============================================================

-- ===========================================
-- PART 1: DROP AND RECREATE INVOICE RPCS WITH p_contact_email
-- ===========================================

-- Drop existing functions (single signatures confirmed)
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(uuid, text, uuid, text, uuid, text, text, text, date, date, text, text, jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, uuid, text, text, date, date, text, jsonb);

-- Recreate create_invoice_draft_safe WITH p_contact_email
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_invoice_type text DEFAULT 'SALES',
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency text DEFAULT 'GBP',
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice_id uuid;
  v_line jsonb;
  v_line_number int := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net_amount numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_client_id uuid := NULL;
  v_company_id uuid := NULL;
BEGIN
  -- Set RPC context for RLS
  PERFORM set_config('app.rpc', '1', true);
  
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Verify organization membership
  IF NOT user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  -- Validate entity_type
  IF p_entity_type NOT IN ('client', 'company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entity_type');
  END IF;
  
  -- Set entity IDs
  IF p_entity_type = 'client' THEN
    v_client_id := p_entity_id;
  ELSE
    v_company_id := p_entity_id;
  END IF;
  
  -- Create invoice
  INSERT INTO invoices (
    organization_id,
    client_id,
    company_id,
    customer_id,
    invoice_type,
    status,
    contact_name,
    contact_email,
    invoice_number,
    reference,
    issue_date,
    due_date,
    notes,
    currency,
    total_net,
    total_vat,
    total_gross,
    amount_paid,
    remaining_balance
  ) VALUES (
    p_organization_id,
    v_client_id,
    v_company_id,
    p_customer_id,
    COALESCE(p_invoice_type, 'SALES'),
    'DRAFT',
    p_contact_name,
    p_contact_email,
    p_invoice_number,
    p_reference,
    COALESCE(p_issue_date, CURRENT_DATE),
    COALESCE(p_due_date, CURRENT_DATE + 30),
    p_notes,
    COALESCE(p_currency, 'GBP'),
    0, 0, 0, 0, 0
  )
  RETURNING id INTO v_invoice_id;
  
  -- Process lines and calculate totals
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    
    -- Safe numeric parsing
    v_quantity := COALESCE(try_parse_numeric(v_line->>'quantity'), 0);
    v_unit_price := COALESCE(try_parse_numeric(v_line->>'unit_price'), 0);
    v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);
    
    -- Server calculates amounts
    v_net_amount := v_quantity * v_unit_price;
    v_vat_amount := v_net_amount * (v_vat_rate / 100);
    v_gross_amount := v_net_amount + v_vat_amount;
    
    -- Insert line
    INSERT INTO invoice_lines (
      invoice_id,
      line_number,
      description,
      quantity,
      unit_price,
      vat_rate,
      vat_code_id,
      account_id,
      net_amount,
      vat_amount,
      gross_amount
    ) VALUES (
      v_invoice_id,
      v_line_number,
      COALESCE(v_line->>'description', ''),
      v_quantity,
      v_unit_price,
      v_vat_rate,
      NULLIF(v_line->>'vat_code_id', '')::uuid,
      NULLIF(v_line->>'account_id', '')::uuid,
      v_net_amount,
      v_vat_amount,
      v_gross_amount
    );
    
    v_total_net := v_total_net + v_net_amount;
    v_total_vat := v_total_vat + v_vat_amount;
    v_total_gross := v_total_gross + v_gross_amount;
  END LOOP;
  
  -- Update invoice totals
  UPDATE invoices SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross,
    remaining_balance = v_total_gross
  WHERE id = v_invoice_id;
  
  -- Audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (p_organization_id, 'invoice', v_invoice_id, 'created', v_user_id,
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross, 'contact_email', p_contact_email));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$;

-- Recreate update_invoice_draft_safe WITH p_contact_email
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_line jsonb;
  v_line_number int := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net_amount numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_before_state jsonb;
BEGIN
  -- Set RPC context for RLS
  PERFORM set_config('app.rpc', '1', true);
  
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get invoice and verify access
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  
  -- Only DRAFT invoices can be edited
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be edited');
  END IF;
  
  -- Capture before state
  v_before_state := jsonb_build_object(
    'contact_name', v_invoice.contact_name,
    'contact_email', v_invoice.contact_email,
    'total_gross', v_invoice.total_gross
  );
  
  -- Update invoice fields
  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- Process lines if provided
  IF p_lines IS NOT NULL THEN
    -- Delete existing lines
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    -- Insert new lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      -- Safe numeric parsing
      v_quantity := COALESCE(try_parse_numeric(v_line->>'quantity'), 0);
      v_unit_price := COALESCE(try_parse_numeric(v_line->>'unit_price'), 0);
      v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);
      
      -- Server calculates amounts
      v_net_amount := v_quantity * v_unit_price;
      v_vat_amount := v_net_amount * (v_vat_rate / 100);
      v_gross_amount := v_net_amount + v_vat_amount;
      
      INSERT INTO invoice_lines (
        invoice_id,
        line_number,
        description,
        quantity,
        unit_price,
        vat_rate,
        vat_code_id,
        account_id,
        net_amount,
        vat_amount,
        gross_amount
      ) VALUES (
        p_invoice_id,
        v_line_number,
        COALESCE(v_line->>'description', ''),
        v_quantity,
        v_unit_price,
        v_vat_rate,
        NULLIF(v_line->>'vat_code_id', '')::uuid,
        NULLIF(v_line->>'account_id', '')::uuid,
        v_net_amount,
        v_vat_amount,
        v_gross_amount
      );
      
      v_total_net := v_total_net + v_net_amount;
      v_total_vat := v_total_vat + v_vat_amount;
      v_total_gross := v_total_gross + v_gross_amount;
    END LOOP;
    
    -- Update invoice totals
    UPDATE invoices SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross,
      remaining_balance = v_total_gross - COALESCE(amount_paid, 0)
    WHERE id = p_invoice_id;
  END IF;
  
  -- Audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, before_state, after_state)
  VALUES (v_invoice.organization_id, 'invoice', p_invoice_id, 'updated', v_user_id,
    v_before_state,
    jsonb_build_object('contact_name', p_contact_name, 'contact_email', p_contact_email, 'total_gross', v_total_gross));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- ===========================================
-- PART 2: RLS POLICY CLEANUP
-- ===========================================

-- ============ INVOICES ============
DROP POLICY IF EXISTS "Users can manage invoices in their organization" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_rpc_only" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_rpc_only" ON invoices;
DROP POLICY IF EXISTS "invoices_select_org" ON invoices;
DROP POLICY IF EXISTS "invoices_update_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_update_rpc_only" ON invoices;

-- Create canonical invoices policies
CREATE POLICY "invoices_select_org" ON invoices
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "invoices_insert_rpc" ON invoices
  FOR INSERT WITH CHECK (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

CREATE POLICY "invoices_update_rpc" ON invoices
  FOR UPDATE USING (is_rpc_context() AND user_in_organization(auth.uid(), organization_id))
  WITH CHECK (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

CREATE POLICY "invoices_delete_rpc" ON invoices
  FOR DELETE USING (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

-- ============ INVOICE_LINES ============
DROP POLICY IF EXISTS "View invoice lines" ON invoice_lines;
DROP POLICY IF EXISTS "Users can view invoice lines in their organization" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_rpc_org" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_insert_rpc_org" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_select_org" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_rpc_org" ON invoice_lines;

-- Create canonical invoice_lines policies (via parent invoice)
CREATE POLICY "invoice_lines_select_org" ON invoice_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

CREATE POLICY "invoice_lines_insert_rpc_org" ON invoice_lines
  FOR INSERT WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

CREATE POLICY "invoice_lines_update_rpc_org" ON invoice_lines
  FOR UPDATE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  ) WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

CREATE POLICY "invoice_lines_delete_rpc_org" ON invoice_lines
  FOR DELETE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

-- ============ INVOICE_PAYMENTS ============
DROP POLICY IF EXISTS "Users can manage invoice payments in their organization" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_delete_rpc" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_insert_rpc" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_select_org" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_update_rpc" ON invoice_payments;

-- Create canonical invoice_payments policies (via parent invoice)
CREATE POLICY "invoice_payments_select_org" ON invoice_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_payments.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

CREATE POLICY "invoice_payments_insert_rpc" ON invoice_payments
  FOR INSERT WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_payments.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

CREATE POLICY "invoice_payments_update_rpc" ON invoice_payments
  FOR UPDATE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_payments.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  ) WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_payments.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

CREATE POLICY "invoice_payments_delete_rpc" ON invoice_payments
  FOR DELETE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_payments.invoice_id AND user_in_organization(auth.uid(), i.organization_id))
  );

-- ============ EMAIL_QUEUE ============
DROP POLICY IF EXISTS "Users can manage email queue in their organization" ON email_queue;
DROP POLICY IF EXISTS "email_queue_delete_rpc" ON email_queue;
DROP POLICY IF EXISTS "email_queue_insert_rpc" ON email_queue;
DROP POLICY IF EXISTS "email_queue_select_org" ON email_queue;
DROP POLICY IF EXISTS "email_queue_update_rpc" ON email_queue;

-- Create canonical email_queue policies
CREATE POLICY "email_queue_select_org" ON email_queue
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "email_queue_insert_rpc" ON email_queue
  FOR INSERT WITH CHECK (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

CREATE POLICY "email_queue_update_rpc" ON email_queue
  FOR UPDATE USING (is_rpc_context() AND user_in_organization(auth.uid(), organization_id))
  WITH CHECK (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

CREATE POLICY "email_queue_delete_rpc" ON email_queue
  FOR DELETE USING (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

-- ============ BILLS ============
DROP POLICY IF EXISTS "Users can manage bills in their organization" ON bills;
DROP POLICY IF EXISTS "bills_delete_rpc" ON bills;
DROP POLICY IF EXISTS "bills_insert_rpc" ON bills;
DROP POLICY IF EXISTS "bills_select_org" ON bills;
DROP POLICY IF EXISTS "bills_update_rpc" ON bills;

-- Create canonical bills policies
CREATE POLICY "bills_select_org" ON bills
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "bills_insert_rpc" ON bills
  FOR INSERT WITH CHECK (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

CREATE POLICY "bills_update_rpc" ON bills
  FOR UPDATE USING (is_rpc_context() AND user_in_organization(auth.uid(), organization_id))
  WITH CHECK (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

CREATE POLICY "bills_delete_rpc" ON bills
  FOR DELETE USING (is_rpc_context() AND user_in_organization(auth.uid(), organization_id));

-- ============ BILL_LINES ============
DROP POLICY IF EXISTS "Users can view bill lines in their organization" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_rpc_org" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_insert_rpc_org" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_insert_via_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_select_org" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_rpc_org" ON bill_lines;

-- Create canonical bill_lines policies (via parent bill)
CREATE POLICY "bill_lines_select_org" ON bill_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

CREATE POLICY "bill_lines_insert_rpc_org" ON bill_lines
  FOR INSERT WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

CREATE POLICY "bill_lines_update_rpc_org" ON bill_lines
  FOR UPDATE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  ) WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

CREATE POLICY "bill_lines_delete_rpc_org" ON bill_lines
  FOR DELETE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

-- ============ BILL_PAYMENTS ============
DROP POLICY IF EXISTS "Users can manage bill payments in their organization" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_delete_rpc" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_insert_rpc" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_select_org" ON bill_payments;
DROP POLICY IF EXISTS "bill_payments_update_rpc" ON bill_payments;

-- Create canonical bill_payments policies (via parent bill)
CREATE POLICY "bill_payments_select_org" ON bill_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

CREATE POLICY "bill_payments_insert_rpc" ON bill_payments
  FOR INSERT WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

CREATE POLICY "bill_payments_update_rpc" ON bill_payments
  FOR UPDATE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  ) WITH CHECK (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

CREATE POLICY "bill_payments_delete_rpc" ON bill_payments
  FOR DELETE USING (
    is_rpc_context() AND EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_in_organization(auth.uid(), b.organization_id))
  );

-- ===========================================
-- PART 3: GUARDS - Verify correctness
-- ===========================================

DO $$
DECLARE
  v_count int;
  v_func_args text;
BEGIN
  -- Guard A: Check create_invoice_draft_safe has p_contact_email
  SELECT pg_get_function_arguments(p.oid) INTO v_func_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe'
  LIMIT 1;
  
  IF v_func_args IS NULL OR v_func_args NOT LIKE '%p_contact_email%' THEN
    RAISE EXCEPTION 'GUARD FAILED: create_invoice_draft_safe missing p_contact_email parameter';
  END IF;
  
  -- Guard B: Check update_invoice_draft_safe has p_contact_email
  SELECT pg_get_function_arguments(p.oid) INTO v_func_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe'
  LIMIT 1;
  
  IF v_func_args IS NULL OR v_func_args NOT LIKE '%p_contact_email%' THEN
    RAISE EXCEPTION 'GUARD FAILED: update_invoice_draft_safe missing p_contact_email parameter';
  END IF;
  
  -- Guard C: Check no duplicate invoice RPC functions
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe';
  
  IF v_count > 1 THEN
    RAISE EXCEPTION 'GUARD FAILED: Multiple overloads of create_invoice_draft_safe exist (%)' , v_count;
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe';
  
  IF v_count > 1 THEN
    RAISE EXCEPTION 'GUARD FAILED: Multiple overloads of update_invoice_draft_safe exist (%)', v_count;
  END IF;

  RAISE NOTICE 'All guards passed successfully';
END;
$$;