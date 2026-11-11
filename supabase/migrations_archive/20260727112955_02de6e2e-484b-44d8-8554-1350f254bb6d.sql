CREATE OR REPLACE FUNCTION public.el_signature_progress(p_engagement_letter_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule   text;
  v_total  int := 0;
  v_signed int := 0;
BEGIN
  IF p_engagement_letter_id IS NULL THEN
    RETURN jsonb_build_object(
      'has_signatories', false, 'signing_rule', 'all',
      'required_total', 0, 'required_signed', 0, 'satisfied', false
    );
  END IF;

  SELECT el.signing_rule INTO v_rule
    FROM public.engagement_letters el
   WHERE el.id = p_engagement_letter_id;

  -- Unknown letter id, or a NULL rule on an older row, both mean the strict default.
  v_rule := COALESCE(v_rule, 'all');

  -- Only `required` signatories count towards the rule; optional (cc'd) signatories may
  -- sign but can never hold the engagement up.
  SELECT count(*) FILTER (WHERE required),
         count(*) FILTER (WHERE required AND signed_at IS NOT NULL)
    INTO v_total, v_signed
    FROM public.engagement_letter_signatories
   WHERE engagement_letter_id = p_engagement_letter_id;

  RETURN jsonb_build_object(
    'has_signatories', (v_total > 0),
    'signing_rule',    v_rule,
    'required_total',  v_total,
    'required_signed', v_signed,
    'satisfied', CASE
      WHEN v_total = 0        THEN false
      WHEN v_rule  = 'any'    THEN v_signed >= 1
      ELSE                         v_signed = v_total
    END
  );
END;
$function$;

COMMENT ON FUNCTION public.el_signature_progress(uuid) IS
  'Single source of truth for the engagement-letter signing rule (all/any) over '
  'engagement_letter_signatories. Called by lifecycle_onboarding_gates and by the '
  'per-signatory signing RPC — never re-implement this rule inline.';

CREATE OR REPLACE FUNCTION public.lifecycle_onboarding_gates(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a                  public.onboarding_applications%ROWTYPE;
  v_el_signed        boolean := false;
  v_aml              boolean := false;
  v_billing          boolean := false;
  v_submitted        boolean := false;
  v_open             boolean := false;
  v_context          boolean := false;
  v_has_lines        boolean := false;
  v_activation_ready boolean := false;
  v_letter_id        uuid;
  v_sig              jsonb;
  v_outstanding      text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO a FROM public.onboarding_applications WHERE id = p_application_id;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('error', 'application_not_found', 'all_pass', false,
                              'activation_ready', false,
                              'outstanding', to_jsonb(ARRAY['application_not_found']));
  END IF;

  -- T2b: engagement-letter signature via the signature RULE over engagement_letter_signatories,
  -- with the legacy single-signer check as fallback when no signatory rows exist.
  -- T2d-1: the rule itself now lives in public.el_signature_progress (one implementation).
  -- Equivalence with the T2b inline block: has_signatories mirrors the previous
  -- EXISTS(required rows) branch test, and `satisfied` computes the same
  -- 'any' => signed >= 1 / 'all' => total > 0 AND signed = total over the same rows.
  SELECT el.id INTO v_letter_id
    FROM public.engagement_letters el
   WHERE el.onboarding_application_id = p_application_id
   ORDER BY el.created_at DESC
   LIMIT 1;

  v_sig := public.el_signature_progress(v_letter_id);

  IF COALESCE((v_sig->>'has_signatories')::boolean, false) THEN
    v_el_signed := COALESCE((v_sig->>'satisfied')::boolean, false);
  ELSE
    -- Legacy fallback: unchanged from the live body (signed letter + contracts_signed_at).
    v_el_signed := (
      EXISTS (
        SELECT 1 FROM public.engagement_letters el
        WHERE el.onboarding_application_id = p_application_id AND el.signed_at IS NOT NULL
      )
      AND a.contracts_signed_at IS NOT NULL
    );
  END IF;

  v_aml       := (a.aml_status = 'verified');
  v_billing   := (a.billing_status IN ('completed','skipped','not_required'));
  v_submitted := (a.submitted_for_review_at IS NOT NULL OR a.status IN ('portal_pending','for_review'));
  v_open      := (a.status NOT IN ('approved','rejected','cancelled'));

  SELECT EXISTS (SELECT 1 FROM public.quote_lines ql WHERE ql.quote_id = a.quote_id) INTO v_has_lines;
  v_context := (
    a.organization_id IS NOT NULL
    AND a.quote_id IS NOT NULL
    AND v_has_lines
    AND (a.client_id IS NOT NULL OR a.company_id IS NOT NULL
         OR a.application_type IN ('individual','company'))
  );

  IF NOT v_el_signed THEN v_outstanding := v_outstanding || 'engagement_letter_signed'; END IF;
  IF NOT v_aml       THEN v_outstanding := v_outstanding || 'aml_passed'; END IF;
  IF NOT v_billing   THEN v_outstanding := v_outstanding || 'billing_settled'; END IF;
  IF NOT v_submitted THEN v_outstanding := v_outstanding || 'onboarding_submitted'; END IF;
  IF NOT v_open      THEN v_outstanding := v_outstanding || 'not_already_closed'; END IF;
  IF NOT v_context   THEN v_outstanding := v_outstanding || 'missing_activation_context'; END IF;

  -- T2b: activation gates on signatures/AML/submission/open/context — NOT billing.
  v_activation_ready := (v_el_signed AND v_aml AND v_submitted AND v_open AND v_context);

  RETURN jsonb_build_object(
    'gates', jsonb_build_object(
      'engagement_letter_signed', v_el_signed,
      'aml_passed', v_aml,
      'billing_settled', v_billing,
      'onboarding_submitted', v_submitted,
      'not_already_closed', v_open,
      'activation_context_present', v_context
    ),
    'all_pass', (array_length(v_outstanding, 1) IS NULL),
    'activation_ready', v_activation_ready,
    'billing_settled', v_billing,
    'outstanding', to_jsonb(v_outstanding)
  );
END;
$function$;

DO $$
DECLARE
  v_attnum smallint;
  v_con    record;
BEGIN
  SELECT attnum INTO v_attnum
    FROM pg_attribute
   WHERE attrelid = 'public.engagement_letters'::regclass
     AND attname  = 'status'
     AND NOT attisdropped;

  IF v_attnum IS NULL THEN
    RAISE EXCEPTION 'public.engagement_letters.status not found — aborting rather than guessing';
  END IF;

  FOR v_con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.engagement_letters'::regclass
       AND c.contype  = 'c'
       AND c.conkey   = ARRAY[v_attnum]
  LOOP
    RAISE NOTICE 'Replacing engagement_letters status CHECK %: %', v_con.conname, v_con.def;
    EXECUTE format('ALTER TABLE public.engagement_letters DROP CONSTRAINT %I', v_con.conname);
  END LOOP;

  ALTER TABLE public.engagement_letters
    ADD CONSTRAINT engagement_letters_status_check
    CHECK (status IN ('draft', 'sent', 'partially_signed', 'signed'));
END $$;