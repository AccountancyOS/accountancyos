
-- Phase 2: Onboarding, AML & Clearance Enhancements

-- Add columns to onboarding_applications for clearance and questionnaire tracking
ALTER TABLE onboarding_applications
ADD COLUMN IF NOT EXISTS previous_accountant_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS previous_accountant_firm_name TEXT,
ADD COLUMN IF NOT EXISTS previous_accountant_email TEXT,
ADD COLUMN IF NOT EXISTS clearance_received BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS clearance_received_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS clearance_notes TEXT,
ADD COLUMN IF NOT EXISTS onboarding_questionnaire_instance_id UUID,
ADD COLUMN IF NOT EXISTS questionnaire_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS aml_expiry_date DATE,
ADD COLUMN IF NOT EXISTS aml_documents_migrated BOOLEAN DEFAULT false;

-- Add AML tracking to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS aml_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS aml_expiry_date DATE,
ADD COLUMN IF NOT EXISTS aml_verified_by UUID;

-- Add AML tracking to companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS aml_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS aml_expiry_date DATE,
ADD COLUMN IF NOT EXISTS aml_verified_by UUID;

-- Add trigger date configuration to services_catalog
ALTER TABLE services_catalog
ADD COLUMN IF NOT EXISTS trigger_date_type TEXT,
ADD COLUMN IF NOT EXISTS trigger_date_offset_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS information_request_template_id UUID;

-- Add foreign key for information_request_template_id
ALTER TABLE services_catalog
ADD CONSTRAINT services_catalog_information_request_template_id_fkey 
FOREIGN KEY (information_request_template_id) REFERENCES templates(id) ON DELETE SET NULL;

-- Add foreign key for onboarding_questionnaire_instance_id
ALTER TABLE onboarding_applications
ADD CONSTRAINT onboarding_applications_questionnaire_instance_fkey 
FOREIGN KEY (onboarding_questionnaire_instance_id) REFERENCES questionnaire_instances(id) ON DELETE SET NULL;

-- Update lifecycle_approve_onboarding function with enhanced logic
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
  v_service record;
  v_trigger_date date;
  v_job_template record;
  v_aml_expiry_date date;
  v_response record;
  v_field_value text;
BEGIN
  -- Fetch onboarding application
  SELECT * INTO v_onboarding FROM onboarding_applications WHERE id = p_onboarding_id;
  
  IF v_onboarding.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found: %', p_onboarding_id;
  END IF;

  -- Verify caller has access to organization
  IF NOT user_has_organization_access(v_onboarding.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  -- Validate status allows approval
  IF v_onboarding.status = 'approved' THEN
    RAISE EXCEPTION 'Onboarding application already approved';
  END IF;

  IF v_onboarding.status = 'rejected' THEN
    RAISE EXCEPTION 'Cannot approve rejected application';
  END IF;

  -- Calculate AML expiry (5 years from now)
  v_aml_expiry_date := CURRENT_DATE + INTERVAL '5 years';

  -- Fetch questionnaire responses if questionnaire was submitted
  IF v_onboarding.onboarding_questionnaire_instance_id IS NOT NULL THEN
    SELECT * INTO v_questionnaire_instance 
    FROM questionnaire_instances 
    WHERE id = v_onboarding.onboarding_questionnaire_instance_id;
    
    -- Build responses object from questionnaire_responses
    SELECT jsonb_object_agg(qr.question_id, qr.response_value)
    INTO v_questionnaire_responses
    FROM questionnaire_responses qr
    WHERE qr.questionnaire_instance_id = v_onboarding.onboarding_questionnaire_instance_id;
  END IF;

  -- Create client or company based on application_type
  IF v_onboarding.application_type = 'individual' THEN
    IF v_onboarding.client_id IS NOT NULL THEN
      v_client_id := v_onboarding.client_id;
      
      -- Update existing client to active with AML data
      UPDATE clients 
      SET 
        status = 'active',
        activated_at = now(),
        aml_verified_at = CASE WHEN v_onboarding.aml_status = 'verified' THEN v_onboarding.aml_verified_at ELSE NULL END,
        aml_expiry_date = CASE WHEN v_onboarding.aml_status = 'verified' THEN v_aml_expiry_date ELSE NULL END,
        aml_verified_by = CASE WHEN v_onboarding.aml_status = 'verified' THEN auth.uid() ELSE NULL END,
        -- Populate from questionnaire if available
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
      -- Create new client with questionnaire data
      INSERT INTO clients (
        organization_id,
        first_name,
        last_name,
        email,
        phone,
        date_of_birth,
        address_line_1,
        address_line_2,
        city,
        postcode,
        country,
        national_insurance_number,
        utr,
        status,
        activated_at,
        aml_verified_at,
        aml_expiry_date,
        aml_verified_by
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
        'active',
        now(),
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
        organization_id,
        company_name,
        company_number,
        email,
        phone,
        address_line_1,
        address_line_2,
        city,
        postcode,
        country,
        vat_number,
        incorporation_date,
        year_end_month,
        year_end_day,
        status,
        activated_at,
        aml_verified_at,
        aml_expiry_date,
        aml_verified_by
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
        'active',
        now(),
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

  -- Create engagements and jobs from quote lines
  IF v_onboarding.quote_id IS NOT NULL THEN
    FOR v_quote_line IN 
      SELECT ql.*, sc.code as service_code, sc.name as service_name, 
             sc.trigger_date_type, sc.trigger_date_offset_days, sc.information_request_template_id,
             sc.default_job_template_id
      FROM quote_lines ql
      LEFT JOIN services_catalog sc ON sc.id = ql.service_id
      WHERE ql.quote_id = v_onboarding.quote_id
    LOOP
      -- Create engagement
      INSERT INTO engagements (
        organization_id, client_id, company_id, quote_id, service_id,
        frequency, start_date, status, activated_at, active
      )
      VALUES (
        v_onboarding.organization_id, v_client_id, v_company_id, v_onboarding.quote_id,
        v_quote_line.service_id, v_quote_line.billing_frequency, CURRENT_DATE,
        'active', now(), true
      )
      RETURNING id INTO v_engagement_id;
      v_engagement_ids := array_append(v_engagement_ids, v_engagement_id);

      -- Create job from service
      INSERT INTO jobs (
        organization_id, client_id, company_id, engagement_id,
        name, service_type, status, priority, created_at
      )
      VALUES (
        v_onboarding.organization_id, v_client_id, v_company_id, v_engagement_id,
        v_quote_line.service_name || ' - ' || EXTRACT(YEAR FROM CURRENT_DATE)::text,
        v_quote_line.service_code, 'not_started', 'medium', now()
      )
      RETURNING id INTO v_job_id;
      v_job_ids := array_append(v_job_ids, v_job_id);

      -- Check trigger date and queue info request email if needed
      IF v_quote_line.trigger_date_type IS NOT NULL AND v_quote_line.information_request_template_id IS NOT NULL THEN
        -- Calculate trigger date based on type
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

        -- If trigger date has passed, queue information request email
        IF CURRENT_DATE > v_trigger_date + (v_quote_line.trigger_date_offset_days || ' days')::interval THEN
          INSERT INTO email_queue (
            organization_id, to_email, to_name, subject, body_html,
            template_id, client_id, company_id, job_id, entity_type, entity_id,
            merge_data, status
          )
          SELECT
            v_onboarding.organization_id,
            v_onboarding.email,
            COALESCE(v_onboarding.first_name || ' ' || v_onboarding.last_name, v_onboarding.company_name),
            COALESCE(t.name, 'Information Request') || ' - ' || v_quote_line.service_name,
            COALESCE(t.content->>'body_html', '<p>We need some information to complete your ' || v_quote_line.service_name || '.</p>'),
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

          -- Create client task for providing information
          INSERT INTO client_tasks (
            organization_id, client_id, company_id, title, description,
            status, visibility, due_date
          )
          VALUES (
            v_onboarding.organization_id, v_client_id, v_company_id,
            'Provide information for ' || v_quote_line.service_name,
            'Please provide the required information to complete your ' || v_quote_line.service_name,
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

  -- Update onboarding application status
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

  -- Grant portal access
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

-- Create function to send onboarding questionnaire
CREATE OR REPLACE FUNCTION public.send_onboarding_questionnaire(
  p_onboarding_id uuid,
  p_template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_onboarding record;
  v_template record;
  v_instance_id uuid;
  v_access_token text;
BEGIN
  SELECT * INTO v_onboarding FROM onboarding_applications WHERE id = p_onboarding_id;
  
  IF v_onboarding.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found';
  END IF;
  
  IF NOT user_has_organization_access(v_onboarding.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  SELECT * INTO v_template FROM templates WHERE id = p_template_id AND template_type = 'questionnaire';
  
  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'Questionnaire template not found';
  END IF;
  
  -- Generate access token
  v_access_token := encode(gen_random_bytes(32), 'base64');
  
  -- Create questionnaire instance
  INSERT INTO questionnaire_instances (
    organization_id, template_id, client_id, company_id,
    access_token, token_expires_at, status
  )
  VALUES (
    v_onboarding.organization_id, p_template_id, v_onboarding.client_id, v_onboarding.company_id,
    v_access_token, now() + interval '30 days', 'sent'
  )
  RETURNING id INTO v_instance_id;
  
  -- Link to onboarding
  UPDATE onboarding_applications 
  SET onboarding_questionnaire_instance_id = v_instance_id
  WHERE id = p_onboarding_id;
  
  -- Queue email
  INSERT INTO email_queue (
    organization_id, to_email, to_name, subject, body_html,
    entity_type, entity_id, merge_data, status
  )
  VALUES (
    v_onboarding.organization_id,
    v_onboarding.email,
    COALESCE(v_onboarding.first_name || ' ' || v_onboarding.last_name, v_onboarding.company_name),
    'Please complete your onboarding questionnaire',
    '<p>Please complete the onboarding questionnaire to proceed with your application.</p>',
    'questionnaire_instance',
    v_instance_id,
    jsonb_build_object(
      'questionnaire_url', '/questionnaire/' || v_instance_id || '?token=' || v_access_token,
      'client_name', COALESCE(v_onboarding.first_name || ' ' || v_onboarding.last_name, v_onboarding.company_name)
    ),
    'pending'
  );
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'questionnaire_sent', auth.uid(),
    jsonb_build_object('template_id', p_template_id, 'instance_id', v_instance_id));
  
  RETURN jsonb_build_object(
    'success', true,
    'instance_id', v_instance_id,
    'access_token', v_access_token
  );
END;
$function$;

-- Create function to verify AML
CREATE OR REPLACE FUNCTION public.verify_aml(p_onboarding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_onboarding record;
BEGIN
  SELECT * INTO v_onboarding FROM onboarding_applications WHERE id = p_onboarding_id;
  
  IF v_onboarding.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found';
  END IF;
  
  IF NOT user_has_organization_access(v_onboarding.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  UPDATE onboarding_applications
  SET 
    aml_status = 'verified',
    aml_verified_at = now(),
    aml_expiry_date = CURRENT_DATE + INTERVAL '5 years'
  WHERE id = p_onboarding_id;
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id)
  VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'aml_verified', 
    v_onboarding.aml_status, 'verified', auth.uid());
  
  RETURN jsonb_build_object(
    'success', true,
    'aml_status', 'verified',
    'aml_verified_at', now(),
    'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years'
  );
END;
$function$;

-- Update services_catalog with trigger date info for common services
UPDATE services_catalog SET trigger_date_type = 'tax_year_end', trigger_date_offset_days = 0 
WHERE code IN ('SA', 'SA_DIRECTOR', 'SA_LANDLORD', 'SA_SOLE_TRADER');

UPDATE services_catalog SET trigger_date_type = 'financial_year_end', trigger_date_offset_days = 0 
WHERE code IN ('ACCOUNTS', 'CT600', 'CT', 'COMPANY_ACCOUNTS', 'STATUTORY_ACCOUNTS');

UPDATE services_catalog SET trigger_date_type = 'financial_year_end', trigger_date_offset_days = 0 
WHERE code IN ('CONFIRMATION_STATEMENT', 'ANNUAL_RETURN', 'COSEC');
