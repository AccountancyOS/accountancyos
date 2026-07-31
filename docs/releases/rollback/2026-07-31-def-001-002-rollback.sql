-- =====================================================================================
-- EXECUTABLE ROLLBACK for
--   supabase/migrations/20260731210000_def_001_002_rpc_context_and_invoice_draft.sql
--   (sha256 aee9c160b5594b2748db7434c8397d22fd7e13100803204e1d04ba6cdf4830f5)
-- =====================================================================================
-- Generated 2026-07-31 by dumping pg_get_functiondef() for every affected signature
-- directly from the LIVE catalogue BEFORE the migration was applied. Nothing here is
-- retyped or reconstructed: bodies, argument names, types, order, defaults, return
-- types, security mode, volatility and function configuration are exactly as LIVE held
-- them. Ownership and ACLs are restored from the same pre-migration inventory.
--
-- This file is deliberately kept OUTSIDE supabase/migrations/ so it is never applied by
-- accident. It is self-contained: run it as written, in one transaction, no operator
-- edits, no pasting of bodies during an incident.
--
-- !! WARNING - ROLLING BACK RESTORES A KNOWN OUTAGE AND WEAKER SECURITY !!
--   * The eight repaired functions revert to calling public.set_rpc_context(), which does
--     not exist. Every call aborts with 42883 again: bill approval, bill voiding, supplier
--     payments, customer creation, and all four automation-rule operations. This is
--     confirmed live behaviour, not a theoretical risk.
--   * The invoice-draft overloads return, and with them PostgREST's resolution failures:
--     4-key create -> PGRST203, 2-key update -> PGRST203, the service's 9-key update
--     -> PGRST202.
--   * The cross-tenant relationship checks are lost: a restored create no longer verifies
--     that the entity belongs to the organisation, and neither restored function verifies
--     that a supplied customer belongs to the invoice's organisation.
--   * PUBLIC and anon EXECUTE are restored on privileged SECURITY DEFINER functions that
--     create customers, approve bills and record payments.
--   * The create overloads' security divergence returns (one authorises portal clients,
--     the other requires can_create_invoices).
-- That warning does not replace an executable rollback; both are provided.
--
-- ORDER (dependency-safe):
--   1. Restore all twelve pre-migration definitions (CREATE OR REPLACE; the three
--      superseded signatures are re-created outright).
--   2. Drop the canonical 9-argument update introduced by the migration - only after
--      step 1, so the service's update payload never resolves to nothing.
--   3. Restore ownership and exact pre-migration ACLs last, so nothing is briefly
--      reachable under the wrong grants.
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- PART 1 - restore the twelve pre-migration definitions verbatim
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.approve_bill_safe(p_bill_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_automation_rule_safe(p_organization_id uuid, p_name text, p_trigger_type text, p_trigger_config jsonb DEFAULT '{}'::jsonb, p_action_type text DEFAULT NULL::text, p_action_config jsonb DEFAULT '{}'::jsonb, p_is_active boolean DEFAULT true, p_email_mode text DEFAULT 'draft'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_customer_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_billing_address jsonb DEFAULT NULL::jsonb, p_company_name text DEFAULT NULL::text, p_vat_number text DEFAULT NULL::text, p_payment_terms_days integer DEFAULT 30, p_default_currency text DEFAULT 'GBP'::text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_invoice_type text DEFAULT 'SALES'::text, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_invoice_number text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'GBP'::text, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_invoice_type text DEFAULT 'SALES'::text, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_invoice_number text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date text DEFAULT NULL::text, p_due_date text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'GBP'::text, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_automation_rule_safe(p_rule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_bill_payment_safe(p_bill_id uuid, p_amount numeric, p_payment_date date, p_bank_account_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_automation_rule_safe(p_rule_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_automation_rule_safe(p_rule_id uuid, p_name text DEFAULT NULL::text, p_trigger_type text DEFAULT NULL::text, p_trigger_config jsonb DEFAULT NULL::jsonb, p_action_type text DEFAULT NULL::text, p_action_config jsonb DEFAULT NULL::jsonb, p_is_active boolean DEFAULT NULL::boolean, p_email_mode text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date text DEFAULT NULL::text, p_due_date text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.void_bill_safe(p_bill_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- =====================================================================================
-- PART 2 - remove the canonical 9-argument update created by the migration
-- Safe only now that both 8-argument signatures above exist again.
-- =====================================================================================
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb);

-- =====================================================================================
-- PART 3 - restore ownership and exact pre-migration ACLs
-- Pre-migration ACL, identical on all twelve signatures (executor inventory 2026-07-31):
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--    service_role=X/postgres,sandbox_exec=X/postgres}
-- i.e. owner postgres, EXECUTE to PUBLIC, anon, authenticated, service_role, sandbox_exec.
-- =====================================================================================
DO $rollback_acl$
DECLARE
  v_sig text;
  v_sigs text[] := ARRAY[
    'public.approve_bill_safe(uuid)',
    'public.create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)',
    'public.create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)',
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,date,date,text,text,jsonb)',
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)',
    'public.delete_automation_rule_safe(uuid)',
    'public.record_bill_payment_safe(uuid,numeric,date,uuid,text,text)',
    'public.toggle_automation_rule_safe(uuid,boolean)',
    'public.update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,date,date,text,jsonb)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,jsonb)',
    'public.void_bill_safe(uuid,text)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role, sandbox_exec', v_sig);
  END LOOP;
END
$rollback_acl$;

-- =====================================================================================
-- PART 4 - post-rollback assertions. These FAIL the transaction if the catalogue is not
-- back to its pre-migration shape, so a partial rollback cannot be mistaken for success.
-- =====================================================================================
DO $rollback_verify$
DECLARE
  v_helper_callers int;
  v_create_overloads int;
  v_update_overloads int;
BEGIN
  SELECT count(*) INTO v_helper_callers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosrc LIKE '%set_rpc_context%';
  IF v_helper_callers <> 12 THEN
    RAISE EXCEPTION 'Rollback incomplete: expected 12 set_rpc_context callers, found %', v_helper_callers;
  END IF;

  SELECT count(*) INTO v_create_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe';
  SELECT count(*) INTO v_update_overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe';
  IF v_create_overloads <> 2 OR v_update_overloads <> 2 THEN
    RAISE EXCEPTION 'Rollback incomplete: invoice-draft overloads are %/% (expected 2/2)',
      v_create_overloads, v_update_overloads;
  END IF;
END
$rollback_verify$;

COMMIT;

-- =====================================================================================
-- Post-rollback expectation (do not treat as a failure - it is the restored outage):
--   POST /rest/v1/rpc/approve_bill_safe -> 42883 "function public.set_rpc_context() does not exist"
--   POST /rest/v1/rpc/create_invoice_draft_safe (4-key)  -> PGRST203
--   POST /rest/v1/rpc/update_invoice_draft_safe (2-key)  -> PGRST203
--   POST /rest/v1/rpc/update_invoice_draft_safe (9-key)  -> PGRST202
-- =====================================================================================
