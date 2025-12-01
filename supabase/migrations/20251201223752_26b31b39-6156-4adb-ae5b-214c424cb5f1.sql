-- Phase 4: Portal Invitation Acceptance RPCs

-- 1. RPC: get_portal_invite_details (public, read-only)
CREATE OR REPLACE FUNCTION public.get_portal_invite_details(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_portal_access record;
  v_org_name text;
  v_entity_name text;
  v_entity_type text;
  v_email text;
  v_user_exists boolean := false;
BEGIN
  -- Look up portal_access by token
  SELECT * INTO v_portal_access
  FROM portal_access
  WHERE invite_token = p_token
    AND status = 'invited'
    AND (invite_expires_at IS NULL OR invite_expires_at > now());

  -- If not found or expired
  IF v_portal_access.id IS NULL THEN
    -- Check if token exists but expired
    IF EXISTS (
      SELECT 1 FROM portal_access
      WHERE invite_token = p_token
        AND status = 'invited'
        AND invite_expires_at IS NOT NULL
        AND invite_expires_at <= now()
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'expired');
    ELSE
      RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
    END IF;
  END IF;

  -- Get organization name
  SELECT name INTO v_org_name
  FROM organizations
  WHERE id = v_portal_access.organization_id;

  -- Get entity details
  IF v_portal_access.client_id IS NOT NULL THEN
    v_entity_type := 'client';
    SELECT (first_name || ' ' || last_name) INTO v_entity_name
    FROM clients
    WHERE id = v_portal_access.client_id;
  ELSIF v_portal_access.company_id IS NOT NULL THEN
    v_entity_type := 'company';
    SELECT company_name INTO v_entity_name
    FROM companies
    WHERE id = v_portal_access.company_id;
  END IF;

  -- Get email
  IF v_portal_access.user_id IS NOT NULL THEN
    -- Get from auth.users
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = v_portal_access.user_id;
  ELSE
    -- Get from email_queue (most recent invite email)
    SELECT to_email INTO v_email
    FROM email_queue
    WHERE entity_type = 'portal_access'
      AND entity_id = v_portal_access.id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Check if user already exists with this email
  IF v_email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE email = v_email
    ) INTO v_user_exists;
  END IF;

  -- Return valid response
  RETURN jsonb_build_object(
    'valid', true,
    'organization_name', v_org_name,
    'entity_type', v_entity_type,
    'entity_name', v_entity_name,
    'email', v_email,
    'requires_user_creation', NOT v_user_exists,
    'portal_access_id', v_portal_access.id
  );
END;
$$;

-- 2. RPC: lifecycle_accept_portal_invitation (authenticated)
CREATE OR REPLACE FUNCTION public.lifecycle_accept_portal_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current_user_id uuid;
  v_portal_access record;
  v_entity_type text;
  v_entity_id uuid;
BEGIN
  -- Validate authentication
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
  END IF;

  -- Look up portal_access by token
  SELECT * INTO v_portal_access
  FROM portal_access
  WHERE invite_token = p_token
    AND status = 'invited'
    AND (invite_expires_at IS NULL OR invite_expires_at > now());

  -- If not found or expired
  IF v_portal_access.id IS NULL THEN
    -- Check if expired
    IF EXISTS (
      SELECT 1 FROM portal_access
      WHERE invite_token = p_token
        AND status = 'invited'
        AND invite_expires_at IS NOT NULL
        AND invite_expires_at <= now()
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'expired');
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;
  END IF;

  -- Validate no user_id conflict (prevent invite hijacking)
  IF v_portal_access.user_id IS NOT NULL AND v_portal_access.user_id != v_current_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'user_mismatch');
  END IF;

  -- Determine entity type and ID
  IF v_portal_access.client_id IS NOT NULL THEN
    v_entity_type := 'client';
    v_entity_id := v_portal_access.client_id;
  ELSIF v_portal_access.company_id IS NOT NULL THEN
    v_entity_type := 'company';
    v_entity_id := v_portal_access.company_id;
  END IF;

  -- Deactivate any duplicate active invites for this user + entity
  UPDATE portal_access
  SET 
    status = 'revoked_by_system',
    is_active = false,
    updated_at = now()
  WHERE user_id = v_current_user_id
    AND (
      (client_id = v_portal_access.client_id AND client_id IS NOT NULL) OR
      (company_id = v_portal_access.company_id AND company_id IS NOT NULL)
    )
    AND id != v_portal_access.id
    AND is_active = true;

  -- Update portal_access to active
  UPDATE portal_access
  SET
    user_id = v_current_user_id,
    status = 'active',
    is_active = true,
    accepted_at = now(),
    invite_token = NULL,
    invite_expires_at = NULL,
    updated_at = now()
  WHERE id = v_portal_access.id;

  -- Write to audit_log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    metadata
  ) VALUES (
    v_portal_access.organization_id,
    'portal_access',
    v_portal_access.id,
    'accepted',
    v_current_user_id,
    jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id', v_entity_id,
      'role', v_portal_access.role
    )
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'portal_access_id', v_portal_access.id,
    'entity_type', v_entity_type,
    'entity_id', v_entity_id,
    'organization_id', v_portal_access.organization_id,
    'status', 'active'
  );
END;
$$;

-- 3. RPC: get_portal_entities_for_current_user (convenience wrapper)
CREATE OR REPLACE FUNCTION public.get_portal_entities_for_current_user()
RETURNS TABLE (
  organization_id uuid,
  entity_id uuid,
  entity_type text,
  display_name text,
  registration_number text,
  tax_reference text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT * FROM get_portal_entities_for_user(auth.uid());
$$;