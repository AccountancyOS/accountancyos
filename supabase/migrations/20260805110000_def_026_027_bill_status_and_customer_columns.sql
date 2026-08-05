-- =====================================================================================
-- DEF-026 + DEF-027 — two write paths that have never worked on LIVE.
-- =====================================================================================
-- Both were found while verifying the DEF-001/DEF-002 release. Neither is caused by that
-- release: both are pre-existing defects in the committed bodies, exposed only once the
-- 42883 context failure stopped masking them.
--
-- ---------------------------------------------------------------------------------
-- DEF-026 — bill approval violates bills_status_check (23514).
-- ---------------------------------------------------------------------------------
-- approve_bill_safe writes status 'APPROVED'. bills_status_check permits only
-- ('DRAFT','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED'). Every approval has
-- therefore failed since the state was introduced.
--
-- This is a HALF-APPLIED DESIGN CHANGE, not a typo. Migration 20251217171128 says in terms:
-- "Approve bill: No p_user_id, use auth.uid(), set status to APPROVED (not AWAITING_PAYMENT)".
-- The intent was to introduce a distinct approved-but-unpaid state. The function was changed;
-- the constraint never was.
--
-- The rest of the system already assumes APPROVED exists:
--   * record_bill_payment_safe accepts status IN ('APPROVED','AWAITING_PAYMENT','PART_PAID')
--     — both in 20251217224432 and in the current 20260731210000 body;
--   * 20251217171128 records reverse_bill_payment returning a bill AWAITING_PAYMENT -> APPROVED.
--
-- So the coherent repair is to widen the constraint to match the intended lifecycle, NOT to
-- make approve_bill_safe write AWAITING_PAYMENT. Writing AWAITING_PAYMENT would strand
-- record_bill_payment_safe's APPROVED branch as dead code and contradict the reversal path.
--
-- Canonical bill lifecycle after this migration:
--     DRAFT -> APPROVED -> (payment) -> PART_PAID -> PAID
--                       -> OVERDUE
--     any non-draft   -> VOIDED
-- AWAITING_PAYMENT is RETAINED: it is the pre-December name for the approved-unpaid state and
-- existing rows may still carry it. It is not removed here because that would be a data
-- migration with no evidenced need — the two are treated as equivalent by every payment path.
--
-- ACCOUNTING IMPACT — checked, none. sync_bill_aged_balance drives amount_paid and
-- remaining_balance from bill_payments and credit_note_allocations regardless of status, and
-- its status transition excludes only ('voided','void','draft','cancelled'). An APPROVED bill
-- is therefore aged and transitions to PART_PAID/PAID exactly as an AWAITING_PAYMENT one does.
-- Widening the constraint adds a state; it does not move any figure.
--
-- NO EXISTING ROW CAN VIOLATE the widened constraint: it is a strict superset of the current
-- one, and 'APPROVED' has never been writable, so no row holds it. The migration asserts this
-- rather than assuming it.
--
-- ---------------------------------------------------------------------------------
-- DEF-027 — customer creation inserts four columns that do not exist (42703).
-- ---------------------------------------------------------------------------------
-- create_customer_safe inserts billing_address, company_name, default_currency and
-- internal_notes. public.customers (20251205112122) has none of them. Customer creation via
-- the safe RPC has never worked.
--
-- The four are NOT equivalent and are not repaired the same way. The caller
-- (src/lib/customer-safe-service.ts) sends billing_address as
-- {line1, line2, city, postcode, country} — which is precisely the shape of the table's
-- existing address_line_1 / address_line_2 / city / postcode / country columns. So:
--
--   billing_address (jsonb) -> MAPPED onto the existing structured columns. Adding a jsonb
--     address column beside them would create two sources of truth for one customer's address,
--     which is exactly what the filing-engine architecture forbids: a customer address feeds
--     invoice projections, and a projection cannot have two roots.
--   internal_notes         -> MAPPED onto the existing `notes` column. Same concept, different name.
--   company_name           -> COLUMN ADDED. Genuinely absent, and genuinely distinct from `name`:
--     a customer contact's name is not the legal/trading entity being invoiced.
--   default_currency       -> COLUMN ADDED. Genuinely absent. Invoices already carry a currency;
--     this is the per-customer default that populates it.
--
-- TWO FURTHER DEFECTS in the same body, repaired here because leaving them would ship a
-- function that is merely differently broken:
--
--   1. p_entity_type is never validated. customers_entity_check requires exactly one of
--      client_id / company_id to be NOT NULL. The body sets them from
--      CASE WHEN p_entity_type = 'client' ... / = 'company' ..., so ANY other value leaves both
--      NULL and raises 23514 with no useful message. create_invoice_draft_safe validates this
--      input; this one does not. Now it does, raising 22023 naming the field.
--   2. NO TENANCY CHECK ON THE ENTITY. The body checks the caller belongs to p_organization_id
--      but never checks that p_entity_id does. A member of org A could create a customer
--      attached to org B's client. create_invoice_draft_safe carries exactly this check
--      ("Entity does not belong to organization"); create_customer_safe was missing it. This is
--      a cross-tenant write and is closed here.
--
-- SCOPE. One CHECK constraint replaced, two columns added, one function body re-issued. No
-- grant, policy, trigger or index is altered. No data is modified.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  DEF-026 — preconditions
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_bad int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_status_check' AND conrelid = 'public.bills'::regclass
  ) THEN
    RAISE EXCEPTION 'DEF-026 precondition failed: constraint bills_status_check is not present on public.bills.';
  END IF;

  -- Reproduce the defect: 'APPROVED' must currently be rejected. If it is already permitted,
  -- this migration has been applied or superseded and must not run again.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bills_status_check'
      AND conrelid = 'public.bills'::regclass
      AND pg_get_constraintdef(oid) LIKE '%APPROVED%'
  ) THEN
    RAISE EXCEPTION 'DEF-026 precondition failed: bills_status_check already permits APPROVED — refusing to re-apply.';
  END IF;

  -- The widened set must be a superset: no existing row may fall outside it.
  SELECT count(*) INTO v_bad
  FROM public.bills
  WHERE status IS NOT NULL
    AND status NOT IN ('DRAFT','APPROVED','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED');

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'DEF-026 precondition failed: % bill row(s) hold a status outside the canonical set; widening would not cover them. Investigate before proceeding.',
      v_bad;
  END IF;
END $mig$;

-- -------------------------------------------------------------------------------------
-- §2  DEF-026 — widen the constraint to the intended lifecycle
-- -------------------------------------------------------------------------------------

ALTER TABLE public.bills DROP CONSTRAINT bills_status_check;

ALTER TABLE public.bills ADD CONSTRAINT bills_status_check
  CHECK (status IN ('DRAFT','APPROVED','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED'));

-- -------------------------------------------------------------------------------------
-- §3  DEF-027 — preconditions
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_col     text;
BEGIN
  -- The columns the body maps ONTO must all exist, or the repair is built on sand.
  FOREACH v_col IN ARRAY ARRAY['address_line_1','address_line_2','city','postcode','country','notes','name','vat_number','payment_terms_days'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = v_col
    ) THEN
      v_missing := v_missing || v_col;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'DEF-027 precondition failed: public.customers is missing expected column(s): %. The mapping in this migration would not land.',
      array_to_string(v_missing, ', ');
  END IF;

  -- Reproduce the defect: the four columns the current body inserts must genuinely be absent.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'billing_address'
  ) THEN
    RAISE EXCEPTION 'DEF-027 precondition failed: customers.billing_address already exists — the schema is not as audited.';
  END IF;
END $mig$;

-- -------------------------------------------------------------------------------------
-- §4  DEF-027 — add the two columns that have no canonical home
-- -------------------------------------------------------------------------------------
-- billing_address and internal_notes are deliberately NOT added; they are mapped in §5.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'GBP';

COMMENT ON COLUMN public.customers.company_name IS
  'Legal or trading name of the entity being invoiced, where it differs from the contact name in `name`. DEF-027.';
COMMENT ON COLUMN public.customers.default_currency IS
  'ISO 4217 code used to populate the currency of new invoices for this customer. DEF-027.';

-- -------------------------------------------------------------------------------------
-- §5  DEF-027 — re-issue create_customer_safe
-- -------------------------------------------------------------------------------------
-- The signature is UNCHANGED: the caller in src/lib/customer-safe-service.ts keeps working
-- untouched, and no overload is created. Only the body changes.

CREATE OR REPLACE FUNCTION public.create_customer_safe(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_name text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_billing_address jsonb DEFAULT NULL::jsonb,
  p_company_name text DEFAULT NULL::text,
  p_vat_number text DEFAULT NULL::text,
  p_payment_terms_days integer DEFAULT 30,
  p_default_currency text DEFAULT 'GBP'::text,
  p_internal_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid;
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

  -- DEF-027: p_entity_type was never validated. An unexpected value left both client_id and
  -- company_id NULL and surfaced as an opaque customers_entity_check violation.
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('client', 'company') THEN
    RAISE EXCEPTION 'Invalid entity_type: expected ''client'' or ''company''' USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer name required');
  END IF;

  -- DEF-027: cross-tenant write. The caller's membership of p_organization_id was checked, but
  -- p_entity_id's ownership was not — so a customer could be attached to another tenant's
  -- client or company. Same shape as the check in create_invoice_draft_safe.
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
      WHERE p_entity_type = 'client' AND id = p_entity_id AND organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.companies
      WHERE p_entity_type = 'company' AND id = p_entity_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Entity does not belong to organization' USING ERRCODE = '42501';
  END IF;

  -- DEF-027: billing_address is a transport shape, not a storage model. It is decomposed onto
  -- the canonical address columns so a customer address has exactly one root.
  INSERT INTO public.customers (
    organization_id, client_id, company_id,
    name, email, phone,
    address_line_1, address_line_2, city, postcode, country,
    company_name, vat_number, payment_terms_days, default_currency, notes
  ) VALUES (
    p_organization_id,
    CASE WHEN p_entity_type = 'client'  THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    trim(p_name), p_email, p_phone,
    NULLIF(p_billing_address->>'line1', ''),
    NULLIF(p_billing_address->>'line2', ''),
    NULLIF(p_billing_address->>'city', ''),
    NULLIF(p_billing_address->>'postcode', ''),
    COALESCE(NULLIF(p_billing_address->>'country', ''), 'United Kingdom'),
    p_company_name,
    p_vat_number,
    COALESCE(p_payment_terms_days, 30),
    COALESCE(NULLIF(p_default_currency, ''), 'GBP'),
    p_internal_notes
  ) RETURNING id INTO v_customer_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (p_organization_id, 'customer', v_customer_id, 'created', v_user_id);

  RETURN jsonb_build_object('success', true, 'customer_id', v_customer_id);
END;
$function$;

-- Privileges restated explicitly — CREATE OR REPLACE preserves them, but the release
-- convention requires them to be visible in the file rather than inherited silently.
REVOKE ALL ON FUNCTION public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- §6  POST-ASSERTIONS — self-verifying; a partial apply aborts the transaction.
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_def text;
  v_src text;
BEGIN
  -- DEF-026: the widened constraint is present and covers the full canonical set.
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conname = 'bills_status_check' AND conrelid = 'public.bills'::regclass;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'DEF-026 post-assert failed: bills_status_check is absent after the rewrite.';
  END IF;

  FOREACH v_src IN ARRAY ARRAY['DRAFT','APPROVED','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED'] LOOP
    IF v_def NOT LIKE '%' || v_src || '%' THEN
      RAISE EXCEPTION 'DEF-026 post-assert failed: bills_status_check does not permit %. Definition: %', v_src, v_def;
    END IF;
  END LOOP;

  -- DEF-027: both columns landed.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='customers' AND column_name='company_name') THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: customers.company_name is absent.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='customers' AND column_name='default_currency') THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: customers.default_currency is absent.';
  END IF;

  -- DEF-027: the body no longer inserts any column that does not exist.
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'create_customer_safe' AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: create_customer_safe is absent.';
  END IF;
  IF v_src LIKE '%billing_address,%' OR v_src LIKE '%internal_notes%' THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: the body still names a column that does not exist on public.customers.';
  END IF;
  IF v_src NOT LIKE '%address_line_1%' THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: the billing address is no longer decomposed onto the canonical columns.';
  END IF;
  IF v_src NOT LIKE '%Entity does not belong to organization%' THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: the cross-tenant entity check is missing.';
  END IF;
  IF v_src NOT LIKE '%Invalid entity_type%' THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: entity_type validation is missing.';
  END IF;

  -- Exactly one signature: no overload was created.
  IF (SELECT count(*) FROM pg_proc
      WHERE proname = 'create_customer_safe' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: expected exactly one create_customer_safe signature, found %.',
      (SELECT count(*) FROM pg_proc WHERE proname='create_customer_safe' AND pronamespace='public'::regnamespace);
  END IF;

  RAISE NOTICE 'DEF-026 + DEF-027 post-assertions passed.';
END $mig$;

COMMIT;
