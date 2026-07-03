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
  IF NOT (public.user_in_organization(v_user_id, p_organization_id)
          OR public.portal_has_perm(
               CASE WHEN p_entity_type = 'client'  THEN p_entity_id END,
               CASE WHEN p_entity_type = 'company' THEN p_entity_id END,
               'allow_invoice_create')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized for this organization');
  END IF;
  IF p_entity_type NOT IN ('client', 'company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid entity_type');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
      WHERE p_entity_type = 'client' AND id = p_entity_id AND organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.companies
      WHERE p_entity_type = 'company' AND id = p_entity_id AND organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entity does not belong to organization');
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_quantity := public.try_parse_numeric(v_line->>'quantity');
    v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
    IF v_quantity IS NULL OR v_unit_price IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid line: missing or invalid quantity/unit_price');
    END IF;
  END LOOP;
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
  IF NOT (public.user_in_organization(v_user_id, v_invoice.organization_id)
          OR public.portal_has_perm(v_invoice.client_id, v_invoice.company_id, 'allow_invoice_create')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be updated');
  END IF;
  v_before_state := jsonb_build_object('total_gross', v_invoice.total_gross, 'status', v_invoice.status);
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

CREATE OR REPLACE FUNCTION public.issue_invoice_safe(p_invoice_id uuid)
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
  v_post jsonb;
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
  IF NOT (
    (public.user_in_organization(v_user_id, v_invoice.organization_id)
      AND public.can_issue_invoices(v_user_id, v_invoice.organization_id))
    OR (
      public.portal_has_perm(v_invoice.client_id, v_invoice.company_id, 'allow_invoice_send')
      AND NOT COALESCE((
        SELECT require_review_for_invoice_sending FROM public.portal_visibility_settings
        WHERE (v_invoice.client_id IS NOT NULL AND client_id = v_invoice.client_id)
           OR (v_invoice.company_id IS NOT NULL AND company_id = v_invoice.company_id)
        LIMIT 1), false)
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot issue invoices');
  END IF;
  IF v_invoice.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only DRAFT invoices can be issued');
  END IF;
  IF v_invoice.invoice_number IS NULL OR v_invoice.invoice_number = '' THEN
    SELECT * INTO v_org_settings FROM org_settings WHERE organization_id = v_invoice.organization_id FOR UPDATE;
    IF v_org_settings IS NULL THEN
      INSERT INTO org_settings (organization_id) VALUES (v_invoice.organization_id)
      RETURNING * INTO v_org_settings;
    END IF;
    v_invoice_number := COALESCE(v_org_settings.invoice_number_prefix, 'INV-') ||
      LPAD(COALESCE(v_org_settings.invoice_number_next, 1)::text, COALESCE(v_org_settings.invoice_number_padding, 6), '0');
    UPDATE org_settings SET invoice_number_next = COALESCE(invoice_number_next, 1) + 1
    WHERE organization_id = v_invoice.organization_id;
  ELSE
    v_invoice_number := v_invoice.invoice_number;
  END IF;
  UPDATE invoices SET
    invoice_number = v_invoice_number,
    issued_at = now(),
    issued_by = v_user_id,
    locked_fields = '["total_net","total_vat","total_gross","lines"]'::jsonb,
    updated_at = now()
  WHERE id = p_invoice_id;
  v_post := public.approve_invoice(p_invoice_id, v_user_id);
  IF NOT COALESCE((v_post->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Could not post invoice to the ledger: %',
      COALESCE(v_post->>'error_message', 'posting error')
      USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (v_invoice.organization_id, v_user_id, 'invoice', p_invoice_id, 'issued',
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'AWAITING_PAYMENT', 'invoice_number', v_invoice_number));
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id,
                            'invoice_number', v_invoice_number,
                            'journal_id', v_post->>'journal_id');
END;
$$;