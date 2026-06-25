-- 1. Update lifecycle_grant_portal_access email copy: frame as AML-pass + portal setup
CREATE OR REPLACE FUNCTION public.lifecycle_grant_portal_access(p_entity_type text, p_entity_id uuid, p_email text, p_role text DEFAULT 'primary_contact'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_portal_access_id uuid;
  v_invite_token text;
  v_invite_expires_at timestamptz;
  v_entity_name text;
  v_firm_name text;
  v_portal_url text;
BEGIN
  IF p_entity_type = 'client' THEN
    SELECT organization_id, (first_name || ' ' || last_name)
    INTO v_organization_id, v_entity_name
    FROM clients WHERE id = p_entity_id;
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION 'Client not found: %', p_entity_id;
    END IF;
  ELSIF p_entity_type = 'company' THEN
    SELECT organization_id, company_name
    INTO v_organization_id, v_entity_name
    FROM companies WHERE id = p_entity_id;
    IF v_organization_id IS NULL THEN
      RAISE EXCEPTION 'Company not found: %', p_entity_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid entity_type: %. Must be "client" or "company"', p_entity_type;
  END IF;

  IF NOT user_has_organization_access(v_organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT name INTO v_firm_name FROM organizations WHERE id = v_organization_id;
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  v_invite_token := generate_invite_token();
  v_invite_expires_at := now() + interval '14 days';

  INSERT INTO portal_access (
    organization_id, user_id, client_id, company_id, role, status, is_active,
    invite_token, invite_expires_at, invited_at, created_by
  )
  VALUES (
    v_organization_id, v_user_id,
    CASE WHEN p_entity_type = 'client' THEN p_entity_id ELSE NULL END,
    CASE WHEN p_entity_type = 'company' THEN p_entity_id ELSE NULL END,
    p_role, 'invited', true, v_invite_token, v_invite_expires_at, now(), auth.uid()
  )
  RETURNING id INTO v_portal_access_id;

  v_portal_url := 'https://client.accountancyos.com/auth/portal-invite?token=' || v_invite_token;

  INSERT INTO email_queue (
    organization_id, to_email, subject, body_html, entity_type, entity_id, merge_data, status, context
  )
  VALUES (
    v_organization_id,
    p_email,
    'You have passed AML verification - set up your ' || v_firm_name || ' client portal',
    '<p>Hello ' || v_entity_name || ',</p>' ||
    '<p>Good news - you have successfully passed our AML (Anti-Money Laundering) verification checks with ' || v_firm_name || '.</p>' ||
    '<p>The final step is to set up your secure client portal login. From the portal you can view your jobs, share documents, approve work, and message us directly.</p>' ||
    '<p><a href="' || v_portal_url || '" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;">Set up your client portal</a></p>' ||
    '<p>This link is valid for 14 days. If it expires, just let us know and we will reissue it.</p>' ||
    '<p>Kind regards,<br/>' || v_firm_name || '</p>',
    'portal_access',
    v_portal_access_id,
    jsonb_build_object(
      'client_name', v_entity_name,
      'firm_name', v_firm_name,
      'portal_url', v_portal_url
    ),
    'pending',
    'onboarding'
  );

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (
    v_organization_id, 'portal_access', v_portal_access_id, 'invited', auth.uid(),
    jsonb_build_object('email', p_email, 'target_entity_type', p_entity_type, 'target_entity_id', p_entity_id, 'role', p_role)
  );

  RETURN jsonb_build_object(
    'portal_access_id', v_portal_access_id,
    'invite_token', v_invite_token,
    'invite_expires_at', v_invite_expires_at,
    'email_queued', true,
    'user_exists', v_user_id IS NOT NULL,
    'ok', true
  );
END;
$function$;

-- 2. New combined RPC: verify AML and run approval/client creation in one step
CREATE OR REPLACE FUNCTION public.verify_aml_and_approve(p_onboarding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_onboarding record;
  v_approval jsonb;
  v_approval_error text;
BEGIN
  SELECT * INTO v_onboarding FROM onboarding_applications WHERE id = p_onboarding_id;
  IF v_onboarding.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found';
  END IF;

  IF NOT user_has_organization_access(v_onboarding.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Mark AML verified (idempotent)
  IF v_onboarding.aml_status IS DISTINCT FROM 'verified' THEN
    UPDATE onboarding_applications
    SET aml_status = 'verified',
        aml_verified_at = now(),
        aml_expiry_date = CURRENT_DATE + INTERVAL '5 years'
    WHERE id = p_onboarding_id;

    INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id)
    VALUES (v_onboarding.organization_id, 'onboarding', p_onboarding_id, 'aml_verified',
      v_onboarding.aml_status, 'verified', auth.uid());
  END IF;

  -- If already approved/rejected, return AML-only result
  IF v_onboarding.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'aml_status', 'verified',
      'aml_verified_at', now(),
      'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years',
      'already_finalized', true,
      'status', v_onboarding.status
    );
  END IF;

  -- Try approval; surface failures without rolling back the AML decision
  BEGIN
    v_approval := lifecycle_approve_onboarding(p_onboarding_id);
  EXCEPTION WHEN OTHERS THEN
    v_approval_error := SQLERRM;
    RETURN jsonb_build_object(
      'aml_status', 'verified',
      'aml_verified_at', now(),
      'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years',
      'approval_error', v_approval_error
    );
  END;

  RETURN v_approval
    || jsonb_build_object(
      'aml_status', 'verified',
      'aml_verified_at', now(),
      'aml_expiry_date', CURRENT_DATE + INTERVAL '5 years'
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_aml_and_approve(uuid) TO authenticated;