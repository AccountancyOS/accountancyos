-- =============================================
-- CORRECTIVE MIGRATION: Drop ALL overloads, create canonical once
-- =============================================

-- 1) DROP ALL OVERLOADS by exact identity_args

-- create_invoice_draft_safe overloads
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_invoice_type text, p_contact_name text, p_contact_email text, p_invoice_number text, p_reference text, p_issue_date date, p_due_date date, p_notes text, p_currency text, p_customer_id uuid, p_lines jsonb);
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_invoice_type text, p_customer_id uuid, p_contact_name text, p_invoice_number text, p_reference text, p_issue_date date, p_due_date date, p_notes text, p_currency text, p_lines jsonb);

-- queue_email_safe overloads
DROP FUNCTION IF EXISTS public.queue_email_safe(p_organization_id uuid, p_to_email text, p_to_name text, p_subject text, p_body_html text, p_template_id uuid, p_merge_data jsonb, p_scheduled_at timestamp with time zone, p_entity_type text, p_entity_id uuid);
DROP FUNCTION IF EXISTS public.queue_email_safe(p_organization_id uuid, p_to_email text, p_subject text, p_body_html text, p_template_id uuid, p_merge_data jsonb, p_scheduled_at timestamp with time zone, p_entity_type text, p_entity_id uuid);

-- update_invoice_draft_safe overloads
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(p_invoice_id uuid, p_contact_name text, p_contact_email text, p_reference text, p_issue_date date, p_due_date date, p_notes text, p_customer_id uuid, p_lines jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid, p_contact_name text, p_reference text, p_issue_date date, p_due_date date, p_notes text, p_lines jsonb);

-- create_bill_draft_safe (single but drop to be safe)
DROP FUNCTION IF EXISTS public.create_bill_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_supplier_id uuid, p_bill_number text, p_reference text, p_issue_date date, p_due_date date, p_notes text, p_currency text, p_lines jsonb);

-- update_bill_draft_safe
DROP FUNCTION IF EXISTS public.update_bill_draft_safe(p_bill_id uuid, p_supplier_id uuid, p_bill_number text, p_reference text, p_issue_date date, p_due_date date, p_notes text, p_lines jsonb);

-- issue_invoice_safe
DROP FUNCTION IF EXISTS public.issue_invoice_safe(p_invoice_id uuid);

-- record_invoice_payment_safe
DROP FUNCTION IF EXISTS public.record_invoice_payment_safe(p_invoice_id uuid, p_amount numeric, p_payment_date date, p_bank_account_id uuid, p_payment_method text, p_reference text);

-- 2) Helper: safe numeric parser
CREATE OR REPLACE FUNCTION public.try_parse_numeric(val text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF val IS NULL OR val = '' THEN
    RETURN NULL;
  END IF;
  RETURN val::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 3) CANONICAL: create_invoice_draft_safe
CREATE FUNCTION public.create_invoice_draft_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_invoice_type text DEFAULT 'SALES',
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date date DEFAULT CURRENT_DATE,
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
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized for this organization');
  END IF;
  
  IF p_entity_type NOT IN ('client', 'company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entity_type');
  END IF;

  -- Validate lines with safe parsing (no exceptions)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_quantity := public.try_parse_numeric(v_line->>'quantity');
    v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
    
    IF v_quantity IS NULL OR v_unit_price IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid line: missing or invalid quantity/unit_price');
    END IF;
  END LOOP;

  -- Create invoice
  INSERT INTO invoices (
    organization_id, client_id, company_id, invoice_type, customer_id,
    contact_name, invoice_number, reference, issue_date, due_date, notes, currency, status
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_invoice_type, p_customer_id, p_contact_name, p_invoice_number, p_reference,
    p_issue_date, COALESCE(p_due_date, p_issue_date + 30), p_notes, p_currency, 'DRAFT'
  ) RETURNING id INTO v_invoice_id;

  -- Insert lines with server-calculated amounts
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_quantity := public.try_parse_numeric(v_line->>'quantity');
    v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
    v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);
    
    v_net := ROUND(v_quantity * v_unit_price, 2);
    v_vat := ROUND(v_net * v_vat_rate / 100, 2);
    v_gross := v_net + v_vat;
    
    v_total_net := v_total_net + v_net;
    v_total_vat := v_total_vat + v_vat;
    v_total_gross := v_total_gross + v_gross;
    
    INSERT INTO invoice_lines (
      invoice_id, line_number, description, quantity, unit_price,
      vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
    ) VALUES (
      v_invoice_id, v_line_number, v_line->>'description',
      v_quantity, v_unit_price, v_vat_rate, v_net, v_vat, v_gross,
      NULLIF(v_line->>'account_id', '')::uuid,
      NULLIF(v_line->>'vat_code_id', '')::uuid
    );
  END LOOP;

  UPDATE invoices SET total_net = v_total_net, total_vat = v_total_vat, total_gross = v_total_gross
  WHERE id = v_invoice_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'invoice', v_invoice_id, 'created',
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross));

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$;

-- 4) CANONICAL: update_invoice_draft_safe
CREATE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
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
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
  v_before_state jsonb;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be updated');
  END IF;

  v_before_state := jsonb_build_object('total_gross', v_invoice.total_gross, 'status', v_invoice.status);

  -- Validate lines with safe parsing
  IF p_lines IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      IF v_quantity IS NULL OR v_unit_price IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid line data');
      END IF;
    END LOOP;
  END IF;

  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    contact_name = COALESCE(p_contact_name, contact_name),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_invoice_id;

  IF p_lines IS NOT NULL THEN
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);
      
      v_net := ROUND(v_quantity * v_unit_price, 2);
      v_vat := ROUND(v_net * v_vat_rate / 100, 2);
      v_gross := v_net + v_vat;
      
      v_total_net := v_total_net + v_net;
      v_total_vat := v_total_vat + v_vat;
      v_total_gross := v_total_gross + v_gross;
      
      INSERT INTO invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
      ) VALUES (
        p_invoice_id, v_line_number, v_line->>'description',
        v_quantity, v_unit_price, v_vat_rate, v_net, v_vat, v_gross,
        NULLIF(v_line->>'account_id', '')::uuid,
        NULLIF(v_line->>'vat_code_id', '')::uuid
      );
    END LOOP;

    UPDATE invoices SET total_net = v_total_net, total_vat = v_total_vat, total_gross = v_total_gross
    WHERE id = p_invoice_id;
  END IF;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_invoice.organization_id, v_user_id, 'invoice', p_invoice_id, 'updated', v_before_state,
    jsonb_build_object('total_gross', v_total_gross));

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- 5) CANONICAL: queue_email_safe (with p_to_name)
CREATE FUNCTION public.queue_email_safe(
  p_organization_id uuid,
  p_to_email text,
  p_to_name text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_body_html text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_merge_data jsonb DEFAULT '{}'::jsonb,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email_id uuid;
  v_status text;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Draft if no scheduled_at, queued otherwise
  v_status := CASE WHEN p_scheduled_at IS NULL THEN 'draft' ELSE 'queued' END;

  INSERT INTO email_queue (
    organization_id, to_email, to_name, subject, body_html, template_id,
    merge_data, scheduled_at, status, entity_type, entity_id, created_by
  ) VALUES (
    p_organization_id, p_to_email, p_to_name, p_subject, p_body_html, p_template_id,
    p_merge_data, p_scheduled_at, v_status, p_entity_type, p_entity_id, v_user_id
  ) RETURNING id INTO v_email_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'email', v_email_id, 'queued',
    jsonb_build_object('status', v_status, 'to_email', p_to_email));

  RETURN jsonb_build_object('success', true, 'email_id', v_email_id, 'status', v_status);
END;
$$;

-- 6) CANONICAL: create_bill_draft_safe
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
)
RETURNS jsonb
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
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF p_entity_type NOT IN ('client', 'company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entity_type');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_quantity := public.try_parse_numeric(v_line->>'quantity');
    v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
    IF v_quantity IS NULL OR v_unit_price IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid line data');
    END IF;
  END LOOP;

  INSERT INTO bills (
    organization_id, client_id, company_id, supplier_id, bill_number,
    reference, issue_date, due_date, notes, currency, status
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_supplier_id, p_bill_number, p_reference, p_issue_date,
    COALESCE(p_due_date, p_issue_date + 30), p_notes, p_currency, 'DRAFT'
  ) RETURNING id INTO v_bill_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_quantity := public.try_parse_numeric(v_line->>'quantity');
    v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
    v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);
    
    v_net := ROUND(v_quantity * v_unit_price, 2);
    v_vat := ROUND(v_net * v_vat_rate / 100, 2);
    v_gross := v_net + v_vat;
    
    v_total_net := v_total_net + v_net;
    v_total_vat := v_total_vat + v_vat;
    v_total_gross := v_total_gross + v_gross;
    
    INSERT INTO bill_lines (
      bill_id, line_number, description, quantity, unit_price,
      vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
    ) VALUES (
      v_bill_id, v_line_number, v_line->>'description',
      v_quantity, v_unit_price, v_vat_rate, v_net, v_vat, v_gross,
      NULLIF(v_line->>'account_id', '')::uuid,
      NULLIF(v_line->>'vat_code_id', '')::uuid
    );
  END LOOP;

  UPDATE bills SET total_net = v_total_net, total_vat = v_total_vat, total_gross = v_total_gross
  WHERE id = v_bill_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'bill', v_bill_id, 'created',
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross));

  RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id);
END;
$$;

-- 7) CANONICAL: update_bill_draft_safe
CREATE FUNCTION public.update_bill_draft_safe(
  p_bill_id uuid,
  p_supplier_id uuid DEFAULT NULL,
  p_bill_number text DEFAULT NULL,
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
  v_bill record;
  v_line jsonb;
  v_line_number int := 0;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_bill.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF v_bill.status NOT IN ('DRAFT', 'draft') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT bills can be updated');
  END IF;

  IF p_lines IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      IF v_quantity IS NULL OR v_unit_price IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid line data');
      END IF;
    END LOOP;
  END IF;

  UPDATE bills SET
    supplier_id = COALESCE(p_supplier_id, supplier_id),
    bill_number = COALESCE(p_bill_number, bill_number),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_bill_id;

  IF p_lines IS NOT NULL THEN
    DELETE FROM bill_lines WHERE bill_id = p_bill_id;
    
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);
      
      v_net := ROUND(v_quantity * v_unit_price, 2);
      v_vat := ROUND(v_net * v_vat_rate / 100, 2);
      v_gross := v_net + v_vat;
      
      v_total_net := v_total_net + v_net;
      v_total_vat := v_total_vat + v_vat;
      v_total_gross := v_total_gross + v_gross;
      
      INSERT INTO bill_lines (
        bill_id, line_number, description, quantity, unit_price,
        vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
      ) VALUES (
        p_bill_id, v_line_number, v_line->>'description',
        v_quantity, v_unit_price, v_vat_rate, v_net, v_vat, v_gross,
        NULLIF(v_line->>'account_id', '')::uuid,
        NULLIF(v_line->>'vat_code_id', '')::uuid
      );
    END LOOP;

    UPDATE bills SET total_net = v_total_net, total_vat = v_total_vat, total_gross = v_total_gross
    WHERE id = p_bill_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$$;

-- 8) CANONICAL: issue_invoice_safe
CREATE FUNCTION public.issue_invoice_safe(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_org_settings record;
  v_invoice_number text;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF NOT public.can_issue_invoices(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot issue invoices');
  END IF;
  
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be issued');
  END IF;

  -- Generate invoice number atomically
  SELECT * INTO v_org_settings FROM org_settings WHERE organization_id = v_invoice.organization_id FOR UPDATE;
  
  IF v_org_settings IS NULL THEN
    INSERT INTO org_settings (organization_id) VALUES (v_invoice.organization_id)
    RETURNING * INTO v_org_settings;
  END IF;
  
  v_invoice_number := COALESCE(v_org_settings.invoice_number_prefix, 'INV-') || 
    LPAD(COALESCE(v_org_settings.invoice_number_next, 1)::text, COALESCE(v_org_settings.invoice_number_padding, 6), '0');
  
  UPDATE org_settings SET invoice_number_next = COALESCE(invoice_number_next, 1) + 1
  WHERE organization_id = v_invoice.organization_id;

  UPDATE invoices SET
    status = 'ISSUED',
    invoice_number = v_invoice_number,
    issued_at = now(),
    issued_by = v_user_id,
    locked_fields = '["total_net","total_vat","total_gross","lines"]'::jsonb,
    updated_at = now()
  WHERE id = p_invoice_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_invoice.organization_id, v_user_id, 'invoice', p_invoice_id, 'issued',
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'ISSUED', 'invoice_number', v_invoice_number));

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;

-- 9) CANONICAL: record_invoice_payment_safe
CREATE FUNCTION public.record_invoice_payment_safe(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_bank_account_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL
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
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF v_invoice.status NOT IN ('ISSUED', 'AWAITING_PAYMENT', 'PART_PAID') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot record payment for this invoice status');
  END IF;

  INSERT INTO invoice_payments (invoice_id, amount, payment_date, bank_account_id, payment_method, reference, created_by)
  VALUES (p_invoice_id, p_amount, p_payment_date, p_bank_account_id, p_payment_method, p_reference, v_user_id)
  RETURNING id INTO v_payment_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (v_invoice.organization_id, v_user_id, 'invoice_payment', v_payment_id, 'created',
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount));

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;

-- 10) GUARD: Verify no duplicates remain
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT p.proname, COUNT(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('queue_email_safe','create_invoice_draft_safe','update_invoice_draft_safe','create_bill_draft_safe','update_bill_draft_safe','issue_invoice_safe','record_invoice_payment_safe')
    GROUP BY p.proname
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % functions still have duplicate overloads', v_count;
  END IF;
END;
$$;