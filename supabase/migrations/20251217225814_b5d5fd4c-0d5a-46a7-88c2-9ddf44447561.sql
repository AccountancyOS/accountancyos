-- =============================================
-- CORRECTIVE MIGRATION: Clean up RLS + delete set_rpc_context()
-- =============================================

-- 1) DROP set_rpc_context() entirely - inline the call in RPCs instead
DROP FUNCTION IF EXISTS public.set_rpc_context() CASCADE;

-- 2) Clean up duplicate/conflicting RLS policies on invoice_lines
DROP POLICY IF EXISTS "invoice_lines_insert_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_insert_rpc_only" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_rpc_only" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_rpc_only" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_insert_via_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_via_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_via_rpc" ON invoice_lines;
DROP POLICY IF EXISTS "Users can manage invoice lines in their organization" ON invoice_lines;
DROP POLICY IF EXISTS "Staff create invoice lines for draft" ON invoice_lines;
DROP POLICY IF EXISTS "Staff update invoice lines for draft" ON invoice_lines;
DROP POLICY IF EXISTS "Staff delete invoice lines for draft" ON invoice_lines;

-- 3) Clean up duplicate/conflicting RLS policies on bill_lines
DROP POLICY IF EXISTS "bill_lines_insert_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_rpc" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_insert_rpc_only" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_rpc_only" ON bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_rpc_only" ON bill_lines;
DROP POLICY IF EXISTS "Users can insert bill lines via bills" ON bill_lines;
DROP POLICY IF EXISTS "Users can update bill lines via bills" ON bill_lines;
DROP POLICY IF EXISTS "Users can delete bill lines via bills" ON bill_lines;

-- 4) Create canonical RLS policies for invoice_lines (RPC-only writes with org check)
CREATE POLICY "invoice_lines_insert_rpc_org" ON invoice_lines
FOR INSERT
WITH CHECK (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_in_organization(auth.uid(), i.organization_id)
  )
);

CREATE POLICY "invoice_lines_update_rpc_org" ON invoice_lines
FOR UPDATE
USING (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_in_organization(auth.uid(), i.organization_id)
  )
)
WITH CHECK (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_in_organization(auth.uid(), i.organization_id)
  )
);

CREATE POLICY "invoice_lines_delete_rpc_org" ON invoice_lines
FOR DELETE
USING (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND public.user_in_organization(auth.uid(), i.organization_id)
  )
);

-- 5) Create canonical RLS policies for bill_lines (RPC-only writes with org check)
CREATE POLICY "bill_lines_insert_rpc_org" ON bill_lines
FOR INSERT
WITH CHECK (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_lines.bill_id
      AND public.user_in_organization(auth.uid(), b.organization_id)
  )
);

CREATE POLICY "bill_lines_update_rpc_org" ON bill_lines
FOR UPDATE
USING (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_lines.bill_id
      AND public.user_in_organization(auth.uid(), b.organization_id)
  )
)
WITH CHECK (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_lines.bill_id
      AND public.user_in_organization(auth.uid(), b.organization_id)
  )
);

CREATE POLICY "bill_lines_delete_rpc_org" ON bill_lines
FOR DELETE
USING (
  public.is_rpc_context()
  AND EXISTS (
    SELECT 1 FROM bills b
    WHERE b.id = bill_lines.bill_id
      AND public.user_in_organization(auth.uid(), b.organization_id)
  )
);

-- 6) Fix org_settings duplicate columns - migrate to canonical names
-- Canonical: invoice_number_prefix, invoice_number_next, invoice_number_padding
-- Delete duplicates: invoice_prefix, next_invoice_number, invoice_padding
UPDATE org_settings SET 
  invoice_number_prefix = COALESCE(invoice_number_prefix, invoice_prefix, 'INV-'),
  invoice_number_next = COALESCE(invoice_number_next, next_invoice_number, 1),
  invoice_number_padding = COALESCE(invoice_number_padding, invoice_padding, 5)
WHERE invoice_prefix IS NOT NULL OR next_invoice_number IS NOT NULL OR invoice_padding IS NOT NULL;

ALTER TABLE org_settings DROP COLUMN IF EXISTS invoice_prefix;
ALTER TABLE org_settings DROP COLUMN IF EXISTS next_invoice_number;
ALTER TABLE org_settings DROP COLUMN IF EXISTS invoice_padding;

-- 7) Recreate safe RPCs with inlined set_config (no set_rpc_context dependency)

-- create_invoice_draft_safe with inline set_config
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(
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
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
BEGIN
  -- Inline RPC context flag
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

  -- Validate lines before any mutation
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF (v_line->>'quantity')::numeric IS NULL OR (v_line->>'unit_price')::numeric IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid line: missing quantity or unit_price');
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
    v_net := ROUND((v_line->>'quantity')::numeric * (v_line->>'unit_price')::numeric, 2);
    v_vat := ROUND(v_net * COALESCE((v_line->>'vat_rate')::numeric, 0) / 100, 2);
    v_gross := v_net + v_vat;
    
    v_total_net := v_total_net + v_net;
    v_total_vat := v_total_vat + v_vat;
    v_total_gross := v_total_gross + v_gross;
    
    INSERT INTO invoice_lines (
      invoice_id, line_number, description, quantity, unit_price,
      vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
    ) VALUES (
      v_invoice_id, v_line_number, v_line->>'description',
      (v_line->>'quantity')::numeric, (v_line->>'unit_price')::numeric,
      COALESCE((v_line->>'vat_rate')::numeric, 0), v_net, v_vat, v_gross,
      NULLIF(v_line->>'account_id', '')::uuid,
      NULLIF(v_line->>'vat_code_id', '')::uuid
    );
  END LOOP;

  -- Update invoice totals
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

-- update_invoice_draft_safe with inline set_config
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
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

  -- Validate lines before mutation
  IF p_lines IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      IF (v_line->>'quantity')::numeric IS NULL OR (v_line->>'unit_price')::numeric IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid line data');
      END IF;
    END LOOP;
  END IF;

  -- Update invoice fields
  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    contact_name = COALESCE(p_contact_name, contact_name),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date, issue_date),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Replace lines if provided
  IF p_lines IS NOT NULL THEN
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      v_net := ROUND((v_line->>'quantity')::numeric * (v_line->>'unit_price')::numeric, 2);
      v_vat := ROUND(v_net * COALESCE((v_line->>'vat_rate')::numeric, 0) / 100, 2);
      v_gross := v_net + v_vat;
      
      v_total_net := v_total_net + v_net;
      v_total_vat := v_total_vat + v_vat;
      v_total_gross := v_total_gross + v_gross;
      
      INSERT INTO invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
      ) VALUES (
        p_invoice_id, v_line_number, v_line->>'description',
        (v_line->>'quantity')::numeric, (v_line->>'unit_price')::numeric,
        COALESCE((v_line->>'vat_rate')::numeric, 0), v_net, v_vat, v_gross,
        NULLIF(v_line->>'account_id', '')::uuid,
        NULLIF(v_line->>'vat_code_id', '')::uuid
      );
    END LOOP;

    UPDATE invoices SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross
    WHERE id = p_invoice_id;
  END IF;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_invoice.organization_id, v_user_id, 'invoice', p_invoice_id, 'updated', v_before_state,
    jsonb_build_object('total_gross', v_total_gross));

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- create_bill_draft_safe with inline set_config
CREATE OR REPLACE FUNCTION public.create_bill_draft_safe(
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
    IF (v_line->>'quantity')::numeric IS NULL OR (v_line->>'unit_price')::numeric IS NULL THEN
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
    v_net := ROUND((v_line->>'quantity')::numeric * (v_line->>'unit_price')::numeric, 2);
    v_vat := ROUND(v_net * COALESCE((v_line->>'vat_rate')::numeric, 0) / 100, 2);
    v_gross := v_net + v_vat;
    
    v_total_net := v_total_net + v_net;
    v_total_vat := v_total_vat + v_vat;
    v_total_gross := v_total_gross + v_gross;
    
    INSERT INTO bill_lines (
      bill_id, line_number, description, quantity, unit_price,
      vat_rate, net_amount, vat_amount, gross_amount, account_id, vat_code_id
    ) VALUES (
      v_bill_id, v_line_number, v_line->>'description',
      (v_line->>'quantity')::numeric, (v_line->>'unit_price')::numeric,
      COALESCE((v_line->>'vat_rate')::numeric, 0), v_net, v_vat, v_gross,
      NULLIF(v_line->>'account_id', '')::uuid,
      NULLIF(v_line->>'vat_code_id', '')::uuid
    );
  END LOOP;

  UPDATE bills SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross
  WHERE id = v_bill_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'bill', v_bill_id, 'created',
    jsonb_build_object('status', 'DRAFT', 'total_gross', v_total_gross));

  RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id);
END;
$$;

-- queue_email_safe with inline set_config and correct draft/queued logic
CREATE OR REPLACE FUNCTION public.queue_email_safe(
  p_organization_id uuid,
  p_to_email text,
  p_subject text,
  p_body_html text,
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
    organization_id, to_email, subject, body_html, template_id,
    merge_data, scheduled_at, status, entity_type, entity_id, created_by
  ) VALUES (
    p_organization_id, p_to_email, p_subject, p_body_html, p_template_id,
    p_merge_data, p_scheduled_at, v_status, p_entity_type, p_entity_id, v_user_id
  ) RETURNING id INTO v_email_id;

  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'email', v_email_id, 'queued',
    jsonb_build_object('status', v_status, 'to_email', p_to_email));

  RETURN jsonb_build_object('success', true, 'email_id', v_email_id, 'status', v_status);
END;
$$;