-- =====================================================================================
-- DRAFT — NOT FOR APPLICATION. DEF-002: one canonical invoice-draft RPC per operation.
-- =====================================================================================
-- This file is deliberately named DRAFT-* so it cannot be picked up by the migration
-- flow. It is for review. On approval it is renamed to a timestamped migration and
-- merged with the DEF-001 body repairs into ONE migration, so the two cannot exist in a
-- half-fixed state.
--
-- ── Why the "drop the stale overload" plan does not work ────────────────────────────
-- src/lib/invoice-draft-service.ts sends NINE keys to update_invoice_draft_safe:
--   p_invoice_id, p_customer_id, p_contact_name, p_contact_email, p_reference,
--   p_issue_date, p_due_date, p_notes, p_lines
-- Neither live overload accepts that set — 11aa2e7d has p_notes but no p_contact_email;
-- bf0ea670 has p_contact_email but no p_notes. The payload is a superset of both, so
-- PostgREST answers PGRST203. Dropping one would turn that into PGRST202 "no such
-- function". The canonical update must therefore be a NEW nine-argument signature.
--
-- src/pages/OpsHealth.tsx additionally calls both RPCs with MINIMAL payloads (4 keys to
-- create, 2 to update). Those are subsets of both overloads, which is the other half of
-- the ambiguity.
--
-- ── Why no compatibility wrappers are needed ────────────────────────────────────────
-- Every parameter except the first carries a DEFAULT. PostgREST resolves a named-argument
-- call against the single remaining candidate whenever the payload's keys are a SUBSET of
-- its parameters. Every observed payload satisfies that:
--   create: 4-key (OpsHealth) and 14-key (service)  -> the 14-arg canonical
--   update: 2-key (OpsHealth) and 9-key (service)   -> the 9-arg canonical
-- The dropped overloads' own key sets are also subsets, so no caller can be stranded and
-- no wrapper carrying independent logic is created (ruling point 6).
--
-- ── Behavioural baseline ────────────────────────────────────────────────────────────
-- bf0ea670 is the baseline: it RAISES on invalid input rather than returning
-- {success:false}, validates every line BEFORE deleting any, enforces bounds, and
-- maintains remaining_balance. OpsHealth depends on exactly that — it asserts the call
-- errors AND that a line named 'Original Line - DO NOT DELETE' survives a failed update.
-- 11aa2e7d returns a jsonb error instead of raising, so it fails that assertion.
--
-- ── Authorisation (ruling points 3 and 4) ───────────────────────────────────────────
-- Accountant: organisation membership AND the invoice capability.
-- Portal:     active portal access to the owning entity AND allow_invoice_create.
-- Portal authority extends only to creating and editing DRAFT invoices for that entity;
-- approval, posting, voiding and payment recording live in other RPCs and are untouched.
--
-- >>> REVIEW NOTE — deliberate tightening. The live update overloads require only
-- >>> organisation membership. Per the ruling, the canonical update now also requires
-- >>> can_create_invoices. An accountant who is a member but lacks that capability could
-- >>> previously edit drafts and no longer can. Flagging explicitly: this is the one
-- >>> behaviour change that is not a strict repair.
-- =====================================================================================

-- 1. Canonical CREATE — the existing 14-argument signature, with the portal branch merged.
--    Based on live body 0be3f28b792b123a20c229a8fe5a1fae, changed only where marked.
CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_invoice_type text DEFAULT 'SALES'::text,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_contact_name text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text,
  p_invoice_number text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text,
  p_issue_date text DEFAULT NULL::text,
  p_due_date text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_currency text DEFAULT 'GBP'::text,
  p_lines jsonb DEFAULT '[]'::jsonb
)
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
  v_is_portal boolean := false;
BEGIN
  -- Preserved from the live body. Nothing reads app.rpc any more (is_rpc_context() was
  -- dropped and the policies that read it are constant false), but it is kept so this
  -- function stays byte-consistent with the other repaired RPCs. Removing the dead
  -- mechanism everywhere is a separate, deliberate decision.
  PERFORM set_config('app.rpc', '1', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_entity_type NOT IN ('client', 'company') THEN
    RAISE EXCEPTION 'Invalid entity_type' USING ERRCODE = '22023';
  END IF;

  -- CHANGED: portal branch merged in, so the security difference between the two create
  -- overloads is resolved in favour of supporting the capability, not dropping it.
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

  -- CHANGED: the entity must belong to the organization. Taken from the other overload —
  -- without it a caller could attach an invoice to another tenant's client.
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
      WHERE p_entity_type = 'client' AND id = p_entity_id AND organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.companies
      WHERE p_entity_type = 'company' AND id = p_entity_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Entity does not belong to organization' USING ERRCODE = '42501';
  END IF;

  -- CHANGED: a supplied customer must belong to the same organization (ruling point 2,
  -- "reject invalid customer, invoice and line relationships").
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
     WHERE id = p_customer_id AND organization_id = p_organization_id
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
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number),
        ERRCODE = '22023';
    END IF;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: quantity must be > 0', v_line_number), ERRCODE = '22023';
    END IF;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: unit_price must be >= 0', v_line_number), ERRCODE = '22023';
    END IF;
    IF v_vat_rate < 0 OR v_vat_rate > 100 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Invalid line %s: vat_rate must be between 0 and 100', v_line_number), ERRCODE = '22023';
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

-- 2. Canonical UPDATE — NEW nine-argument signature (the union the client already sends).
--    Based on live body bf0ea670da8f4adcabac6d6b624e5624, plus p_notes and the portal branch.
CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(
  p_invoice_id uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_contact_name text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text,
  p_issue_date text DEFAULT NULL::text,
  p_due_date text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_lines jsonb DEFAULT NULL::jsonb
)
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

  -- CHANGED: portal branch merged in. Scoped to THIS invoice's owning entity, so a portal
  -- user cannot reach another client's invoice (ruling point 4).
  v_is_portal := public.portal_has_perm(
    v_invoice.client_id, v_invoice.company_id, 'allow_invoice_create');

  IF NOT v_is_portal THEN
    IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;
    -- REVIEW NOTE: this capability check is new for update — see the header.
    IF NOT public.can_create_invoices(v_user_id, v_invoice.organization_id) THEN
      RAISE EXCEPTION 'Permission denied: cannot edit invoices' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_invoice.status != 'DRAFT' THEN
    RAISE EXCEPTION 'Can only edit DRAFT invoices' USING ERRCODE = '42501';
  END IF;

  -- CHANGED: a supplied customer must belong to the invoice's organization.
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
     WHERE id = p_customer_id AND organization_id = v_invoice.organization_id
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
    -- CHANGED: p_notes, absent from this overload and present in the other. Its absence
    -- is half the reason the client's payload matched neither candidate.
    notes         = COALESCE(p_notes, notes),
    updated_at    = now()
  WHERE id = p_invoice_id;

  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    -- PHASE 1 — validate every line before anything is destroyed. OpsHealth asserts that
    -- a failed update leaves the existing lines intact.
    v_line_number := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_number := v_line_number + 1;
      v_quantity := public.try_parse_numeric(v_line->>'quantity');
      v_unit_price := public.try_parse_numeric(v_line->>'unit_price');
      v_vat_rate := COALESCE(public.try_parse_numeric(v_line->>'vat_rate'), 0);

      IF v_quantity IS NULL OR v_unit_price IS NULL THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: quantity or unit_price is missing/invalid', v_line_number),
          ERRCODE = '22023';
      END IF;
      IF v_quantity <= 0 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: quantity must be > 0', v_line_number), ERRCODE = '22023';
      END IF;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: unit_price must be >= 0', v_line_number), ERRCODE = '22023';
      END IF;
      IF v_vat_rate < 0 OR v_vat_rate > 100 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Invalid line %s: vat_rate must be between 0 and 100', v_line_number), ERRCODE = '22023';
      END IF;

      v_validated_lines := array_append(v_validated_lines, v_line);
    END LOOP;

    -- PHASE 2 — only now is it safe to mutate.
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

-- 3. Drop the superseded overloads, by COMPLETE signature.
--    Order matters: the canonical functions above are created first, so there is no window
--    in which the operation is unavailable. Both dropped key-sets are subsets of a
--    canonical signature, so every existing payload still resolves (see the header).
DROP FUNCTION IF EXISTS public.create_invoice_draft_safe(
  uuid, text, uuid, text, uuid, text, text, text, date, date, text, text, jsonb);

DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, date, date, text, jsonb);

DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, jsonb);

-- 4. Grants. Replaced here explicitly rather than relied upon: CREATE OR REPLACE keeps a
--    function's existing ACL, but the nine-argument update is a NEW function and starts
--    with only the default PUBLIC EXECUTE. Stated deliberately so it is reviewed, not
--    inherited (cf. DEF-015, where an unreviewed default grant put a helper on the
--    anon-executable list).
REVOKE ALL ON FUNCTION public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_draft_safe(
  uuid, uuid, text, text, text, text, text, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_invoice_draft_safe(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_draft_safe(
  uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb) TO authenticated, service_role;
