-- Drop conflicting functions first
DROP FUNCTION IF EXISTS record_invoice_payment_safe(UUID, NUMERIC, DATE, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS record_bill_payment_safe(UUID, NUMERIC, DATE, UUID, TEXT, TEXT);

-- =====================================================
-- FIX A: Implement app.rpc session flag pattern for RLS bypass
-- =====================================================

-- Helper function to set the RPC context flag
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

-- Helper function to check if we're in an RPC context
CREATE OR REPLACE FUNCTION public.is_rpc_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.rpc', true), '') = '1';
$$;

-- =====================================================
-- Drop existing restrictive policies and recreate with app.rpc check
-- =====================================================

-- INVOICES table
DROP POLICY IF EXISTS "Block direct invoice inserts" ON invoices;
DROP POLICY IF EXISTS "Block direct invoice updates" ON invoices;
DROP POLICY IF EXISTS "Block direct invoice deletes" ON invoices;
DROP POLICY IF EXISTS "invoices_org_select" ON invoices;
DROP POLICY IF EXISTS "invoices_org_insert" ON invoices;
DROP POLICY IF EXISTS "invoices_org_update" ON invoices;
DROP POLICY IF EXISTS "invoices_org_delete" ON invoices;
DROP POLICY IF EXISTS "invoices_select_org" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_rpc_only" ON invoices;
DROP POLICY IF EXISTS "invoices_update_rpc_only" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_rpc_only" ON invoices;

-- Org-scoped SELECT (always allowed for org members)
CREATE POLICY "invoices_select_org" ON invoices
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- RPC-only INSERT
CREATE POLICY "invoices_insert_rpc_only" ON invoices
  FOR INSERT WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- RPC-only UPDATE  
CREATE POLICY "invoices_update_rpc_only" ON invoices
  FOR UPDATE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  ) WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- RPC-only DELETE
CREATE POLICY "invoices_delete_rpc_only" ON invoices
  FOR DELETE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- INVOICE_LINES table
DROP POLICY IF EXISTS "Block direct invoice_lines inserts" ON invoice_lines;
DROP POLICY IF EXISTS "Block direct invoice_lines updates" ON invoice_lines;
DROP POLICY IF EXISTS "Block direct invoice_lines deletes" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_org_select" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_org_insert" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_org_update" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_org_delete" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_select_org" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_insert_rpc_only" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_rpc_only" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_rpc_only" ON invoice_lines;

-- Org-scoped SELECT via invoice join
CREATE POLICY "invoice_lines_select_org" ON invoice_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices i 
      WHERE i.id = invoice_lines.invoice_id 
      AND i.organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
    )
  );

-- RPC-only writes
CREATE POLICY "invoice_lines_insert_rpc_only" ON invoice_lines
  FOR INSERT WITH CHECK (is_rpc_context());

CREATE POLICY "invoice_lines_update_rpc_only" ON invoice_lines
  FOR UPDATE USING (is_rpc_context()) WITH CHECK (is_rpc_context());

CREATE POLICY "invoice_lines_delete_rpc_only" ON invoice_lines
  FOR DELETE USING (is_rpc_context());

-- BILLS table
DROP POLICY IF EXISTS "Block direct bill inserts" ON bills;
DROP POLICY IF EXISTS "Block direct bill updates" ON bills;
DROP POLICY IF EXISTS "Block direct bill deletes" ON bills;
DROP POLICY IF EXISTS "bills_org_select" ON bills;
DROP POLICY IF EXISTS "bills_org_insert" ON bills;
DROP POLICY IF EXISTS "bills_org_update" ON bills;
DROP POLICY IF EXISTS "bills_org_delete" ON bills;
DROP POLICY IF EXISTS "bills_select_org" ON bills;
DROP POLICY IF EXISTS "bills_insert_rpc_only" ON bills;
DROP POLICY IF EXISTS "bills_update_rpc_only" ON bills;
DROP POLICY IF EXISTS "bills_delete_rpc_only" ON bills;

CREATE POLICY "bills_select_org" ON bills
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "bills_insert_rpc_only" ON bills
  FOR INSERT WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "bills_update_rpc_only" ON bills
  FOR UPDATE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  ) WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "bills_delete_rpc_only" ON bills
  FOR DELETE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- BILL_LINES table
DROP POLICY IF EXISTS "Block direct bill_lines inserts" ON bill_lines;
DROP POLICY IF EXISTS "Block direct bill_lines updates" ON bill_lines;
DROP POLICY IF EXISTS "Block direct bill_lines deletes" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_org_select" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_org_insert" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_org_update" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_org_delete" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_select_org" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_insert_rpc_only" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_rpc_only" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_rpc_only" ON bill_lines;

CREATE POLICY "bill_lines_select_org" ON bill_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bills b 
      WHERE b.id = bill_lines.bill_id 
      AND b.organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "bill_lines_insert_rpc_only" ON bill_lines
  FOR INSERT WITH CHECK (is_rpc_context());

CREATE POLICY "bill_lines_update_rpc_only" ON bill_lines
  FOR UPDATE USING (is_rpc_context()) WITH CHECK (is_rpc_context());

CREATE POLICY "bill_lines_delete_rpc_only" ON bill_lines
  FOR DELETE USING (is_rpc_context());

-- CUSTOMERS table
DROP POLICY IF EXISTS "Block direct customer inserts" ON customers;
DROP POLICY IF EXISTS "Block direct customer updates" ON customers;
DROP POLICY IF EXISTS "Block direct customer deletes" ON customers;
DROP POLICY IF EXISTS "customers_org_select" ON customers;
DROP POLICY IF EXISTS "customers_org_insert" ON customers;
DROP POLICY IF EXISTS "customers_org_update" ON customers;
DROP POLICY IF EXISTS "customers_org_delete" ON customers;
DROP POLICY IF EXISTS "customers_select_org" ON customers;
DROP POLICY IF EXISTS "customers_insert_rpc_only" ON customers;
DROP POLICY IF EXISTS "customers_update_rpc_only" ON customers;
DROP POLICY IF EXISTS "customers_delete_rpc_only" ON customers;

CREATE POLICY "customers_select_org" ON customers
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "customers_insert_rpc_only" ON customers
  FOR INSERT WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "customers_update_rpc_only" ON customers
  FOR UPDATE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  ) WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "customers_delete_rpc_only" ON customers
  FOR DELETE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- AUTOMATION_RULES table
DROP POLICY IF EXISTS "Block direct automation_rules inserts" ON automation_rules;
DROP POLICY IF EXISTS "Block direct automation_rules updates" ON automation_rules;
DROP POLICY IF EXISTS "Block direct automation_rules deletes" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_org_select" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_org_insert" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_org_update" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_org_delete" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_select_org" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_insert_rpc_only" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_update_rpc_only" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_delete_rpc_only" ON automation_rules;

CREATE POLICY "automation_rules_select_org" ON automation_rules
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "automation_rules_insert_rpc_only" ON automation_rules
  FOR INSERT WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "automation_rules_update_rpc_only" ON automation_rules
  FOR UPDATE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  ) WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "automation_rules_delete_rpc_only" ON automation_rules
  FOR DELETE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- EMAIL_QUEUE table
DROP POLICY IF EXISTS "Block direct email_queue inserts" ON email_queue;
DROP POLICY IF EXISTS "Block direct email_queue updates" ON email_queue;
DROP POLICY IF EXISTS "Block direct email_queue deletes" ON email_queue;
DROP POLICY IF EXISTS "email_queue_org_select" ON email_queue;
DROP POLICY IF EXISTS "email_queue_org_insert" ON email_queue;
DROP POLICY IF EXISTS "email_queue_org_update" ON email_queue;
DROP POLICY IF EXISTS "email_queue_org_delete" ON email_queue;
DROP POLICY IF EXISTS "email_queue_select_org" ON email_queue;
DROP POLICY IF EXISTS "email_queue_insert_rpc_only" ON email_queue;
DROP POLICY IF EXISTS "email_queue_update_rpc_only" ON email_queue;
DROP POLICY IF EXISTS "email_queue_delete_rpc_only" ON email_queue;

CREATE POLICY "email_queue_select_org" ON email_queue
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "email_queue_insert_rpc_only" ON email_queue
  FOR INSERT WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "email_queue_update_rpc_only" ON email_queue
  FOR UPDATE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  ) WITH CHECK (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

CREATE POLICY "email_queue_delete_rpc_only" ON email_queue
  FOR DELETE USING (
    is_rpc_context() AND
    organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())
  );

-- =====================================================
-- FIX C: Update RPCs to set context flag AND compute totals server-side
-- =====================================================

-- Recreate create_invoice_draft_safe with server-side totals
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(
  p_organization_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_invoice_id UUID;
  v_line JSONB;
  v_line_number INT := 0;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_vat_rate NUMERIC;
  v_net_amount NUMERIC;
  v_vat_amount NUMERIC;
  v_gross_amount NUMERIC;
  v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0;
  v_total_gross NUMERIC := 0;
BEGIN
  -- Set RPC context for RLS bypass
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify org membership
  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this organization');
  END IF;

  -- Create invoice
  INSERT INTO invoices (
    organization_id, client_id, company_id, customer_id, 
    reference, issue_date, due_date, notes, status,
    total_net, total_vat, total_gross
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_customer_id,
    p_reference,
    p_issue_date,
    COALESCE(p_due_date, p_issue_date + 30),
    p_notes,
    'DRAFT',
    0, 0, 0
  ) RETURNING id INTO v_invoice_id;

  -- Insert lines with SERVER-COMPUTED totals
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    
    -- Extract only safe fields from client
    v_quantity := COALESCE((v_line->>'quantity')::NUMERIC, 1);
    v_unit_price := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
    v_vat_rate := COALESCE((v_line->>'vat_rate')::NUMERIC, 0);
    
    -- Validate no negatives (except for credit notes later)
    IF v_quantity < 0 OR v_unit_price < 0 THEN
      -- Rollback by deleting
      DELETE FROM invoices WHERE id = v_invoice_id;
      RETURN jsonb_build_object('success', false, 'error', 'Negative quantities or prices not allowed');
    END IF;
    
    -- SERVER computes amounts
    v_net_amount := ROUND(v_quantity * v_unit_price, 2);
    v_vat_amount := ROUND(v_net_amount * v_vat_rate / 100, 2);
    v_gross_amount := v_net_amount + v_vat_amount;
    
    INSERT INTO invoice_lines (
      invoice_id, line_number, description, quantity, unit_price,
      vat_rate, vat_code_id, account_id,
      net_amount, vat_amount, gross_amount
    ) VALUES (
      v_invoice_id,
      v_line_number,
      v_line->>'description',
      v_quantity,
      v_unit_price,
      v_vat_rate,
      (v_line->>'vat_code_id')::UUID,
      (v_line->>'account_id')::UUID,
      v_net_amount,
      v_vat_amount,
      v_gross_amount
    );
    
    v_total_net := v_total_net + v_net_amount;
    v_total_vat := v_total_vat + v_vat_amount;
    v_total_gross := v_total_gross + v_gross_amount;
  END LOOP;

  -- Update invoice totals from computed values
  UPDATE invoices SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross
  WHERE id = v_invoice_id;

  -- Audit log
  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'invoice', v_invoice_id, 'created', 
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross));

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$;

-- Recreate update_invoice_draft_safe with server-side totals
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_issue_date DATE DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_status TEXT;
  v_line JSONB;
  v_line_number INT := 0;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_vat_rate NUMERIC;
  v_net_amount NUMERIC;
  v_vat_amount NUMERIC;
  v_gross_amount NUMERIC;
  v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0;
  v_total_gross NUMERIC := 0;
  v_before_state JSONB;
BEGIN
  -- Set RPC context for RLS bypass
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get invoice and verify ownership
  SELECT organization_id, status INTO v_org_id, v_status
  FROM invoices WHERE id = p_invoice_id;
  
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only edit DRAFT invoices');
  END IF;

  -- Capture before state
  SELECT jsonb_build_object('customer_id', customer_id, 'reference', reference, 'notes', notes)
  INTO v_before_state FROM invoices WHERE id = p_invoice_id;

  -- Update invoice fields
  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_invoice_id;

  -- If lines provided, replace them (DRAFT only - documented constraint)
  IF p_lines IS NOT NULL THEN
    -- Delete existing lines (acceptable for DRAFT per documented constraint)
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    -- Insert new lines with SERVER-COMPUTED totals
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      v_quantity := COALESCE((v_line->>'quantity')::NUMERIC, 1);
      v_unit_price := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
      v_vat_rate := COALESCE((v_line->>'vat_rate')::NUMERIC, 0);
      
      IF v_quantity < 0 OR v_unit_price < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Negative quantities or prices not allowed');
      END IF;
      
      v_net_amount := ROUND(v_quantity * v_unit_price, 2);
      v_vat_amount := ROUND(v_net_amount * v_vat_rate / 100, 2);
      v_gross_amount := v_net_amount + v_vat_amount;
      
      INSERT INTO invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        vat_rate, vat_code_id, account_id,
        net_amount, vat_amount, gross_amount
      ) VALUES (
        p_invoice_id,
        v_line_number,
        v_line->>'description',
        v_quantity,
        v_unit_price,
        v_vat_rate,
        (v_line->>'vat_code_id')::UUID,
        (v_line->>'account_id')::UUID,
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
      total_gross = v_total_gross
    WHERE id = p_invoice_id;
  END IF;

  -- Audit log
  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_org_id, v_user_id, 'invoice', p_invoice_id, 'updated', v_before_state,
    jsonb_build_object('customer_id', p_customer_id, 'reference', p_reference));

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- Fix record_invoice_payment_safe
CREATE OR REPLACE FUNCTION public.record_invoice_payment_safe(
  p_invoice_id UUID,
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
  v_org_id UUID;
  v_status TEXT;
  v_total_gross NUMERIC;
  v_amount_paid NUMERIC;
  v_payment_id UUID;
  v_new_status TEXT;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT organization_id, status, total_gross, COALESCE(amount_paid, 0)
  INTO v_org_id, v_status, v_total_gross, v_amount_paid
  FROM invoices WHERE id = p_invoice_id;
  
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_status NOT IN ('ISSUED', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only pay ISSUED or PART_PAID invoices');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be positive');
  END IF;

  INSERT INTO invoice_payments (
    invoice_id, amount, payment_date, bank_account_id, payment_method, reference, created_by
  ) VALUES (
    p_invoice_id, p_amount, p_payment_date, p_bank_account_id, p_payment_method, p_reference, v_user_id
  ) RETURNING id INTO v_payment_id;

  v_amount_paid := v_amount_paid + p_amount;
  
  IF v_amount_paid >= v_total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;

  UPDATE invoices SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_invoice_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (v_org_id, v_user_id, 'invoice_payment', v_payment_id, 'recorded', 
    jsonb_build_object('amount', p_amount, 'invoice_status', v_new_status));

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'invoice_status', v_new_status);
END;
$$;

-- Fix record_bill_payment_safe
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
  v_org_id UUID;
  v_status TEXT;
  v_total_gross NUMERIC;
  v_amount_paid NUMERIC;
  v_payment_id UUID;
  v_new_status TEXT;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT organization_id, status, total_gross, COALESCE(amount_paid, 0)
  INTO v_org_id, v_status, v_total_gross, v_amount_paid
  FROM bills WHERE id = p_bill_id;
  
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_status NOT IN ('APPROVED', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only pay APPROVED or PART_PAID bills');
  END IF;

  INSERT INTO bill_payments (
    bill_id, amount, payment_date, bank_account_id, payment_method, reference, created_by
  ) VALUES (
    p_bill_id, p_amount, p_payment_date, p_bank_account_id, p_payment_method, p_reference, v_user_id
  ) RETURNING id INTO v_payment_id;

  v_amount_paid := v_amount_paid + p_amount;
  
  IF v_amount_paid >= v_total_gross THEN
    v_new_status := 'PAID';
  ELSE
    v_new_status := 'PART_PAID';
  END IF;

  UPDATE bills SET
    amount_paid = v_amount_paid,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (v_org_id, v_user_id, 'bill_payment', v_payment_id, 'recorded', 
    jsonb_build_object('amount', p_amount, 'bill_status', v_new_status));

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'bill_status', v_new_status);
END;
$$;

-- Add get_invoice_with_lines_safe RPC (Fix B)
CREATE OR REPLACE FUNCTION public.get_invoice_with_lines_safe(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_invoice JSONB;
  v_lines JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT organization_id INTO v_org_id FROM invoices WHERE id = p_invoice_id;
  
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT to_jsonb(i.*) INTO v_invoice FROM invoices i WHERE i.id = p_invoice_id;
  
  SELECT COALESCE(jsonb_agg(to_jsonb(il.*) ORDER BY il.line_number), '[]'::JSONB)
  INTO v_lines FROM invoice_lines il WHERE il.invoice_id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice', v_invoice, 'lines', v_lines);
END;
$$;