-- Gold-Standard Fix: Invoice RPC Numeric Validation + Deterministic Rounding
-- STEP 1: Drop existing functions with their exact signatures

DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(uuid, text, uuid, text, uuid, text, text, text, text, date, date, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, uuid, text, text, text, date, date, text, jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, uuid, text, text, text, text, text, text, jsonb);

-- STEP 2: Recreate create_invoice_draft_safe with strict validation + rounding
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
  p_issue_date text DEFAULT NULL,
  p_due_date text DEFAULT NULL,
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
  v_line_number integer := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net_amount numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
BEGIN
  -- Set RPC context for RLS
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  
  -- Check organization membership
  IF NOT user_in_organization(v_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization' USING ERRCODE = '42501';
  END IF;
  
  -- Check permission
  IF NOT can_create_invoices(v_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'Permission denied: cannot create invoices' USING ERRCODE = '42501';
  END IF;
  
  -- Create invoice header
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
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_customer_id,
    COALESCE(p_invoice_type, 'SALES'),
    'DRAFT',
    p_contact_name,
    p_contact_email,
    p_invoice_number,
    p_reference,
    COALESCE(p_issue_date::date, CURRENT_DATE),
    COALESCE(p_due_date::date, CURRENT_DATE + 30),
    p_notes,
    COALESCE(p_currency, 'GBP'),
    0, 0, 0, 0, 0
  )
  RETURNING id INTO v_invoice_id;
  
  -- Process lines with strict validation and deterministic rounding
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    
    -- Strict numeric parsing (no silent coercion)
    v_quantity := try_parse_numeric(v_line->>'quantity');
    v_unit_price := try_parse_numeric(v_line->>'unit_price');
    v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);
    
    -- Hard failure on invalid quantity/unit_price
    IF v_quantity IS NULL OR v_unit_price IS NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number),
        ERRCODE = '22023';
    END IF;
    
    -- Additional validation (gold standard)
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: quantity must be > 0', v_line_number),
        ERRCODE = '22023';
    END IF;
    
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: unit_price must be >= 0', v_line_number),
        ERRCODE = '22023';
    END IF;
    
    IF v_vat_rate < 0 OR v_vat_rate > 100 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: vat_rate must be between 0 and 100', v_line_number),
        ERRCODE = '22023';
    END IF;
    
    -- Deterministic 2dp rounding
    v_net_amount := ROUND(v_quantity * v_unit_price, 2);
    v_vat_amount := ROUND(v_net_amount * (v_vat_rate / 100), 2);
    v_gross_amount := v_net_amount + v_vat_amount;
    
    -- Accumulate totals from rounded line amounts
    v_total_net := v_total_net + v_net_amount;
    v_total_vat := v_total_vat + v_vat_amount;
    v_total_gross := v_total_gross + v_gross_amount;
    
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
      NULLIF(v_line->>'vat_code_id', ''),
      NULLIF(v_line->>'account_id', ''),
      v_net_amount,
      v_vat_amount,
      v_gross_amount
    );
  END LOOP;
  
  -- Update invoice totals
  UPDATE invoices SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross,
    remaining_balance = v_total_gross
  WHERE id = v_invoice_id;
  
  -- Audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (p_organization_id, 'invoice', v_invoice_id, 'created', v_user_id, 
    jsonb_build_object('status', 'DRAFT', 'line_count', v_line_number));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$;

-- STEP 3: Recreate update_invoice_draft_safe with strict validation + rounding
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date text DEFAULT NULL,
  p_due_date text DEFAULT NULL,
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
  v_line_number integer := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_net_amount numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_total_net numeric := 0;
  v_total_vat numeric := 0;
  v_total_gross numeric := 0;
BEGIN
  -- Set RPC context for RLS
  PERFORM set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  
  -- Get invoice and verify access
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '42704';
  END IF;
  
  IF NOT user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  
  -- Only drafts can be freely edited
  IF v_invoice.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot edit non-draft invoice' USING ERRCODE = '42501';
  END IF;
  
  -- Check permission
  IF NOT can_edit_invoices(v_user_id, v_invoice.organization_id) THEN
    RAISE EXCEPTION 'Permission denied: cannot edit invoices' USING ERRCODE = '42501';
  END IF;
  
  -- Update header fields
  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date::date, issue_date),
    due_date = COALESCE(p_due_date::date, due_date),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_invoice_id;
  
  -- If lines provided, replace them
  IF p_lines IS NOT NULL THEN
    -- Delete existing lines
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    -- Process new lines with strict validation and deterministic rounding
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      -- Strict numeric parsing (no silent coercion)
      v_quantity := try_parse_numeric(v_line->>'quantity');
      v_unit_price := try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);
      
      -- Hard failure on invalid quantity/unit_price
      IF v_quantity IS NULL OR v_unit_price IS NULL THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number),
          ERRCODE = '22023';
      END IF;
      
      -- Additional validation (gold standard)
      IF v_quantity <= 0 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: quantity must be > 0', v_line_number),
          ERRCODE = '22023';
      END IF;
      
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: unit_price must be >= 0', v_line_number),
          ERRCODE = '22023';
      END IF;
      
      IF v_vat_rate < 0 OR v_vat_rate > 100 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: vat_rate must be between 0 and 100', v_line_number),
          ERRCODE = '22023';
      END IF;
      
      -- Deterministic 2dp rounding
      v_net_amount := ROUND(v_quantity * v_unit_price, 2);
      v_vat_amount := ROUND(v_net_amount * (v_vat_rate / 100), 2);
      v_gross_amount := v_net_amount + v_vat_amount;
      
      -- Accumulate totals from rounded line amounts
      v_total_net := v_total_net + v_net_amount;
      v_total_vat := v_total_vat + v_vat_amount;
      v_total_gross := v_total_gross + v_gross_amount;
      
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
        p_invoice_id,
        v_line_number,
        COALESCE(v_line->>'description', ''),
        v_quantity,
        v_unit_price,
        v_vat_rate,
        NULLIF(v_line->>'vat_code_id', ''),
        NULLIF(v_line->>'account_id', ''),
        v_net_amount,
        v_vat_amount,
        v_gross_amount
      );
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
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_invoice.organization_id, 'invoice', p_invoice_id, 'updated', v_user_id,
    jsonb_build_object('lines_updated', p_lines IS NOT NULL));
  
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- STEP 4: Migration Guards

-- Guard 1: Verify ROUND() exists in create_invoice_draft_safe
DO $$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe'
  LIMIT 1;

  IF src IS NULL OR src NOT LIKE '%ROUND(%' THEN
    RAISE EXCEPTION 'GUARD FAILED: create_invoice_draft_safe missing ROUND()';
  END IF;
END $$;

-- Guard 2: Verify ROUND() exists in update_invoice_draft_safe
DO $$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe'
  LIMIT 1;

  IF src IS NULL OR src NOT LIKE '%ROUND(%' THEN
    RAISE EXCEPTION 'GUARD FAILED: update_invoice_draft_safe missing ROUND()';
  END IF;
END $$;

-- Guard 3: Verify strict validation exists in both functions
DO $$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe'
  LIMIT 1;

  IF src NOT LIKE '%quantity must be > 0%' THEN
    RAISE EXCEPTION 'GUARD FAILED: create_invoice_draft_safe missing quantity validation';
  END IF;
END $$;

-- Guard 4: Verify exactly 1 overload per function
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe';
  
  IF v_count != 1 THEN
    RAISE EXCEPTION 'GUARD FAILED: create_invoice_draft_safe has % overloads (expected 1)', v_count;
  END IF;
  
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe';
  
  IF v_count != 1 THEN
    RAISE EXCEPTION 'GUARD FAILED: update_invoice_draft_safe has % overloads (expected 1)', v_count;
  END IF;
END $$;