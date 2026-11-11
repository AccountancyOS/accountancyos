BEGIN;

DO $mig$
DECLARE
  v_bad int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_status_check' AND conrelid = 'public.bills'::regclass
  ) THEN
    RAISE EXCEPTION 'DEF-026 precondition failed: constraint bills_status_check is not present on public.bills.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bills_status_check'
      AND conrelid = 'public.bills'::regclass
      AND pg_get_constraintdef(oid) LIKE '%APPROVED%'
  ) THEN
    RAISE EXCEPTION 'DEF-026 precondition failed: bills_status_check already permits APPROVED — refusing to re-apply.';
  END IF;

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

ALTER TABLE public.bills DROP CONSTRAINT bills_status_check;

ALTER TABLE public.bills ADD CONSTRAINT bills_status_check
  CHECK (status IN ('DRAFT','APPROVED','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED'));

DO $mig$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_col     text;
BEGIN
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

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'billing_address'
  ) THEN
    RAISE EXCEPTION 'DEF-027 precondition failed: customers.billing_address already exists — the schema is not as audited.';
  END IF;
END $mig$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'GBP';

COMMENT ON COLUMN public.customers.company_name IS
  'Legal or trading name of the entity being invoiced, where it differs from the contact name in `name`. DEF-027.';
COMMENT ON COLUMN public.customers.default_currency IS
  'ISO 4217 code used to populate the currency of new invoices for this customer. DEF-027.';

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

  IF p_entity_type IS NULL OR p_entity_type NOT IN ('client', 'company') THEN
    RAISE EXCEPTION 'Invalid entity_type: expected ''client'' or ''company''' USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer name required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
      WHERE p_entity_type = 'client' AND id = p_entity_id AND organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.companies
      WHERE p_entity_type = 'company' AND id = p_entity_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Entity does not belong to organization' USING ERRCODE = '42501';
  END IF;

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

REVOKE ALL ON FUNCTION public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_safe(uuid, text, uuid, text, text, text, jsonb, text, text, integer, text, text) TO authenticated, service_role;

DO $mig$
DECLARE
  v_def text;
  v_src text;
BEGIN
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

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='customers' AND column_name='company_name') THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: customers.company_name is absent.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='customers' AND column_name='default_currency') THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: customers.default_currency is absent.';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'create_customer_safe' AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: create_customer_safe is absent.';
  END IF;
  IF v_src ~ '\mbilling_address\M' OR v_src ~ '\minternal_notes\M' THEN
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

  IF (SELECT count(*) FROM pg_proc
      WHERE proname = 'create_customer_safe' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'DEF-027 post-assert failed: expected exactly one create_customer_safe signature, found %.',
      (SELECT count(*) FROM pg_proc WHERE proname='create_customer_safe' AND pronamespace='public'::regnamespace);
  END IF;

  RAISE NOTICE 'DEF-026 + DEF-027 post-assertions passed.';
END $mig$;

COMMIT;