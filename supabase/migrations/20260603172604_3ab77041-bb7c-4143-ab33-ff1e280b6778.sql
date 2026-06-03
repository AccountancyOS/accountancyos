-- 1) Fix AML auto-verify trigger to use canonical 'verified' status
CREATE OR REPLACE FUNCTION public.auto_verify_aml_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    IF COALESCE(NEW.aml_status,'') NOT IN ('verified','failed','manual_review') THEN
      NEW.aml_status := 'verified';
    END IF;
    IF NEW.aml_verified_at IS NULL THEN
      NEW.aml_verified_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Replace lifecycle_approve_onboarding with a version that matches the live jobs schema
CREATE OR REPLACE FUNCTION public.lifecycle_approve_onboarding(p_onboarding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Create or reuse engagements and jobs from quote lines
  IF v_onboarding.quote_id IS NOT NULL THEN
    FOR v_quote_line IN
      SELECT ql.*, sc.code AS service_code, sc.name AS service_name,
             sc.trigger_date_type, sc.trigger_date_offset_days, sc.information_request_template_id
      FROM quote_lines ql
      LEFT JOIN services_catalog sc ON sc.id = ql.service_id
      WHERE ql.quote_id = v_onboarding.quote_id
    LOOP
      -- Reuse engagement when one already exists for this quote + service
      SELECT id INTO v_engagement_id
      FROM engagements
      WHERE quote_id = v_onboarding.quote_id
        AND service_id = v_quote_line.service_id
      LIMIT 1;

      IF v_engagement_id IS NULL THEN
        INSERT INTO engagements (
          organization_id, client_id, company_id, quote_id, service_id,
          frequency, start_date, status, activated_at, active
        )
        VALUES (
          v_onboarding.organization_id, v_client_id, v_company_id, v_onboarding.quote_id,
          v_quote_line.service_id,
          CASE WHEN v_quote_line.billing_frequency = 'monthly' THEN 'monthly' ELSE 'one_off' END,
          CURRENT_DATE, 'active', now(), true
        )
        RETURNING id INTO v_engagement_id;
      END IF;
      v_engagement_ids := array_append(v_engagement_ids, v_engagement_id);

      v_period_label := EXTRACT(YEAR FROM CURRENT_DATE)::text;

      -- Reuse job when one already exists for this entity + service + period
      SELECT id INTO v_job_id
      FROM jobs
      WHERE organization_id = v_onboarding.organization_id
        AND service_type = COALESCE(v_quote_line.service_code, v_quote_line.service_id::text)
        AND COALESCE(client_id::text, '') = COALESCE(v_client_id::text, '')
        AND COALESCE(company_id::text, '') = COALESCE(v_company_id::text, '')
        AND COALESCE(period_label, '') = v_period_label
      LIMIT 1;

      IF v_job_id IS NULL THEN
        INSERT INTO jobs (
          organization_id, client_id, company_id,
          job_name, name, service_type, period_label,
          status, priority,
          automation_source, is_auto_generated, auto_generated_at, generation_reason
        )
        VALUES (
          v_onboarding.organization_id, v_client_id, v_company_id,
          COALESCE(v_quote_line.service_name, 'Service') || ' - ' || v_period_label,
          COALESCE(v_quote_line.service_name, 'Service') || ' - ' || v_period_label,
          COALESCE(v_quote_line.service_code, v_quote_line.service_id::text),
          v_period_label,
          'blank', 'normal',
          'template', true, now(),
          'onboarding_approval:' || p_onboarding_id::text
        )
        RETURNING id INTO v_job_id;
      END IF;
      v_job_ids := array_append(v_job_ids, v_job_id);

      -- Optional trigger-based information request email
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

      INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
      VALUES (v_onboarding.organization_id, 'engagement', v_engagement_id, 'created', auth.uid(),
        jsonb_build_object('onboarding_id', p_onboarding_id, 'service_id', v_quote_line.service_id));
    END LOOP;
  END IF;

  -- Update onboarding application (trigger will set aml_status='verified' if needed)
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
  IF v_primary_email IS NOT NULL AND v_primary_email != '' THEN
    BEGIN
      v_portal_access_result := lifecycle_grant_portal_access(v_entity_type, v_entity_id, v_primary_email, 'primary_contact');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
      VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'portal_access_failed', auth.uid(),
        jsonb_build_object('error', SQLERRM, 'email', v_primary_email));
      v_portal_access_result := jsonb_build_object('error', SQLERRM);
    END;
  ELSE
    v_portal_access_result := jsonb_build_object('skipped', true, 'reason', 'no_email');
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