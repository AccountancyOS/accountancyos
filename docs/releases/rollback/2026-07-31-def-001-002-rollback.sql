-- =====================================================================================
-- ROLLBACK for 20260731210000_def_001_002_rpc_context_and_invoice_draft.sql
-- =====================================================================================
-- SELF-CONTAINED AND EXECUTABLE. Run this file as-is to reverse that release completely.
-- No manual steps, no bodies to paste. Every definition below is reproduced verbatim from
-- the LIVE pre-migration state captured on 2026-07-31 via mcp_list_functions, and the ACLs
-- from the executor's pg_proc inventory of the same date.
--
-- Kept outside supabase/migrations/ so it is never applied as a migration.
--
-- !! ROLLING BACK RESTORES BROKEN AND WEAKER BEHAVIOUR !!
--   * The eight repaired functions call public.set_rpc_context() again — a function that
--     does not exist. Every call aborts with 42883: bill approval, bill voiding, supplier
--     payments, customer creation, and all four automation-rule operations.
--   * The invoice-draft overloads return, restoring PostgREST PGRST203 ambiguity. The
--     service's 9-key update payload matches no candidate.
--   * Cross-tenant relationship checks are lost: create no longer verifies the entity
--     belongs to the organisation, and neither function verifies a supplied customer does.
--   * PUBLIC and anon EXECUTE are restored on privileged mutating functions.
--   * The create overloads' security divergence returns.
-- Fix forward unless the intent is genuinely to reinstate the outage.
--
-- Order: restore the old invoice-draft signatures first, then drop the new canonical
-- update, then revert the eight bodies, then restore ACLs last. Run inside one transaction.
-- =====================================================================================

BEGIN;

-- ── 1. Restore create_invoice_draft_safe 14-arg to its pre-migration body (0be3f28b) ──
-- Reverts the merged portal branch and the entity/customer relationship checks.
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_invoice_type text DEFAULT 'SALES'::text, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_invoice_number text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date text DEFAULT NULL::text, p_due_date text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'GBP'::text, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  INSERT INTO invoices (
    organization_id, client_id, company_id, customer_id, invoice_type, status,
    contact_name, contact_email, invoice_number, reference, issue_date, due_date,
    notes, currency, total_net, total_vat, total_gross, amount_paid, remaining_balance
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

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;

    v_quantity := try_parse_numeric(v_line->>'quantity');
    v_unit_price := try_parse_numeric(v_line->>'unit_price');
    v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);

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

    v_net_amount := ROUND(v_quantity * v_unit_price, 2);
    v_vat_amount := ROUND(v_net_amount * (v_vat_rate / 100), 2);
    v_gross_amount := v_net_amount + v_vat_amount;

    v_total_net := v_total_net + v_net_amount;
    v_total_vat := v_total_vat + v_vat_amount;
    v_total_gross := v_total_gross + v_gross_amount;

    INSERT INTO invoice_lines (
      invoice_id, line_number, description, quantity, unit_price, vat_rate,
      vat_code_id, account_id, net_amount, vat_amount, gross_amount
    ) VALUES (
      v_invoice_id, v_line_number, COALESCE(v_line->>'description', ''),
      v_quantity, v_unit_price, v_vat_rate,
      NULLIF(v_line->>'vat_code_id', ''), NULLIF(v_line->>'account_id', ''),
      v_net_amount, v_vat_amount, v_gross_amount
    );
  END LOOP;

  UPDATE invoices SET
    total_net = v_total_net,
    total_vat = v_total_vat,
    total_gross = v_total_gross,
    remaining_balance = v_total_gross
  WHERE id = v_invoice_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (p_organization_id, 'invoice', v_invoice_id, 'created', v_user_id,
    jsonb_build_object('status', 'DRAFT', 'line_count', v_line_number));

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$function$;

-- ── 2. Recreate create_invoice_draft_safe 13-arg (a7b18cc6) ──────────────────────────
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_invoice_type text DEFAULT 'SALES'::text, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_invoice_number text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'GBP'::text, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

-- ── 3. Recreate update_invoice_draft_safe 8-arg, date/p_notes variant (11aa2e7d) ─────
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

-- ── 4. Recreate update_invoice_draft_safe 8-arg, text/p_contact_email variant (bf0ea670) ──
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date text DEFAULT NULL::text, p_due_date text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.rpc', '1', true);

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '42704';
  END IF;

  IF NOT user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF v_invoice.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Can only edit DRAFT invoices' USING ERRCODE = '42501';
  END IF;

  UPDATE invoices SET
    customer_id = COALESCE(p_customer_id, customer_id),
    contact_name = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference = COALESCE(p_reference, reference),
    issue_date = COALESCE(p_issue_date::date, issue_date),
    due_date = COALESCE(p_due_date::date, due_date),
    updated_at = now()
  WHERE id = p_invoice_id;

  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    v_line_number := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := try_parse_numeric(v_line->>'quantity');
      v_unit_price := try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);

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

      v_validated_lines := array_append(v_validated_lines, v_line);
    END LOOP;

    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;

    v_line_number := 0;
    FOREACH v_line IN ARRAY v_validated_lines
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := try_parse_numeric(v_line->>'quantity');
      v_unit_price := try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(try_parse_numeric(v_line->>'vat_rate'), 0);

      v_net_amount := ROUND(v_quantity * v_unit_price, 2);
      v_vat_amount := ROUND(v_net_amount * (v_vat_rate / 100), 2);
      v_gross_amount := v_net_amount + v_vat_amount;

      v_total_net := v_total_net + v_net_amount;
      v_total_vat := v_total_vat + v_vat_amount;
      v_total_gross := v_total_gross + v_gross_amount;

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

    UPDATE invoices SET
      total_net = v_total_net,
      total_vat = v_total_vat,
      total_gross = v_total_gross,
      remaining_balance = v_total_gross - COALESCE(amount_paid, 0),
      updated_at = now()
    WHERE id = p_invoice_id;
  END IF;

  INSERT INTO audit_log (
    organization_id, entity_type, entity_id, action, user_id, metadata
  ) VALUES (
    v_invoice.organization_id, 'invoice', p_invoice_id, 'updated', v_user_id,
    jsonb_build_object('lines_updated', p_lines IS NOT NULL)
  );

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$function$;

-- ── 5. Drop the new canonical 9-argument update ──────────────────────────────────────
-- Safe now: both 8-arg signatures above exist again, so update payloads still resolve.
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb);

-- ── 6. Revert the eight bodies to calling public.set_rpc_context() ───────────────────
-- Each is byte-identical to the shipped repair except that one line.

CREATE OR REPLACE FUNCTION public.create_automation_rule_safe(p_organization_id uuid, p_name text, p_trigger_type text, p_trigger_config jsonb DEFAULT '{}'::jsonb, p_action_type text DEFAULT NULL::text, p_action_config jsonb DEFAULT '{}'::jsonb, p_is_active boolean DEFAULT true, p_email_mode text DEFAULT 'draft'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

CREATE OR REPLACE FUNCTION public.update_automation_rule_safe(p_rule_id uuid, p_name text DEFAULT NULL::text, p_trigger_type text DEFAULT NULL::text, p_trigger_config jsonb DEFAULT NULL::jsonb, p_action_type text DEFAULT NULL::text, p_action_config jsonb DEFAULT NULL::jsonb, p_is_active boolean DEFAULT NULL::boolean, p_email_mode text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

CREATE OR REPLACE FUNCTION public.toggle_automation_rule_safe(p_rule_id uuid, p_is_active boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_automation_rule_safe(p_rule_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

CREATE OR REPLACE FUNCTION public.approve_bill_safe(p_bill_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  UPDATE bills SET status = 'APPROVED', approved_at = now(), approved_by = v_user_id
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (v_bill.organization_id, 'bill', p_bill_id, 'approved', v_user_id);

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_bill_safe(p_bill_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  UPDATE bills SET status = 'VOIDED', void_reason = p_reason, voided_at = now(), voided_by = v_user_id
  WHERE id = p_bill_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  VALUES (v_bill.organization_id, 'bill', p_bill_id, 'voided', v_user_id,
    jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'bill_id', p_bill_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_bill_payment_safe(p_bill_id uuid, p_amount numeric, p_payment_date date, p_bank_account_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

CREATE OR REPLACE FUNCTION public.create_customer_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_billing_address jsonb DEFAULT NULL::jsonb, p_company_name text DEFAULT NULL::text, p_vat_number text DEFAULT NULL::text, p_payment_terms_days integer DEFAULT 30, p_default_currency text DEFAULT 'GBP'::text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
$function$;

-- ── 7. Restore ownership and ACLs exactly as inventoried on 2026-07-31 ───────────────
-- Pre-migration ACL on every affected signature:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
--    service_role=X/postgres,sandbox_exec=X/postgres}
DO $$
DECLARE
  v_sig text;
  v_sigs text[] := ARRAY[
    'public.create_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)',
    'public.update_automation_rule_safe(uuid,text,text,jsonb,text,jsonb,boolean,text)',
    'public.toggle_automation_rule_safe(uuid,boolean)',
    'public.delete_automation_rule_safe(uuid)',
    'public.approve_bill_safe(uuid)',
    'public.void_bill_safe(uuid,text)',
    'public.record_bill_payment_safe(uuid,numeric,date,uuid,text,text)',
    'public.create_customer_safe(uuid,text,uuid,text,text,text,jsonb,text,text,integer,text,text)',
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,date,date,text,text,jsonb)',
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,date,date,text,jsonb)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,jsonb)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role, sandbox_exec', v_sig);
  END LOOP;
END $$;

COMMIT;

-- ── Post-rollback verification ───────────────────────────────────────────────────────
-- 1. Eight functions reference set_rpc_context again:
--      SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname='public' AND p.prosrc LIKE '%set_rpc_context%' ORDER BY 1;   -- expect 8
-- 2. Four invoice-draft overloads exist again (2 create, 2 update), and the 9-arg update is gone:
--      SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname='public' AND p.proname LIKE '%invoice_draft_safe' ORDER BY 1;  -- expect 4
-- 3. ACLs carry =X and anon again on all twelve.
