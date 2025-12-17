
-- ============================================
-- Phase 11 Comprehensive Safe RPCs
-- ============================================

-- ============================================
-- INVOICE SAFE RPCs
-- ============================================

-- Create invoice draft
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(
  p_organization_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_invoice_type TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'GBP',
  p_customer_id UUID DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'
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
  v_line_number INT := 1;
  v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0;
  v_total_gross NUMERIC := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check org membership
  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Insert invoice
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
    is_posted
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_invoice_type,
    p_contact_name,
    p_contact_email,
    p_invoice_number,
    p_reference,
    p_issue_date,
    COALESCE(p_due_date, p_issue_date + INTERVAL '30 days'),
    p_notes,
    p_currency,
    p_customer_id,
    'DRAFT',
    false
  )
  RETURNING id INTO v_invoice_id;

  -- Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO invoice_lines (
      invoice_id,
      line_number,
      description,
      quantity,
      unit_price,
      account_id,
      vat_code_id,
      vat_rate,
      net_amount,
      vat_amount,
      gross_amount
    ) VALUES (
      v_invoice_id,
      v_line_number,
      v_line->>'description',
      COALESCE((v_line->>'quantity')::NUMERIC, 1),
      COALESCE((v_line->>'unit_price')::NUMERIC, 0),
      NULLIF(v_line->>'account_id', '')::UUID,
      NULLIF(v_line->>'vat_code_id', '')::UUID,
      COALESCE((v_line->>'vat_rate')::NUMERIC, 0),
      COALESCE((v_line->>'net_amount')::NUMERIC, 0),
      COALESCE((v_line->>'vat_amount')::NUMERIC, 0),
      COALESCE((v_line->>'gross_amount')::NUMERIC, 0)
    );
    
    v_total_net := v_total_net + COALESCE((v_line->>'net_amount')::NUMERIC, 0);
    v_total_vat := v_total_vat + COALESCE((v_line->>'vat_amount')::NUMERIC, 0);
    v_total_gross := v_total_gross + COALESCE((v_line->>'gross_amount')::NUMERIC, 0);
    v_line_number := v_line_number + 1;
  END LOOP;

  -- Update totals
  UPDATE invoices SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross,
    remaining_balance = v_total_gross
  WHERE id = v_invoice_id;

  -- Audit log
  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'invoice', v_invoice_id, 'created', jsonb_build_object('status', 'DRAFT'));

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$;

-- Update invoice draft
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id UUID,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_issue_date DATE DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_lines JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_invoice RECORD;
  v_line JSONB;
  v_line_number INT := 1;
  v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0;
  v_total_gross NUMERIC := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get invoice and verify status
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft invoices can be edited');
  END IF;

  -- Check org membership
  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Update invoice fields
  UPDATE invoices SET
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    customer_id = COALESCE(p_customer_id, customer_id),
    updated_at = NOW()
  WHERE id = p_invoice_id;

  -- Update lines if provided
  IF p_lines IS NOT NULL THEN
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        account_id, vat_code_id, vat_rate, net_amount, vat_amount, gross_amount
      ) VALUES (
        p_invoice_id,
        v_line_number,
        v_line->>'description',
        COALESCE((v_line->>'quantity')::NUMERIC, 1),
        COALESCE((v_line->>'unit_price')::NUMERIC, 0),
        NULLIF(v_line->>'account_id', '')::UUID,
        NULLIF(v_line->>'vat_code_id', '')::UUID,
        COALESCE((v_line->>'vat_rate')::NUMERIC, 0),
        COALESCE((v_line->>'net_amount')::NUMERIC, 0),
        COALESCE((v_line->>'vat_amount')::NUMERIC, 0),
        COALESCE((v_line->>'gross_amount')::NUMERIC, 0)
      );
      
      v_total_net := v_total_net + COALESCE((v_line->>'net_amount')::NUMERIC, 0);
      v_total_vat := v_total_vat + COALESCE((v_line->>'vat_amount')::NUMERIC, 0);
      v_total_gross := v_total_gross + COALESCE((v_line->>'gross_amount')::NUMERIC, 0);
      v_line_number := v_line_number + 1;
    END LOOP;

    UPDATE invoices SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross,
      remaining_balance = v_total_gross
    WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- ============================================
-- BILL SAFE RPCs  
-- ============================================

-- Create bill draft
CREATE OR REPLACE FUNCTION public.create_bill_draft_safe(
  p_organization_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_supplier_id UUID,
  p_bill_number TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'GBP',
  p_lines JSONB DEFAULT '[]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_bill_id UUID;
  v_line JSONB;
  v_line_number INT := 1;
  v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0;
  v_total_gross NUMERIC := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check org membership
  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Insert bill
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
    is_posted
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_supplier_id,
    p_bill_number,
    p_reference,
    p_issue_date,
    COALESCE(p_due_date, p_issue_date + INTERVAL '30 days'),
    p_notes,
    p_currency,
    'DRAFT',
    false
  )
  RETURNING id INTO v_bill_id;

  -- Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO bill_lines (
      bill_id,
      line_number,
      description,
      quantity,
      unit_price,
      account_id,
      vat_code_id,
      vat_rate,
      net_amount,
      vat_amount,
      gross_amount
    ) VALUES (
      v_bill_id,
      v_line_number,
      v_line->>'description',
      COALESCE((v_line->>'quantity')::NUMERIC, 1),
      COALESCE((v_line->>'unit_price')::NUMERIC, 0),
      NULLIF(v_line->>'account_id', '')::UUID,
      NULLIF(v_line->>'vat_code_id', '')::UUID,
      COALESCE((v_line->>'vat_rate')::NUMERIC, 0),
      COALESCE((v_line->>'net_amount')::NUMERIC, 0),
      COALESCE((v_line->>'vat_amount')::NUMERIC, 0),
      COALESCE((v_line->>'gross_amount')::NUMERIC, 0)
    );
    
    v_total_net := v_total_net + COALESCE((v_line->>'net_amount')::NUMERIC, 0);
    v_total_vat := v_total_vat + COALESCE((v_line->>'vat_amount')::NUMERIC, 0);
    v_total_gross := v_total_gross + COALESCE((v_line->>'gross_amount')::NUMERIC, 0);
    v_line_number := v_line_number + 1;
  END LOOP;

  -- Update totals
  UPDATE bills SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross,
    remaining_balance = v_total_gross
  WHERE id = v_bill_id;

  -- Audit log
  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'bill', v_bill_id, 'created', jsonb_build_object('status', 'DRAFT'));

  RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id);
END;
$$;

-- Update bill draft
CREATE OR REPLACE FUNCTION public.update_bill_draft_safe(
  p_bill_id UUID,
  p_supplier_id UUID DEFAULT NULL,
  p_bill_number TEXT DEFAULT NULL,
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
  v_bill RECORD;
  v_line JSONB;
  v_line_number INT := 1;
  v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0;
  v_total_gross NUMERIC := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get bill and verify status
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF v_bill IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;

  IF v_bill.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft bills can be edited');
  END IF;

  -- Check org membership
  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = v_bill.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Update bill fields
  UPDATE bills SET
    supplier_id = COALESCE(p_supplier_id, supplier_id),
    bill_number = COALESCE(p_bill_number, bill_number),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_bill_id;

  -- Update lines if provided
  IF p_lines IS NOT NULL THEN
    DELETE FROM bill_lines WHERE bill_id = p_bill_id;
    
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO bill_lines (
        bill_id, line_number, description, quantity, unit_price,
        account_id, vat_code_id, vat_rate, net_amount, vat_amount, gross_amount
      ) VALUES (
        p_bill_id,
        v_line_number,
        v_line->>'description',
        COALESCE((v_line->>'quantity')::NUMERIC, 1),
        COALESCE((v_line->>'unit_price')::NUMERIC, 0),
        NULLIF(v_line->>'account_id', '')::UUID,
        NULLIF(v_line->>'vat_code_id', '')::UUID,
        COALESCE((v_line->>'vat_rate')::NUMERIC, 0),
        COALESCE((v_line->>'net_amount')::NUMERIC, 0),
        COALESCE((v_line->>'vat_amount')::NUMERIC, 0),
        COALESCE((v_line->>'gross_amount')::NUMERIC, 0)
      );
      
      v_total_net := v_total_net + COALESCE((v_line->>'net_amount')::NUMERIC, 0);
      v_total_vat := v_total_vat + COALESCE((v_line->>'vat_amount')::NUMERIC, 0);
      v_total_gross := v_total_gross + COALESCE((v_line->>'gross_amount')::NUMERIC, 0);
      v_line_number := v_line_number + 1;
    END LOOP;

    UPDATE bills SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross,
      remaining_balance = v_total_gross
    WHERE id = p_bill_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;

-- ============================================
-- AUTOMATION SAFE RPCs
-- ============================================

-- Create automation rule
CREATE OR REPLACE FUNCTION public.create_automation_rule_safe(
  p_organization_id UUID,
  p_name TEXT,
  p_trigger_type TEXT,
  p_trigger_config JSONB,
  p_action_type TEXT,
  p_action_config JSONB,
  p_is_active BOOLEAN DEFAULT true,
  p_email_mode TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_rule_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check permission
  SELECT role INTO v_user_role FROM organization_users WHERE user_id = v_user_id AND organization_id = p_organization_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager+ role');
  END IF;

  INSERT INTO automation_rules (
    organization_id, name, trigger_type, trigger_config, action_type, action_config, is_active, email_mode
  ) VALUES (
    p_organization_id, p_name, p_trigger_type, p_trigger_config, p_action_type, p_action_config, p_is_active, p_email_mode
  )
  RETURNING id INTO v_rule_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'automation_rule', v_rule_id, 'created', jsonb_build_object('name', p_name, 'trigger_type', p_trigger_type, 'action_type', p_action_type));

  RETURN jsonb_build_object('success', true, 'rule_id', v_rule_id);
END;
$$;

-- Update automation rule
CREATE OR REPLACE FUNCTION public.update_automation_rule_safe(
  p_rule_id UUID,
  p_name TEXT DEFAULT NULL,
  p_trigger_type TEXT DEFAULT NULL,
  p_trigger_config JSONB DEFAULT NULL,
  p_action_type TEXT DEFAULT NULL,
  p_action_config JSONB DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_email_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_rule RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;

  -- Check permission
  SELECT role INTO v_user_role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_rule.organization_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: requires manager+ role');
  END IF;

  UPDATE automation_rules SET
    name = COALESCE(p_name, name),
    trigger_type = COALESCE(p_trigger_type, trigger_type),
    trigger_config = COALESCE(p_trigger_config, trigger_config),
    action_type = COALESCE(p_action_type, action_type),
    action_config = COALESCE(p_action_config, action_config),
    is_active = COALESCE(p_is_active, is_active),
    email_mode = COALESCE(p_email_mode, email_mode),
    updated_at = NOW()
  WHERE id = p_rule_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_rule.organization_id, v_user_id, 'automation_rule', p_rule_id, 'updated', 
    to_jsonb(v_rule), 
    jsonb_build_object('name', COALESCE(p_name, v_rule.name), 'is_active', COALESCE(p_is_active, v_rule.is_active)));

  RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
END;
$$;

-- Toggle automation rule
CREATE OR REPLACE FUNCTION public.toggle_automation_rule_safe(p_rule_id UUID, p_is_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_rule RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;

  SELECT role INTO v_user_role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_rule.organization_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  UPDATE automation_rules SET is_active = p_is_active, updated_at = NOW() WHERE id = p_rule_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (v_rule.organization_id, v_user_id, 'automation_rule', p_rule_id, 'toggled', jsonb_build_object('is_active', p_is_active));

  RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id, 'is_active', p_is_active);
END;
$$;

-- Delete automation rule
CREATE OR REPLACE FUNCTION public.delete_automation_rule_safe(p_rule_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_rule RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF v_rule IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rule not found');
  END IF;

  SELECT role INTO v_user_role FROM organization_users WHERE user_id = v_user_id AND organization_id = v_rule.organization_id;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  DELETE FROM automation_rules WHERE id = p_rule_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state)
  VALUES (v_rule.organization_id, v_user_id, 'automation_rule', p_rule_id, 'deleted', to_jsonb(v_rule));

  RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
END;
$$;

-- ============================================
-- CUSTOMER SAFE RPC
-- ============================================

CREATE OR REPLACE FUNCTION public.create_customer_safe(
  p_organization_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_billing_address JSONB DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL,
  p_vat_number TEXT DEFAULT NULL,
  p_payment_terms_days INT DEFAULT 30,
  p_default_currency TEXT DEFAULT 'GBP',
  p_internal_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_customer_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organization_users WHERE user_id = v_user_id AND organization_id = p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  INSERT INTO customers (
    organization_id,
    client_id,
    company_id,
    name,
    email,
    phone,
    billing_address,
    company_name,
    vat_number,
    payment_terms_days,
    default_currency,
    internal_notes,
    is_active
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_name,
    p_email,
    p_phone,
    p_billing_address,
    p_company_name,
    p_vat_number,
    p_payment_terms_days,
    p_default_currency,
    p_internal_notes,
    true
  )
  RETURNING id INTO v_customer_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'customer', v_customer_id, 'created', jsonb_build_object('name', p_name, 'email', p_email));

  RETURN jsonb_build_object('success', true, 'customer_id', v_customer_id);
END;
$$;

-- ============================================
-- RLS HARDENING FOR INVOICES/BILLS
-- ============================================

-- Harden invoices - allow read but restrict writes
DROP POLICY IF EXISTS "invoices_insert_via_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_update_via_rpc" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_via_rpc" ON invoices;

CREATE POLICY "invoices_insert_via_rpc" ON invoices
  FOR INSERT WITH CHECK (false);

CREATE POLICY "invoices_update_via_rpc" ON invoices
  FOR UPDATE USING (false);

CREATE POLICY "invoices_delete_via_rpc" ON invoices
  FOR DELETE USING (false);

-- Harden invoice_lines
DROP POLICY IF EXISTS "invoice_lines_insert_via_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_via_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_via_rpc" ON invoice_lines;

CREATE POLICY "invoice_lines_insert_via_rpc" ON invoice_lines
  FOR INSERT WITH CHECK (false);

CREATE POLICY "invoice_lines_update_via_rpc" ON invoice_lines
  FOR UPDATE USING (false);

CREATE POLICY "invoice_lines_delete_via_rpc" ON invoice_lines
  FOR DELETE USING (false);

-- Harden bills
DROP POLICY IF EXISTS "bills_insert_via_rpc" ON bills;
DROP POLICY IF EXISTS "bills_update_via_rpc" ON bills;
DROP POLICY IF EXISTS "bills_delete_via_rpc" ON bills;

CREATE POLICY "bills_insert_via_rpc" ON bills
  FOR INSERT WITH CHECK (false);

CREATE POLICY "bills_update_via_rpc" ON bills
  FOR UPDATE USING (false);

CREATE POLICY "bills_delete_via_rpc" ON bills
  FOR DELETE USING (false);

-- Harden bill_lines
DROP POLICY IF EXISTS "bill_lines_insert_via_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_via_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_via_rpc" ON bill_lines;

CREATE POLICY "bill_lines_insert_via_rpc" ON bill_lines
  FOR INSERT WITH CHECK (false);

CREATE POLICY "bill_lines_update_via_rpc" ON bill_lines
  FOR UPDATE USING (false);

CREATE POLICY "bill_lines_delete_via_rpc" ON bill_lines
  FOR DELETE USING (false);

-- Harden automation_rules
DROP POLICY IF EXISTS "automation_rules_insert_via_rpc" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_update_via_rpc" ON automation_rules;
DROP POLICY IF EXISTS "automation_rules_delete_via_rpc" ON automation_rules;

CREATE POLICY "automation_rules_insert_via_rpc" ON automation_rules
  FOR INSERT WITH CHECK (false);

CREATE POLICY "automation_rules_update_via_rpc" ON automation_rules
  FOR UPDATE USING (false);

CREATE POLICY "automation_rules_delete_via_rpc" ON automation_rules
  FOR DELETE USING (false);

-- Harden email_queue
DROP POLICY IF EXISTS "email_queue_insert_via_rpc" ON email_queue;
DROP POLICY IF EXISTS "email_queue_update_via_rpc" ON email_queue;

CREATE POLICY "email_queue_insert_via_rpc" ON email_queue
  FOR INSERT WITH CHECK (false);

CREATE POLICY "email_queue_update_via_rpc" ON email_queue
  FOR UPDATE USING (false);

-- Harden customers (allow read, restrict writes)
DROP POLICY IF EXISTS "customers_insert_via_rpc" ON customers;
CREATE POLICY "customers_insert_via_rpc" ON customers
  FOR INSERT WITH CHECK (false);
