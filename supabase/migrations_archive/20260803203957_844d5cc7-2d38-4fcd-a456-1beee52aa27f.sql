-- DEF-029 — invoice draft lines cannot be saved (42804)
--
-- Regression introduced by 20260731210000 (DEF-001/DEF-002), applied live
-- 2026-08-01 as executor version 20260801081847. The canonical invoice-draft
-- bodies insert NULLIF(v_line->>'vat_code_id','') and NULLIF(v_line->>'account_id','')
-- straight into uuid columns with no cast, so PostgreSQL raises
--   42804: column "vat_code_id" is of type uuid but expression is of type text
-- for ANY create or update that supplies lines. A draft only saves with an
-- empty lines array. Every superseded overload carried the ::uuid cast
-- (see 20251217224432); the canonical rewrite dropped it.
--
-- Both verification harnesses probed with an EMPTY lines array, on both sides,
-- which is why neither caught it. Recorded in the DEF-001/002 receipt.
--
-- Second, load-bearing detail: invoice_lines.account_id is NOT NULL with no
-- default, while src/lib/invoice-draft-service.ts sends account_id: '' and the
-- editor lets a line be saved with no account chosen. Restoring the cast alone
-- would therefore convert 42804 into a raw 23502 not-null violation for those
-- lines. This validates account_id explicitly and raises 22023 in the same
-- shape as the sibling quantity/unit_price/vat_rate checks, so the caller gets
-- an actionable message naming the line. It deliberately does NOT invent a
-- default nominal account — choosing which account a line posts to is an
-- accounting decision, and guessing it would put wrong figures in the ledger.
--
-- Well-formedness is checked too, so a malformed identifier raises the same
-- 22023 rather than an opaque 22P02 from the cast.
--
-- Bodies are re-issued from the LIVE definitions (create 0f9e8acf,
-- update 99c9bde5) with exactly these edits applied programmatically against
-- asserted anchors — nothing else in either body is retyped or reordered.
-- CREATE OR REPLACE preserves owner and ACL, so the DEF-001/002 privilege
-- state (postgres/authenticated/service_role/sandbox_exec, no PUBLIC, no anon)
-- carries over untouched and is asserted below.

BEGIN;

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
    IF NULLIF(v_line->>'account_id', '') IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: account_id is required', v_line_number), ERRCODE = '22023';
    END IF;
    IF NULLIF(v_line->>'account_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: account_id is not a valid identifier', v_line_number), ERRCODE = '22023';
    END IF;
    IF NULLIF(v_line->>'vat_code_id', '') IS NOT NULL
       AND NULLIF(v_line->>'vat_code_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: vat_code_id is not a valid identifier', v_line_number), ERRCODE = '22023';
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
      NULLIF(v_line->>'vat_code_id', '')::uuid, NULLIF(v_line->>'account_id', '')::uuid,
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

CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_issue_date text DEFAULT NULL::text, p_due_date text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb)
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
      IF NULLIF(v_line->>'account_id', '') IS NULL THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: account_id is required', v_line_number), ERRCODE = '22023';
      END IF;
      IF NULLIF(v_line->>'account_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: account_id is not a valid identifier', v_line_number), ERRCODE = '22023';
      END IF;
      IF NULLIF(v_line->>'vat_code_id', '') IS NOT NULL
         AND NULLIF(v_line->>'vat_code_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING MESSAGE = format('Invalid line %s: vat_code_id is not a valid identifier', v_line_number), ERRCODE = '22023';
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
        NULLIF(v_line->>'vat_code_id', '')::uuid, NULLIF(v_line->>'account_id', '')::uuid,
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

-- Self-verifying: assert the end state in-transaction so a partial apply aborts.
DO $def029$
DECLARE
  v_oid_create oid;
  v_oid_update oid;
BEGIN
  SELECT p.oid INTO v_oid_create FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_draft_safe' AND p.pronargs = 14;
  SELECT p.oid INTO v_oid_update FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe' AND p.pronargs = 9;

  IF v_oid_create IS NULL OR v_oid_update IS NULL THEN
    RAISE EXCEPTION 'DEF-029: a canonical invoice-draft signature is missing after replace';
  END IF;

  -- The overload ambiguity DEF-002 closed must not have reopened.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('create_invoice_draft_safe','update_invoice_draft_safe')) <> 2 THEN
    RAISE EXCEPTION 'DEF-029: expected exactly two invoice-draft signatures';
  END IF;

  -- The defect itself: no uncast NULLIF into a uuid column may remain.
  IF (SELECT count(*) FROM pg_proc p
       WHERE p.oid IN (v_oid_create, v_oid_update)
         AND (p.prosrc LIKE '%NULLIF(v_line->>''vat_code_id'', ''''),%'
           OR p.prosrc LIKE '%NULLIF(v_line->>''account_id'', ''''),%')) > 0 THEN
    RAISE EXCEPTION 'DEF-029: an uncast NULLIF into a uuid column survived';
  END IF;

  IF (SELECT count(*) FROM pg_proc p
       WHERE p.oid IN (v_oid_create, v_oid_update)
         AND p.prosrc LIKE '%account_id is required%') <> 2 THEN
    RAISE EXCEPTION 'DEF-029: the account_id validation is missing from a body';
  END IF;

  -- DEF-001 must stay closed.
  IF (SELECT count(*) FROM pg_proc p
       WHERE p.oid IN (v_oid_create, v_oid_update) AND p.prosrc LIKE '%set_rpc_context%') > 0 THEN
    RAISE EXCEPTION 'DEF-029: a body reintroduced the deleted set_rpc_context helper';
  END IF;

  -- DEF-015 / the DEF-001-002 privilege state must be preserved by CREATE OR REPLACE.
  IF has_function_privilege('anon', v_oid_create, 'EXECUTE')
     OR has_function_privilege('anon', v_oid_update, 'EXECUTE') THEN
    RAISE EXCEPTION 'DEF-029: anon regained EXECUTE on an invoice-draft function';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid_create, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_oid_update, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid_create, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid_update, 'EXECUTE')
     OR NOT has_function_privilege('sandbox_exec', v_oid_create, 'EXECUTE')
     OR NOT has_function_privilege('sandbox_exec', v_oid_update, 'EXECUTE') THEN
    RAISE EXCEPTION 'DEF-029: a required role lost EXECUTE on an invoice-draft function';
  END IF;
END
$def029$;

COMMIT;