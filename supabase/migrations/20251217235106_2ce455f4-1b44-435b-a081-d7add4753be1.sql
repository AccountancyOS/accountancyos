-- Fix update_invoice_draft_safe: Two-phase validation (validate ALL lines BEFORE deleting)
-- This ensures invalid payloads don't destroy existing invoice lines

-- Drop existing function first
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, uuid, text, text, text, text, text, jsonb);

-- Recreate with two-phase validation
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_issue_date text DEFAULT NULL,
  p_due_date text DEFAULT NULL,
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
  v_validated_lines jsonb[] := ARRAY[]::jsonb[];
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Set RPC context for RLS bypass
  PERFORM set_config('app.rpc', '1', true);

  -- Fetch and verify invoice
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '42704';
  END IF;

  -- Verify organization access
  IF NOT user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- Only allow editing DRAFT invoices
  IF v_invoice.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Can only edit DRAFT invoices' USING ERRCODE = '42501';
  END IF;

  -- Update invoice header fields
  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date::date, issue_date),
    due_date = COALESCE(p_due_date::date, due_date),
    updated_at = now()
  WHERE id = p_invoice_id;

  -- Process lines if provided (TWO-PHASE VALIDATION)
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    
    -- ============================================
    -- PHASE 1: Validate ALL lines FIRST (no mutations)
    -- ============================================
    v_line_number := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      
      -- Parse numeric values
      v_quantity := try_parse_numeric(v_line->>'quantity');
      v_unit_price := try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);
      
      -- Strict validation - fail hard if invalid
      IF v_quantity IS NULL OR v_unit_price IS NULL THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number),
          ERRCODE = '22023';
      END IF;
      
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
      
      -- Store validated line data for phase 2
      v_validated_lines := array_append(v_validated_lines, v_line);
    END LOOP;
    
    -- ============================================
    -- PHASE 2: Only AFTER all validation passes - now safe to mutate
    -- ============================================
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;
    
    -- ============================================
    -- PHASE 3: Insert validated lines with rounding
    -- ============================================
    v_line_number := 0;
    FOREACH v_line IN ARRAY v_validated_lines
    LOOP
      v_line_number := v_line_number + 1;
      
      -- Re-parse (already validated)
      v_quantity := try_parse_numeric(v_line->>'quantity');
      v_unit_price := try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);
      
      -- Deterministic 2dp rounding
      v_net_amount := ROUND(v_quantity * v_unit_price, 2);
      v_vat_amount := ROUND(v_net_amount * (v_vat_rate / 100), 2);
      v_gross_amount := v_net_amount + v_vat_amount;
      
      -- Accumulate totals from rounded values
      v_total_net := v_total_net + v_net_amount;
      v_total_vat := v_total_vat + v_vat_amount;
      v_total_gross := v_total_gross + v_gross_amount;
      
      -- Insert line
      INSERT INTO invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        vat_rate, vat_code_id, account_id, net_amount, vat_amount, gross_amount
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
    
    -- Update invoice totals from summed rounded line amounts
    UPDATE invoices SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross,
      remaining_balance = v_total_gross - COALESCE(amount_paid, 0),
      updated_at = now()
    WHERE id = p_invoice_id;
  END IF;

  -- Log to audit
  INSERT INTO audit_log (
    organization_id, entity_type, entity_id, action, user_id, metadata
  ) VALUES (
    v_invoice.organization_id,
    'invoice',
    p_invoice_id,
    'updated',
    v_user_id,
    jsonb_build_object('lines_updated', p_lines IS NOT NULL)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id
  );
END;
$$;

-- Migration guard: verify two-phase validation pattern exists
DO $$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p 
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe'
  LIMIT 1;
  
  IF src NOT LIKE '%PHASE 1%' OR src NOT LIKE '%PHASE 2%' THEN
    RAISE EXCEPTION 'GUARD FAILED: update_invoice_draft_safe missing two-phase validation';
  END IF;
  
  IF src NOT LIKE '%ROUND(%' THEN
    RAISE EXCEPTION 'GUARD FAILED: update_invoice_draft_safe missing ROUND()';
  END IF;
END $$;