-- =====================================================================================
-- Proposal Phase 2 T2b — SPLIT the onboarding activation gate.
-- =====================================================================================
-- Resolved spec decisions #1/#9: signature-rule completion controls activation; billing
-- is a separate, NON-BLOCKING onboarding step. Extend (not fork) the existing functions.
--
-- Based BYTE-FOR-BYTE on the LIVE bodies (fetched via MCP catalog_functions 2026-07-27,
-- token valid), reproduced verbatim except the changes noted:
--   lifecycle_onboarding_gates            live def-hash e7e9cee6763b68370f095ff985aa6373
--   lifecycle_approve_onboarding          live def-hash 237ff25e91bc06c368195f983a2c355e
--   lifecycle_evaluate_onboarding_activation  live def-hash 27affae53bb0f92cf6ffffd15e21effa
--
-- Changes:
--  (A) lifecycle_onboarding_gates: `engagement_letter_signed` now honours the SIGNATURE
--      RULE over engagement_letter_signatories (Phase 2 T2a) — 'all' = every required row
--      signed; 'any' = >=1 required row signed — with a legacy single-signer fallback when
--      no signatory rows exist. New top-level key `activation_ready` = all_pass MINUS
--      billing_settled. `all_pass` and `billing_settled` kept unchanged for back-compat.
--  (B) lifecycle_approve_onboarding: the canonical gate refusal now keys on
--      `activation_ready` (was `all_pass`) — billing no longer blocks activation.
--  (C) lifecycle_evaluate_onboarding_activation: same, reads `activation_ready`.
-- =====================================================================================

-- (A) -----------------------------------------------------------------------------------
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
  v_sig_rule         text;
  v_req_total        int := 0;
  v_req_signed       int := 0;
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
  SELECT el.id, el.signing_rule INTO v_letter_id, v_sig_rule
    FROM public.engagement_letters el
   WHERE el.onboarding_application_id = p_application_id
   ORDER BY el.created_at DESC
   LIMIT 1;

  IF v_letter_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.engagement_letter_signatories s
        WHERE s.engagement_letter_id = v_letter_id AND s.required
     ) THEN
    SELECT count(*) FILTER (WHERE required),
           count(*) FILTER (WHERE required AND signed_at IS NOT NULL)
      INTO v_req_total, v_req_signed
      FROM public.engagement_letter_signatories
     WHERE engagement_letter_id = v_letter_id;
    v_el_signed := CASE
      WHEN COALESCE(v_sig_rule, 'all') = 'any' THEN v_req_signed >= 1
      ELSE (v_req_total > 0 AND v_req_signed = v_req_total)
    END;
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

-- (C) -----------------------------------------------------------------------------------
-- Reproduced verbatim from live (27affae5) except: v_all_pass now reads 'activation_ready'.
CREATE OR REPLACE FUNCTION public.lifecycle_evaluate_onboarding_activation(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  a          public.onboarding_applications%ROWTYPE;
  v_flag     boolean;
  v_gates    jsonb;
  v_all_pass boolean;
  v_approve  jsonb;
BEGIN
  SELECT * INTO a FROM public.onboarding_applications WHERE id = p_application_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found: %', p_application_id;
  END IF;

  IF NOT public.user_has_organization_access(a.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization' USING ERRCODE='42501';
  END IF;

  v_flag     := public.is_canonical_lifecycle_enabled(a.organization_id);
  v_gates    := public.lifecycle_onboarding_gates(p_application_id);
  -- T2b: activation is driven by signatures/AML/submission (activation_ready), NOT billing.
  v_all_pass := COALESCE((v_gates->>'activation_ready')::boolean, false);

  IF NOT v_flag THEN
    RETURN jsonb_build_object('mode', 'dry_run', 'flag', false,
                              'would_activate', v_all_pass, 'gates', v_gates);
  END IF;

  IF a.status IN ('approved','rejected','cancelled') THEN
    RETURN jsonb_build_object('mode', 'noop_closed', 'status', a.status, 'gates', v_gates);
  END IF;

  IF NOT v_all_pass THEN
    UPDATE public.onboarding_applications
       SET status = 'for_review',
           review_feedback = COALESCE(review_feedback, '') ||
             CASE WHEN COALESCE(review_feedback,'') = '' THEN '' ELSE E'\n' END ||
             'Auto-evaluation outstanding gates: ' || (v_gates->>'outstanding'),
           updated_at = now()
     WHERE id = p_application_id;
    RETURN jsonb_build_object('mode', 'routed_to_review', 'gates', v_gates);
  END IF;

  IF a.application_type = 'company' AND a.company_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accountant_client_links
      WHERE practice_id = a.organization_id AND company_id = a.company_id AND status = 'active'
    ) THEN
      INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
      VALUES (a.organization_id, a.company_id, 'active', 'practice', now());
    END IF;
  ELSIF a.client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accountant_client_links
      WHERE practice_id = a.organization_id AND client_id = a.client_id AND status = 'active'
    ) THEN
      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (a.organization_id, a.client_id, 'active', 'practice', now());
    END IF;
  END IF;

  v_approve := public.lifecycle_approve_onboarding(p_application_id);

  RETURN jsonb_build_object('mode', 'activated', 'gates', v_gates, 'approve', v_approve);
END;
$function$;

-- (B) -----------------------------------------------------------------------------------
-- Reproduced verbatim from live (237ff25e) except: the canonical gate refusal now keys on
-- 'activation_ready' (was 'all_pass'), and the error text says "activation gates".
CREATE OR REPLACE FUNCTION public.lifecycle_approve_onboarding(p_onboarding_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_onboarding record;
  v_questionnaire_instance record;
  v_questionnaire_responses jsonb;
  v_client_id uuid;
  v_company_id uuid;
  v_engagement_ids uuid[] := ARRAY[]::uuid[];
  v_job_ids uuid[] := ARRAY[]::uuid[];
  v_engagement_id uuid;
  v_job_id uuid;
  v_portal_access_result jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_quote_line record;
  v_trigger_date date;
  v_aml_expiry_date date;
  v_period_label text;
BEGIN
  SELECT * INTO v_onboarding FROM onboarding_applications WHERE id = p_onboarding_id;

  IF v_onboarding.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found: %', p_onboarding_id;
  END IF;

  IF NOT user_has_organization_access(v_onboarding.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  IF v_onboarding.status = 'approved' THEN
    RAISE EXCEPTION 'Onboarding application already approved';
  END IF;

  IF v_onboarding.status = 'rejected' THEN
    RAISE EXCEPTION 'Cannot approve rejected application';
  END IF;

  IF public.is_canonical_lifecycle_enabled(v_onboarding.organization_id) THEN
    DECLARE
      v_gates jsonb := public.lifecycle_onboarding_gates(p_onboarding_id);
    BEGIN
      -- T2b: gate on activation_ready (signatures/AML/submission) — billing no longer blocks.
      IF NOT COALESCE((v_gates->>'activation_ready')::boolean, false) THEN
        RAISE EXCEPTION 'Cannot approve onboarding %: outstanding activation gates %',
          p_onboarding_id, (v_gates->>'outstanding');
      END IF;
    END;
  END IF;

  v_aml_expiry_date := CURRENT_DATE + INTERVAL '5 years';

  IF v_onboarding.onboarding_questionnaire_instance_id IS NOT NULL THEN
    SELECT * INTO v_questionnaire_instance
    FROM questionnaire_instances
    WHERE id = v_onboarding.onboarding_questionnaire_instance_id;

    SELECT jsonb_object_agg(qr.question_id, qr.response_value)
    INTO v_questionnaire_responses
    FROM questionnaire_responses qr
    WHERE qr.questionnaire_instance_id = v_onboarding.onboarding_questionnaire_instance_id;
  END IF;

  IF v_onboarding.application_type = 'individual' THEN
    IF v_onboarding.client_id IS NOT NULL THEN
      v_client_id := v_onboarding.client_id;
      UPDATE clients
      SET
        status = 'active',
        activated_at = now(),
        aml_verified_at = CASE WHEN v_onboarding.aml_status = 'verified' THEN v_onboarding.aml_verified_at ELSE NULL END,
        aml_expiry_date = CASE WHEN v_onboarding.aml_status = 'verified' THEN v_aml_expiry_date ELSE NULL END,
        aml_verified_by = CASE WHEN v_onboarding.aml_status = 'verified' THEN auth.uid() ELSE NULL END,
        first_name = COALESCE(v_questionnaire_responses->>'first_name', first_name),
        last_name = COALESCE(v_questionnaire_responses->>'last_name', last_name),
        date_of_birth = COALESCE((v_questionnaire_responses->>'date_of_birth')::date, date_of_birth),
        address_line_1 = COALESCE(v_questionnaire_responses->>'address_line_1', address_line_1),
        address_line_2 = COALESCE(v_questionnaire_responses->>'address_line_2', address_line_2),
        city = COALESCE(v_questionnaire_responses->>'city', city),
        postcode = COALESCE(v_questionnaire_responses->>'postcode', postcode),
        country = COALESCE(v_questionnaire_responses->>'country', country),
        phone = COALESCE(v_questionnaire_responses->>'phone', phone),
        national_insurance_number = COALESCE(v_questionnaire_responses->>'national_insurance_number', national_insurance_number),
        utr = COALESCE(v_questionnaire_responses->>'utr', utr)
      WHERE id = v_client_id;
    ELSE
      INSERT INTO clients (
        organization_id, first_name, last_name, email, phone, date_of_birth,
        address_line_1, address_line_2, city, postcode, country,
        national_insurance_number, utr, status, activated_at,
        aml_verified_at, aml_expiry_date, aml_verified_by
      )
      VALUES (
        v_onboarding.organization_id,
        COALESCE(v_questionnaire_responses->>'first_name', v_onboarding.first_name),
        COALESCE(v_questionnaire_responses->>'last_name', v_onboarding.last_name),
        v_onboarding.email,
        COALESCE(v_questionnaire_responses->>'phone', v_onboarding.phone),
        COALESCE((v_questionnaire_responses->>'date_of_birth')::date, v_onboarding.date_of_birth),
        COALESCE(v_questionnaire_responses->>'address_line_1', v_onboarding.address_line_1),
        COALESCE(v_questionnaire_responses->>'address_line_2', v_onboarding.address_line_2),
        COALESCE(v_questionnaire_responses->>'city', v_onboarding.city),
        COALESCE(v_questionnaire_responses->>'postcode', v_onboarding.postcode),
        COALESCE(v_questionnaire_responses->>'country', v_onboarding.country),
        COALESCE(v_questionnaire_responses->>'national_insurance_number', v_onboarding.national_insurance_number),
        COALESCE(v_questionnaire_responses->>'utr', v_onboarding.utr),
        'active', now(),
        CASE WHEN v_onboarding.aml_status = 'verified' THEN v_onboarding.aml_verified_at ELSE NULL END,
        CASE WHEN v_onboarding.aml_status = 'verified' THEN v_aml_expiry_date ELSE NULL END,
        CASE WHEN v_onboarding.aml_status = 'verified' THEN auth.uid() ELSE NULL END
      )
      RETURNING id INTO v_client_id;

      UPDATE onboarding_applications SET client_id = v_client_id WHERE id = p_onboarding_id;

      INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
      VALUES (v_onboarding.organization_id, 'client', v_client_id, 'created', auth.uid(),
        jsonb_build_object('onboarding_id', p_onboarding_id, 'status', 'active', 'source', 'onboarding_approval'));
    END IF;

    v_entity_type := 'client';
    v_entity_id := v_client_id;

  ELSIF v_onboarding.application_type = 'company' THEN
    IF v_onboarding.company_id IS NOT NULL THEN
      v_company_id := v_onboarding.company_id;
      UPDATE companies
      SET
        status = 'active',
        activated_at = now(),
        aml_verified_at = CASE WHEN v_onboarding.aml_status = 'verified' THEN v_onboarding.aml_verified_at ELSE NULL END,
        aml_expiry_date = CASE WHEN v_onboarding.aml_status = 'verified' THEN v_aml_expiry_date ELSE NULL END,
        aml_verified_by = CASE WHEN v_onboarding.aml_status = 'verified' THEN auth.uid() ELSE NULL END,
        company_name = COALESCE(v_questionnaire_responses->>'company_name', company_name),
        company_number = COALESCE(v_questionnaire_responses->>'company_number', company_number),
        address_line_1 = COALESCE(v_questionnaire_responses->>'address_line_1', address_line_1),
        address_line_2 = COALESCE(v_questionnaire_responses->>'address_line_2', address_line_2),
        city = COALESCE(v_questionnaire_responses->>'city', city),
        postcode = COALESCE(v_questionnaire_responses->>'postcode', postcode),
        country = COALESCE(v_questionnaire_responses->>'country', country),
        phone = COALESCE(v_questionnaire_responses->>'phone', phone),
        vat_number = COALESCE(v_questionnaire_responses->>'vat_number', vat_number),
        incorporation_date = COALESCE((v_questionnaire_responses->>'incorporation_date')::date, incorporation_date),
        year_end_month = COALESCE((v_questionnaire_responses->>'year_end_month')::integer, year_end_month),
        year_end_day = COALESCE((v_questionnaire_responses->>'year_end_day')::integer, year_end_day)
      WHERE id = v_company_id;
    ELSE
      INSERT INTO companies (
        organization_id, company_name, company_number, email, phone,
        address_line_1, address_line_2, city, postcode, country,
        vat_number, incorporation_date, year_end_month, year_end_day,
        status, activated_at, aml_verified_at, aml_expiry_date, aml_verified_by
      )
      VALUES (
        v_onboarding.organization_id,
        COALESCE(v_questionnaire_responses->>'company_name', v_onboarding.company_name),
        COALESCE(v_questionnaire_responses->>'company_number', v_onboarding.company_number),
        v_onboarding.email,
        COALESCE(v_questionnaire_responses->>'phone', v_onboarding.phone),
        COALESCE(v_questionnaire_responses->>'address_line_1', v_onboarding.address_line_1),
        COALESCE(v_questionnaire_responses->>'address_line_2', v_onboarding.address_line_2),
        COALESCE(v_questionnaire_responses->>'city', v_onboarding.city),
        COALESCE(v_questionnaire_responses->>'postcode', v_onboarding.postcode),
        COALESCE(v_questionnaire_responses->>'country', v_onboarding.country),
        COALESCE(v_questionnaire_responses->>'vat_number', v_onboarding.vat_number),
        COALESCE((v_questionnaire_responses->>'incorporation_date')::date, v_onboarding.incorporation_date),
        COALESCE((v_questionnaire_responses->>'year_end_month')::integer, v_onboarding.year_end_month),
        COALESCE((v_questionnaire_responses->>'year_end_day')::integer, v_onboarding.year_end_day),
        'active', now(),
        CASE WHEN v_onboarding.aml_status = 'verified' THEN v_onboarding.aml_verified_at ELSE NULL END,
        CASE WHEN v_onboarding.aml_status = 'verified' THEN v_aml_expiry_date ELSE NULL END,
        CASE WHEN v_onboarding.aml_status = 'verified' THEN auth.uid() ELSE NULL END
      )
      RETURNING id INTO v_company_id;

      UPDATE onboarding_applications SET company_id = v_company_id WHERE id = p_onboarding_id;

      INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
      VALUES (v_onboarding.organization_id, 'company', v_company_id, 'created', auth.uid(),
        jsonb_build_object('onboarding_id', p_onboarding_id, 'status', 'active', 'source', 'onboarding_approval'));
    END IF;

    v_entity_type := 'company';
    v_entity_id := v_company_id;
  END IF;

  IF v_onboarding.quote_id IS NOT NULL THEN
    -- Canonical engine: the SINGLE idempotent source for engagements + jobs + deadlines.
    PERFORM public.lifecycle_materialize_jobs(
      v_onboarding.organization_id, v_client_id, v_company_id, NULL,
      v_onboarding.quote_id, 'onboarding_approval:' || p_onboarding_id::text);

    FOR v_quote_line IN
      SELECT ql.*, sc.code AS service_code, sc.name AS service_name,
             sc.trigger_date_type, sc.trigger_date_offset_days, sc.information_request_template_id
      FROM quote_lines ql
      LEFT JOIN services_catalog sc ON sc.id = ql.service_id
      WHERE ql.quote_id = v_onboarding.quote_id
    LOOP
      SELECT id INTO v_engagement_id
      FROM engagements
      WHERE quote_id = v_onboarding.quote_id AND service_id = v_quote_line.service_id
      LIMIT 1;
      IF v_engagement_id IS NOT NULL THEN
        v_engagement_ids := array_append(v_engagement_ids, v_engagement_id);
      END IF;

      SELECT id INTO v_job_id
      FROM jobs
      WHERE organization_id = v_onboarding.organization_id
        AND service_type = COALESCE(v_quote_line.service_code, v_quote_line.service_id::text)
        AND COALESCE(client_id::text, '') = COALESCE(v_client_id::text, '')
        AND COALESCE(company_id::text, '') = COALESCE(v_company_id::text, '')
      ORDER BY created_at DESC
      LIMIT 1;
      IF v_job_id IS NOT NULL THEN
        v_job_ids := array_append(v_job_ids, v_job_id);
      END IF;

      IF v_quote_line.trigger_date_type IS NOT NULL AND v_quote_line.information_request_template_id IS NOT NULL THEN
        v_trigger_date := CASE v_quote_line.trigger_date_type
          WHEN 'tax_year_end' THEN
            CASE WHEN CURRENT_DATE > make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 5)
              THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 5)
              ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 1, 4, 5)
            END
          WHEN 'financial_year_end' THEN
            CASE WHEN v_company_id IS NOT NULL THEN
              (SELECT make_date(
                CASE WHEN CURRENT_DATE > make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE(c.year_end_month, 3), COALESCE(c.year_end_day, 31))
                  THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
                  ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
                END,
                COALESCE(c.year_end_month, 3),
                COALESCE(c.year_end_day, 31)
              ) FROM companies c WHERE c.id = v_company_id)
            ELSE CURRENT_DATE - INTERVAL '1 day'
            END
          ELSE CURRENT_DATE - INTERVAL '1 day'
        END;

        IF CURRENT_DATE > v_trigger_date + (COALESCE(v_quote_line.trigger_date_offset_days,0) || ' days')::interval THEN
          INSERT INTO email_queue (
            organization_id, to_email, to_name, subject, body_html,
            template_id, client_id, company_id, job_id, entity_type, entity_id,
            merge_data, status
          )
          SELECT
            v_onboarding.organization_id,
            v_onboarding.email,
            COALESCE(v_onboarding.first_name || ' ' || v_onboarding.last_name, v_onboarding.company_name),
            COALESCE(t.name, 'Information Request') || ' - ' || COALESCE(v_quote_line.service_name,'Service'),
            COALESCE(t.content->>'body_html', '<p>We need some information to complete your ' || COALESCE(v_quote_line.service_name,'service') || '.</p>'),
            v_quote_line.information_request_template_id,
            v_client_id,
            v_company_id,
            v_job_id,
            'job',
            v_job_id,
            jsonb_build_object(
              'client_name', COALESCE(v_onboarding.first_name || ' ' || v_onboarding.last_name, v_onboarding.company_name),
              'service_name', v_quote_line.service_name,
              'trigger_date', v_trigger_date::text
            ),
            'pending'
          FROM templates t WHERE t.id = v_quote_line.information_request_template_id;

          INSERT INTO client_tasks (
            organization_id, client_id, company_id, title, description,
            status, visibility, due_date
          )
          VALUES (
            v_onboarding.organization_id, v_client_id, v_company_id,
            'Provide information for ' || COALESCE(v_quote_line.service_name,'service'),
            'Please provide the required information to complete your ' || COALESCE(v_quote_line.service_name,'service'),
            'not_started', 'client_visible',
            CURRENT_DATE + INTERVAL '14 days'
          );
        END IF;
      END IF;

      IF v_engagement_id IS NOT NULL THEN
        INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
        VALUES (v_onboarding.organization_id, 'engagement', v_engagement_id, 'created', auth.uid(),
          jsonb_build_object('onboarding_id', p_onboarding_id, 'service_id', v_quote_line.service_id));
      END IF;
    END LOOP;
  END IF;

  IF public.is_canonical_lifecycle_enabled(v_onboarding.organization_id) THEN
    IF v_company_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.accountant_client_links
                     WHERE practice_id = v_onboarding.organization_id
                       AND company_id = v_company_id AND status = 'active') THEN
        INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
        VALUES (v_onboarding.organization_id, v_company_id, 'active', 'practice', now());
      END IF;
    ELSIF v_client_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.accountant_client_links
                     WHERE practice_id = v_onboarding.organization_id
                       AND client_id = v_client_id AND status = 'active') THEN
        INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
        VALUES (v_onboarding.organization_id, v_client_id, 'active', 'practice', now());
      END IF;
    END IF;
  END IF;

  UPDATE onboarding_applications
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    aml_expiry_date = v_aml_expiry_date,
    aml_documents_migrated = true
  WHERE id = p_onboarding_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id)
  VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'approved', v_onboarding.status, 'approved', auth.uid());

  v_primary_email := v_onboarding.email;
  IF v_primary_email IS NOT NULL AND v_primary_email != '' AND v_entity_type IS NOT NULL AND v_entity_id IS NOT NULL THEN
    BEGIN
      v_portal_access_result := lifecycle_grant_portal_access(v_entity_type, v_entity_id, v_primary_email, 'primary_contact');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
      VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'portal_access_failed', auth.uid(),
        jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE, 'email', v_primary_email));
      v_portal_access_result := jsonb_build_object('ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE);
    END;
  ELSE
    v_portal_access_result := jsonb_build_object('ok', false, 'skipped', true, 'reason',
      CASE WHEN v_primary_email IS NULL OR v_primary_email = '' THEN 'no_email' ELSE 'no_entity' END);
  END IF;

  RETURN jsonb_build_object(
    'onboarding_id', p_onboarding_id,
    'status', 'approved',
    'client_id', v_client_id,
    'company_id', v_company_id,
    'engagement_ids', v_engagement_ids,
    'job_ids', v_job_ids,
    'portal_access', v_portal_access_result,
    'aml_expiry_date', v_aml_expiry_date,
    'questionnaire_data_populated', v_questionnaire_responses IS NOT NULL
  );
END;
$function$;