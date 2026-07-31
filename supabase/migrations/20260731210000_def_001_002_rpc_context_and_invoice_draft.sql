-- =====================================================================================
-- DEF-001 + DEF-002 — one atomic family. FOR REVIEW BEFORE APPLICATION.
-- =====================================================================================
-- DEF-001 is EIGHT broken function instances, not ten. Evidence:
--   * Repository: parsing every CREATE FUNCTION and CREATE OR REPLACE FUNCTION block in
--     the five migrations mentioning set_rpc_context yields 15 names that ever called it.
--   * LIVE: all 368 public function bodies swept via mcp_list_functions — exactly 8 still
--     call public.set_rpc_context(), 10 instances already inline set_config('app.rpc').
--   * LIVE pg_proc (executor, 2026-07-31T20:15:16Z): calls_helper = true on exactly those
--     8 rows. No LIVE-only caller exists, so the DEF-020 residual risk is closed here.
-- Invoice drafting and record_invoice_payment_safe are NOT broken and are not repaired
-- here. update_bill_draft_safe was already repaired live though its git definition never
-- referenced the helper — drift in the harmless direction, recorded not acted on.
--
-- WHY INLINE RATHER THAN DELETE. set_rpc_context() did exactly one thing:
-- PERFORM set_config('app.rpc','1',true). Its reader is_rpc_context() no longer exists and
-- the policies that consumed the flag are constant false, so nothing reads it. The call is
-- inlined anyway to keep these eight byte-consistent with the ten already repaired. Whether
-- to strip app.rpc everywhere or restore the RPC-write-guard is a separate decision and is
-- deliberately NOT taken here.
--
-- GRANTS. The executor's ACL inventory shows all twelve affected signatures carrying
-- `=X` (PUBLIC EXECUTE) plus an explicit anon grant, owner postgres. These are privileged
-- SECURITY DEFINER functions that mutate data. They are not exploitable — each rejects a
-- null auth.uid() internally, which is why they are outside DEF-015's 93 — but the grant is
-- an unreviewed default of the same class. PUBLIC and anon are revoked; authenticated and
-- service_role are granted explicitly.
--   >>> sandbox_exec: for the nine PRE-EXISTING signatures it is preserved by doing nothing
--   >>> — REVOKE FROM PUBLIC/anon does not touch an independent grantee, and CREATE OR
--   >>> REPLACE keeps an existing function's ACL. But the canonical 9-argument
--   >>> update_invoice_draft_safe is a NEW signature with no historical ACL to preserve, so
--   >>> "untouched" is meaningless for it: it would be created with implicit PUBLIC EXECUTE,
--   >>> have PUBLIC revoked, and end with no sandbox_exec grant — able to be created but not
--   >>> updated by executor infrastructure. Part 4 therefore grants sandbox_exec EXECUTE
--   >>> explicitly on BOTH canonical invoice-draft signatures, so their final ACLs are
--   >>> identical and stated rather than inherited. (Owner ruling, 2026-07-31.)
--   >>> BEHAVIOUR CHANGE: an anonymous caller previously received a JSON
--   >>> {"success":false,"error":"Not authenticated"}; it will now get a hard permission
--   >>> denied. No legitimate caller is affected — portal users are `authenticated`.
--
-- ORDER. Canonical invoice-draft functions are created BEFORE the superseded signatures are
-- dropped, so the operation is never unavailable mid-deploy.
--
-- TRANSACTION. This file opens with BEGIN; and closes with COMMIT;. Every statement in it is
-- transactional DDL — CREATE OR REPLACE FUNCTION, DROP FUNCTION IF EXISTS, ALTER FUNCTION
-- OWNER, REVOKE and GRANT. There is no CREATE INDEX CONCURRENTLY, VACUUM, ALTER TYPE ADD
-- VALUE or ALTER SYSTEM, so nothing here forbids running inside a transaction block. The
-- wrapper is explicit because "one migration file" is not proof of transactional execution:
-- the Lovable executor's wrapping behaviour is not introspectable from the repository, and
-- DEF-020/023 already record that this executor departs from convention. Whether the
-- executor also wraps the file is now irrelevant — a nested BEGIN/COMMIT is a harmless
-- no-op, while an unwrapped executor is made atomic by this file itself. DEF-001 and
-- DEF-002 must not be able to exist in a half-applied state.
-- =====================================================================================

BEGIN;

-- ===================================================================================
-- PART 1 — the eight DEF-001 repairs.
-- Each reproduced from its live body with ONLY `PERFORM public.set_rpc_context();`
-- replaced by `PERFORM set_config('app.rpc', '1', true);`. Signatures, authorisation,
-- validation, audit writes and return shapes are untouched.
-- ===================================================================================

-- 1.1 create_automation_rule_safe — live de32451bf09a51a6742ead9f4d9370c7
CREATE OR REPLACE FUNCTION public.create_automation_rule_safe(p_organization_id uuid, p_name text, p_trigger_type text, p_trigger_config jsonb DEFAULT '{}'::jsonb, p_action_type text DEFAULT NULL::text, p_action_config jsonb DEFAULT '{}'::jsonb, p_is_active boolean DEFAULT true, p_email_mode text DEFAULT 'draft'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rule_id uuid;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.2 update_automation_rule_safe — live 3803ae13cc8175a520b966e8e580c792
CREATE OR REPLACE FUNCTION public.update_automation_rule_safe(p_rule_id uuid, p_name text DEFAULT NULL::text, p_trigger_type text DEFAULT NULL::text, p_trigger_config jsonb DEFAULT NULL::jsonb, p_action_type text DEFAULT NULL::text, p_action_config jsonb DEFAULT NULL::jsonb, p_is_active boolean DEFAULT NULL::boolean, p_email_mode text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rule record;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.3 toggle_automation_rule_safe — live dbe752a548473094290ba330a37bd499
CREATE OR REPLACE FUNCTION public.toggle_automation_rule_safe(p_rule_id uuid, p_is_active boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rule record;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.4 delete_automation_rule_safe — live 1ef6b7fc5ca1ae64dda5bfc86e606658
CREATE OR REPLACE FUNCTION public.delete_automation_rule_safe(p_rule_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_rule record;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.5 approve_bill_safe — live 755513149768024ecce6dfa2c5824dd7
CREATE OR REPLACE FUNCTION public.approve_bill_safe(p_bill_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_bill record;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.6 void_bill_safe — live cc7973c4e90325f0a37e5921e048adcc
CREATE OR REPLACE FUNCTION public.void_bill_safe(p_bill_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_bill record;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.7 record_bill_payment_safe — live 2dbb017119696ef2f1569c384e08445b
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
  PERFORM set_config('app.rpc', '1', true);

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

-- 1.8 create_customer_safe — live 1ca6a433362aae7a5d027275b91a57bd
CREATE OR REPLACE FUNCTION public.create_customer_safe(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_billing_address jsonb DEFAULT NULL::jsonb, p_company_name text DEFAULT NULL::text, p_vat_number text DEFAULT NULL::text, p_payment_terms_days integer DEFAULT 30, p_default_currency text DEFAULT 'GBP'::text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

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

-- ===================================================================================
-- PART 2 — DEF-002 canonical invoice-draft functions. Created BEFORE any drop.
-- Full rationale in docs/audits/2026-07-31-def-001-002-signature-matrix.md.
-- ===================================================================================

-- 2.1 Canonical CREATE — the 14-arg signature (live 0be3f28b) with the portal branch merged.
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(
  p_organization_id uuid, p_entity_type text, p_entity_id uuid,
  p_invoice_type text DEFAULT 'SALES'::text, p_customer_id uuid DEFAULT NULL::uuid,
  p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text,
  p_invoice_number text DEFAULT NULL::text, p_reference text DEFAULT NULL::text,
  p_issue_date text DEFAULT NULL::text, p_due_date text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'GBP'::text,
  p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_invoice_id uuid;
  v_line jsonb;
  v_line_number integer := 0;
  v_quantity numeric; v_unit_price numeric; v_vat_rate numeric;
  v_net_amount numeric; v_vat_amount numeric; v_gross_amount numeric;
  v_total_net numeric := 0; v_total_vat numeric := 0; v_total_gross numeric := 0;
  v_is_portal boolean := false;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_entity_type NOT IN ('client', 'company') THEN
    RAISE EXCEPTION 'Invalid entity_type' USING ERRCODE = '22023';
  END IF;

  -- Portal capability preserved (owner ruling 2026-07-30): resolve the security
  -- difference between the overloads in favour of KEEPING the capability.
  v_is_portal := public.portal_has_perm(
    CASE WHEN p_entity_type = 'client'  THEN p_entity_id END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id END,
    'allow_invoice_create');

  IF NOT v_is_portal THEN
    IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
      RAISE EXCEPTION 'Access denied to organization' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_create_invoices(v_user_id, p_organization_id) THEN
      RAISE EXCEPTION 'Permission denied: cannot create invoices' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Relationship check, from the other overload: without it an invoice could be attached
  -- to another tenant's entity.
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
      WHERE p_entity_type = 'client' AND id = p_entity_id AND organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.companies
      WHERE p_entity_type = 'company' AND id = p_entity_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Entity does not belong to organization' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO invoices (
    organization_id, client_id, company_id, customer_id, invoice_type, status,
    contact_name, contact_email, invoice_number, reference, issue_date, due_date,
    notes, currency, total_net, total_vat, total_gross, amount_paid, remaining_balance
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_customer_id, COALESCE(p_invoice_type, 'SALES'), 'DRAFT',
    p_contact_name, p_contact_email, p_invoice_number, p_reference,
    COALESCE(p_issue_date::date, CURRENT_DATE),
    COALESCE(p_due_date::date, CURRENT_DATE + 30),
    p_notes, COALESCE(p_currency, 'GBP'), 0, 0, 0, 0, 0
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_quantity := public.try_parse_numeric(v_line->>'quantity');
    v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
    v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);

    IF v_quantity IS NULL OR v_unit_price IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number), ERRCODE = '22023';
    END IF;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: quantity must be > 0', v_line_number), ERRCODE = '22023';
    END IF;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: unit_price must be >= 0', v_line_number), ERRCODE = '22023';
    END IF;
    IF v_vat_rate < 0 OR v_vat_rate > 100 THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: vat_rate must be between 0 and 100', v_line_number), ERRCODE = '22023';
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
    total_net = v_total_net, total_vat = v_total_vat, total_gross = v_total_gross,
    remaining_balance = v_total_gross
  WHERE id = v_invoice_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (p_organization_id, 'invoice', v_invoice_id, 'created', v_user_id,
    jsonb_build_object('status', 'DRAFT', 'line_count', v_line_number,
                       'via', CASE WHEN v_is_portal THEN 'portal' ELSE 'staff' END));

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$function$;

-- 2.2 Canonical UPDATE — NEW 9-arg signature. Behaviour from live bf0ea670.
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid,
  p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text, p_issue_date text DEFAULT NULL::text,
  p_due_date text DEFAULT NULL::text, p_notes text DEFAULT NULL::text,
  p_lines jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_line jsonb;
  v_line_number int := 0;
  v_quantity numeric; v_unit_price numeric; v_vat_rate numeric;
  v_net_amount numeric; v_vat_amount numeric; v_gross_amount numeric;
  v_total_net numeric := 0; v_total_vat numeric := 0; v_total_gross numeric := 0;
  v_validated_lines jsonb[] := ARRAY[]::jsonb[];
  v_is_portal boolean := false;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '42704';
  END IF;

  -- Scoped to THIS invoice's owning entity: a portal user cannot reach another client's
  -- invoice, and portal authority covers draft create/edit only.
  v_is_portal := public.portal_has_perm(v_invoice.client_id, v_invoice.company_id, 'allow_invoice_create');

  IF NOT v_is_portal THEN
    IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;
    -- INTENTIONAL TIGHTENING (owner ruling): update now requires the invoice capability.
    -- A member without can_create_invoices could previously edit drafts and no longer can.
    IF NOT public.can_create_invoices(v_user_id, v_invoice.organization_id) THEN
      RAISE EXCEPTION 'Permission denied: cannot edit invoices' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_invoice.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Can only edit DRAFT invoices' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND organization_id = v_invoice.organization_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to organization' USING ERRCODE = '42501';
  END IF;

  UPDATE invoices SET
    customer_id   = COALESCE(p_customer_id, customer_id),
    contact_name  = COALESCE(p_contact_name, contact_name),
    contact_email = COALESCE(p_contact_email, contact_email),
    reference     = COALESCE(p_reference, reference),
    issue_date    = COALESCE(p_issue_date::date, issue_date),
    due_date      = COALESCE(p_due_date::date, due_date),
    notes         = COALESCE(p_notes, notes),
    updated_at    = now()
  WHERE id = p_invoice_id;

  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    -- PHASE 1 — validate everything before destroying anything.
    v_line_number := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);

      IF v_quantity IS NULL OR v_unit_price IS NULL THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number), ERRCODE = '22023';
      END IF;
      IF v_quantity <= 0 THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: quantity must be > 0', v_line_number), ERRCODE = '22023';
      END IF;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: unit_price must be >= 0', v_line_number), ERRCODE = '22023';
      END IF;
      IF v_vat_rate < 0 OR v_vat_rate > 100 THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: vat_rate must be between 0 and 100', v_line_number), ERRCODE = '22023';
      END IF;

      v_validated_lines := array_append(v_validated_lines, v_line);
    END LOOP;

    -- PHASE 2 — only now is mutation safe.
    DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;

    v_line_number := 0;
    FOREACH v_line IN ARRAY v_validated_lines
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);

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
        p_invoice_id, v_line_number, COALESCE(v_line->>'description', ''),
        v_quantity, v_unit_price, v_vat_rate,
        NULLIF(v_line->>'vat_code_id', ''), NULLIF(v_line->>'account_id', ''),
        v_net_amount, v_vat_amount, v_gross_amount
      );
    END LOOP;

    UPDATE invoices SET
      total_net = v_total_net, total_vat = v_total_vat, total_gross = v_total_gross,
      remaining_balance = v_total_gross - COALESCE(amount_paid, 0),
      updated_at = now()
    WHERE id = p_invoice_id;
  END IF;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_invoice.organization_id, 'invoice', p_invoice_id, 'updated', v_user_id,
    jsonb_build_object('lines_updated', p_lines IS NOT NULL,
                       'via', CASE WHEN v_is_portal THEN 'portal' ELSE 'staff' END));

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$function$;

-- ===================================================================================
-- PART 3 — drop superseded signatures, by COMPLETE signature, AFTER the creates.
-- Every dropped key-set is a subset of a canonical signature and every parameter but the
-- first has a DEFAULT, so all four observed payloads still resolve. No wrappers needed.
-- ===================================================================================
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(
  uuid, text, uuid, text, uuid, text, text, text, date, date, text, text, jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, date, date, text, jsonb);
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, jsonb);

-- ===================================================================================
-- PART 4 — ownership and privileges, stated explicitly for every affected signature.
-- Inventory (executor, 2026-07-31): owner postgres; ACL `=X` (PUBLIC) + anon +
-- authenticated + service_role + sandbox_exec. PUBLIC and anon are revoked as unreviewed
-- defaults on privileged mutating functions.
--
-- sandbox_exec: preserved implicitly on the nine pre-existing signatures (the REVOKEs below
-- name only PUBLIC and anon, and CREATE OR REPLACE retains an existing ACL), and granted
-- EXPLICITLY on both canonical invoice-draft signatures — the 9-argument update is new and
-- has no ACL to inherit, so leaving it implicit would silently drop executor infrastructure
-- from one of the ten. Stated for the 14-argument create too, so the pair is symmetrical
-- and provable from this file rather than from history.
--
-- Final ACL, all ten signatures: owner postgres; EXECUTE to authenticated, service_role and
-- sandbox_exec; NO EXECUTE for PUBLIC or anon.
-- ===================================================================================
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
    'public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)',
    'public.update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,text,jsonb)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END $$;

-- The two canonical invoice-draft signatures, stated explicitly. Idempotent for the
-- 14-argument create (which already held the grant); load-bearing for the 9-argument
-- update, which this migration creates and which would otherwise end with no sandbox_exec
-- EXECUTE at all.
GRANT EXECUTE ON FUNCTION public.create_invoice_draft_safe(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb
) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb
) TO sandbox_exec;

COMMIT;
