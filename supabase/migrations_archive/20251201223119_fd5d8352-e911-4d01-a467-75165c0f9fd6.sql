-- Phase 3: Lifecycle RPCs Implementation
-- Pre-requisite: Make portal_access.user_id nullable for invitation flow

ALTER TABLE portal_access ALTER COLUMN user_id DROP NOT NULL;

-- Helper function to generate secure invite tokens
CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$;

-- ============================================================================
-- RPC 3: lifecycle_grant_portal_access (implemented first as it's called by RPC 2)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lifecycle_grant_portal_access(
  p_entity_type text,
  p_entity_id uuid,
  p_email text,
  p_role text DEFAULT 'primary_contact'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_portal_access_id uuid;
  v_invite_token text;
  v_invite_expires_at timestamptz;
  v_entity_name text;
  v_firm_name text;
BEGIN
  -- Resolve organization_id and entity name based on entity_type
  IF p_entity_type = 'client' THEN
    SELECT organization_id, (first_name || ' ' || last_name) 
    INTO v_organization_id, v_entity_name
    FROM clients 
    WHERE id = p_entity_id;
    
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION 'Client not found: %', p_entity_id;
    END IF;
    
  ELSIF p_entity_type = 'company' THEN
    SELECT organization_id, company_name 
    INTO v_organization_id, v_entity_name
    FROM companies 
    WHERE id = p_entity_id;
    
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION 'Company not found: %', p_entity_id;
    END IF;
    
  ELSE
    RAISE EXCEPTION 'Invalid entity_type: %. Must be "client" or "company"', p_entity_type;
  END IF;

  -- Verify caller has access to organization
  IF NOT user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  -- Get firm name
  SELECT name INTO v_firm_name FROM organizations WHERE id = v_organization_id;

  -- Check if user already exists in auth.users (read-only check)
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  -- Generate invite token and expiry
  v_invite_token := generate_invite_token();
  v_invite_expires_at := now() + interval '14 days';

  -- Create portal_access record
  INSERT INTO portal_access (
    organization_id,
    user_id,
    client_id,
    company_id,
    role,
    status,
    is_active,
    invite_token,
    invite_expires_at,
    invited_at,
    created_by
  )
  VALUES (
    v_organization_id,
    v_user_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_role,
    'invited',
    true,
    v_invite_token,
    v_invite_expires_at,
    now(),
    auth.uid()
  )
  RETURNING id INTO v_portal_access_id;

  -- Queue invitation email
  INSERT INTO email_queue (
    organization_id,
    to_email,
    subject,
    body_html,
    entity_type,
    entity_id,
    merge_data,
    status
  )
  VALUES (
    v_organization_id,
    p_email,
    'Welcome to your ' || v_firm_name || ' client portal',
    '<p>You have been invited to access your secure client portal.</p><p>Click the link below to get started:</p><p><a href="https://client.accountancyos.com/auth/portal-invite?token=' || v_invite_token || '">Access your portal</a></p>',
    'portal_access',
    v_portal_access_id,
    jsonb_build_object(
      'client_name', v_entity_name,
      'firm_name', v_firm_name,
      'portal_url', 'https://client.accountancyos.com/auth/portal-invite?token=' || v_invite_token
    ),
    'pending'
  );

  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    metadata
  )
  VALUES (
    v_organization_id,
    'portal_access',
    v_portal_access_id,
    'invited',
    auth.uid(),
    jsonb_build_object(
      'email', p_email,
      'target_entity_type', p_entity_type,
      'target_entity_id', p_entity_id,
      'role', p_role
    )
  );

  -- Return result
  RETURN jsonb_build_object(
    'portal_access_id', v_portal_access_id,
    'invite_token', v_invite_token,
    'invite_expires_at', v_invite_expires_at,
    'email_queued', true,
    'user_exists', v_user_id IS NOT NULL
  );
END;
$$;

-- ============================================================================
-- RPC 1: lifecycle_accept_quote
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lifecycle_accept_quote(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_quote record;
  v_lead record;
  v_onboarding_id uuid;
  v_onboarding_status text;
  v_created_new_onboarding boolean := false;
  v_old_quote_status text;
BEGIN
  -- Fetch quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  -- Verify caller has access to organization
  IF NOT user_has_organization_access(v_quote.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  -- Validate quote status (accept from draft or sent)
  IF v_quote.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'Quote cannot be accepted. Current status: %', v_quote.status;
  END IF;

  v_old_quote_status := v_quote.status;

  -- Update quote
  UPDATE quotes 
  SET 
    status = 'accepted',
    accepted_at = now(),
    sent_at = COALESCE(sent_at, now())
  WHERE id = p_quote_id;

  -- Write audit log for quote
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    old_value,
    new_value,
    user_id
  )
  VALUES (
    v_quote.organization_id,
    'quote',
    p_quote_id,
    'status_change',
    v_old_quote_status,
    'accepted',
    auth.uid()
  );

  -- Update linked lead if present
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_quote.lead_id;
    
    UPDATE leads 
    SET 
      pipeline_stage = 'won',
      converted_at = now()
    WHERE id = v_quote.lead_id;

    -- Write audit log for lead
    INSERT INTO audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      old_value,
      new_value,
      user_id
    )
    VALUES (
      v_quote.organization_id,
      'lead',
      v_quote.lead_id,
      'status_change',
      v_lead.pipeline_stage,
      'won',
      auth.uid()
    );
  END IF;

  -- Check for existing onboarding application
  SELECT id, status INTO v_onboarding_id, v_onboarding_status
  FROM onboarding_applications 
  WHERE quote_id = p_quote_id
  LIMIT 1;

  -- Create onboarding application if none exists
  IF v_onboarding_id IS NULL THEN
    INSERT INTO onboarding_applications (
      organization_id,
      lead_id,
      quote_id,
      application_type,
      status,
      aml_status,
      first_name,
      last_name,
      email,
      phone
    )
    SELECT
      v_quote.organization_id,
      v_quote.lead_id,
      p_quote_id,
      CASE 
        WHEN v_lead.company_name IS NOT NULL THEN 'company'
        ELSE 'individual'
      END,
      'pending',
      'pending',
      COALESCE(v_lead.first_name, ''),
      COALESCE(v_lead.last_name, ''),
      COALESCE(v_lead.email, v_quote.client_email),
      v_lead.phone
    FROM (SELECT v_lead.*) AS lead_data
    RETURNING id, status INTO v_onboarding_id, v_onboarding_status;

    v_created_new_onboarding := true;

    -- Write audit log for onboarding creation
    INSERT INTO audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      user_id,
      metadata
    )
    VALUES (
      v_quote.organization_id,
      'onboarding',
      v_onboarding_id,
      'created',
      auth.uid(),
      jsonb_build_object('quote_id', p_quote_id, 'lead_id', v_quote.lead_id)
    );
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'quote_id', p_quote_id,
    'quote_status', 'accepted',
    'lead_id', v_quote.lead_id,
    'lead_stage', CASE WHEN v_quote.lead_id IS NOT NULL THEN 'won' ELSE NULL END,
    'onboarding_application_id', v_onboarding_id,
    'onboarding_status', v_onboarding_status,
    'created_new_onboarding', v_created_new_onboarding
  );
END;
$$;

-- ============================================================================
-- RPC 2: lifecycle_approve_onboarding
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lifecycle_approve_onboarding(p_onboarding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_onboarding record;
  v_client_id uuid;
  v_company_id uuid;
  v_engagement_ids uuid[] := ARRAY[]::uuid[];
  v_engagement_id uuid;
  v_portal_access_result jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_quote_line record;
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

  -- Validate required documents
  IF NOT v_onboarding.id_document_uploaded THEN
    RAISE EXCEPTION 'ID document not uploaded';
  END IF;

  IF NOT v_onboarding.proof_of_address_uploaded THEN
    RAISE EXCEPTION 'Proof of address not uploaded';
  END IF;

  -- Create client or company based on application_type
  IF v_onboarding.application_type = 'individual' THEN
    -- Create or use existing client
    IF v_onboarding.client_id IS NOT NULL THEN
      v_client_id := v_onboarding.client_id;
      
      -- Update existing client to active
      UPDATE clients 
      SET 
        status = 'active',
        activated_at = now()
      WHERE id = v_client_id;
    ELSE
      -- Create new client
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
        activated_at
      )
      VALUES (
        v_onboarding.organization_id,
        v_onboarding.first_name,
        v_onboarding.last_name,
        v_onboarding.email,
        v_onboarding.phone,
        v_onboarding.date_of_birth,
        v_onboarding.address_line_1,
        v_onboarding.address_line_2,
        v_onboarding.city,
        v_onboarding.postcode,
        v_onboarding.country,
        v_onboarding.national_insurance_number,
        v_onboarding.utr,
        'active',
        now()
      )
      RETURNING id INTO v_client_id;

      -- Update onboarding with client_id
      UPDATE onboarding_applications SET client_id = v_client_id WHERE id = p_onboarding_id;

      -- Write audit log for client creation
      INSERT INTO audit_log (
        organization_id,
        entity_type,
        entity_id,
        action,
        user_id,
        metadata
      )
      VALUES (
        v_onboarding.organization_id,
        'client',
        v_client_id,
        'created',
        auth.uid(),
        jsonb_build_object('onboarding_id', p_onboarding_id, 'status', 'active')
      );
    END IF;

    v_entity_type := 'client';
    v_entity_id := v_client_id;

  ELSIF v_onboarding.application_type = 'company' THEN
    -- Create or use existing company
    IF v_onboarding.company_id IS NOT NULL THEN
      v_company_id := v_onboarding.company_id;
      
      -- Update existing company to active
      UPDATE companies 
      SET 
        status = 'active',
        activated_at = now()
      WHERE id = v_company_id;
    ELSE
      -- Create new company
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
        activated_at
      )
      VALUES (
        v_onboarding.organization_id,
        v_onboarding.company_name,
        v_onboarding.company_number,
        v_onboarding.email,
        v_onboarding.phone,
        v_onboarding.address_line_1,
        v_onboarding.address_line_2,
        v_onboarding.city,
        v_onboarding.postcode,
        v_onboarding.country,
        v_onboarding.vat_number,
        v_onboarding.incorporation_date,
        v_onboarding.year_end_month,
        v_onboarding.year_end_day,
        'active',
        now()
      )
      RETURNING id INTO v_company_id;

      -- Update onboarding with company_id
      UPDATE onboarding_applications SET company_id = v_company_id WHERE id = p_onboarding_id;

      -- Write audit log for company creation
      INSERT INTO audit_log (
        organization_id,
        entity_type,
        entity_id,
        action,
        user_id,
        metadata
      )
      VALUES (
        v_onboarding.organization_id,
        'company',
        v_company_id,
        'created',
        auth.uid(),
        jsonb_build_object('onboarding_id', p_onboarding_id, 'status', 'active')
      );
    END IF;

    v_entity_type := 'company';
    v_entity_id := v_company_id;
  END IF;

  -- Create engagements from quote lines (if quote exists)
  IF v_onboarding.quote_id IS NOT NULL THEN
    FOR v_quote_line IN 
      SELECT ql.*, sc.code as service_code
      FROM quote_lines ql
      LEFT JOIN services_catalog sc ON sc.id = ql.service_id
      WHERE ql.quote_id = v_onboarding.quote_id
    LOOP
      INSERT INTO engagements (
        organization_id,
        client_id,
        company_id,
        quote_id,
        service_id,
        frequency,
        start_date,
        status,
        activated_at,
        active
      )
      VALUES (
        v_onboarding.organization_id,
        v_client_id,
        v_company_id,
        v_onboarding.quote_id,
        v_quote_line.service_id,
        v_quote_line.billing_frequency,
        CURRENT_DATE,
        'active',
        now(),
        true
      )
      RETURNING id INTO v_engagement_id;

      v_engagement_ids := array_append(v_engagement_ids, v_engagement_id);

      -- Write audit log for engagement
      INSERT INTO audit_log (
        organization_id,
        entity_type,
        entity_id,
        action,
        user_id,
        metadata
      )
      VALUES (
        v_onboarding.organization_id,
        'engagement',
        v_engagement_id,
        'created',
        auth.uid(),
        jsonb_build_object('onboarding_id', p_onboarding_id, 'status', 'active', 'service_id', v_quote_line.service_id)
      );
    END LOOP;
  END IF;

  -- Update onboarding application status
  UPDATE onboarding_applications 
  SET 
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    aml_status = 'verified',
    aml_verified_at = now()
  WHERE id = p_onboarding_id;

  -- Write audit log for onboarding approval
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    old_value,
    new_value,
    user_id
  )
  VALUES (
    v_onboarding.organization_id,
    'onboarding',
    p_onboarding_id,
    'approved',
    v_onboarding.status,
    'approved',
    auth.uid()
  );

  -- Grant portal access if email is present
  v_primary_email := v_onboarding.email;
  
  IF v_primary_email IS NOT NULL AND v_primary_email != '' THEN
    BEGIN
      v_portal_access_result := lifecycle_grant_portal_access(
        v_entity_type,
        v_entity_id,
        v_primary_email,
        'primary_contact'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning but don't fail approval
      INSERT INTO audit_log (
        organization_id,
        entity_type,
        entity_id,
        action,
        user_id,
        metadata
      )
      VALUES (
        v_onboarding.organization_id,
        'onboarding',
        p_onboarding_id,
        'portal_access_failed',
        auth.uid(),
        jsonb_build_object('error', SQLERRM, 'email', v_primary_email)
      );
      
      v_portal_access_result := jsonb_build_object('error', SQLERRM);
    END;
  ELSE
    v_portal_access_result := jsonb_build_object('skipped', true, 'reason', 'no_email');
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'onboarding_id', p_onboarding_id,
    'status', 'approved',
    'client_id', v_client_id,
    'company_id', v_company_id,
    'engagement_ids', v_engagement_ids,
    'portal_access', v_portal_access_result,
    'invitation_email_queued', (v_portal_access_result->>'email_queued')::boolean
  );
END;
$$;

-- ============================================================================
-- RPC 4: lifecycle_send_quote (Optional)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lifecycle_send_quote(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_quote record;
  v_line_count integer;
  v_recipient_email text;
  v_lead record;
  v_old_status text;
  v_email_queued boolean := false;
BEGIN
  -- Fetch quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  -- Verify caller has access to organization
  IF NOT user_has_organization_access(v_quote.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  -- Validate quote status (can only send draft quotes)
  IF v_quote.status != 'draft' THEN
    RAISE EXCEPTION 'Quote cannot be sent. Current status: %. Only draft quotes can be sent.', v_quote.status;
  END IF;

  -- Validate quote has at least 1 line
  SELECT COUNT(*) INTO v_line_count FROM quote_lines WHERE quote_id = p_quote_id;
  
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Quote has no line items. Add services before sending.';
  END IF;

  v_old_status := v_quote.status;

  -- Update quote
  UPDATE quotes 
  SET 
    status = 'sent',
    sent_at = now(),
    valid_until = COALESCE(valid_until, now() + interval '30 days')
  WHERE id = p_quote_id;

  -- Determine recipient email
  IF v_quote.client_email IS NOT NULL AND v_quote.client_email != '' THEN
    v_recipient_email := v_quote.client_email;
  ELSIF v_quote.lead_id IS NOT NULL THEN
    SELECT email INTO v_recipient_email FROM leads WHERE id = v_quote.lead_id;
  END IF;

  -- Queue quote email if recipient available
  IF v_recipient_email IS NOT NULL AND v_recipient_email != '' THEN
    -- Get lead details for personalization
    IF v_quote.lead_id IS NOT NULL THEN
      SELECT * INTO v_lead FROM leads WHERE id = v_quote.lead_id;
    END IF;

    INSERT INTO email_queue (
      organization_id,
      to_email,
      subject,
      body_html,
      entity_type,
      entity_id,
      merge_data,
      status
    )
    VALUES (
      v_quote.organization_id,
      v_recipient_email,
      'Your quote from ' || (SELECT name FROM organizations WHERE id = v_quote.organization_id),
      '<p>Thank you for your interest. Please find your quote attached.</p><p>This quote is valid until ' || to_char(COALESCE(v_quote.valid_until, now() + interval '30 days'), 'DD/MM/YYYY') || '.</p>',
      'quote',
      p_quote_id,
      jsonb_build_object(
        'quote_id', p_quote_id,
        'client_name', COALESCE(v_lead.first_name || ' ' || v_lead.last_name, v_quote.client_name),
        'valid_until', COALESCE(v_quote.valid_until, now() + interval '30 days')
      ),
      'pending'
    );

    v_email_queued := true;
  END IF;

  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    old_value,
    new_value,
    user_id,
    metadata
  )
  VALUES (
    v_quote.organization_id,
    'quote',
    p_quote_id,
    'status_change',
    v_old_status,
    'sent',
    auth.uid(),
    jsonb_build_object('email_queued', v_email_queued, 'recipient', v_recipient_email)
  );

  -- Return result
  RETURN jsonb_build_object(
    'quote_id', p_quote_id,
    'status', 'sent',
    'sent_at', now(),
    'valid_until', COALESCE(v_quote.valid_until, now() + interval '30 days'),
    'email_queued', v_email_queued,
    'recipient_email', v_recipient_email
  );
END;
$$;