-- Server-side permission guard functions
-- These RPCs enforce permissions server-side for all sensitive operations

-- Check if user can modify jobs
CREATE OR REPLACE FUNCTION public.can_modify_jobs(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin', 'manager', 'staff')
  )
$$;

-- Check if user can finalize workpapers
CREATE OR REPLACE FUNCTION public.can_finalize_workpapers(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin', 'manager')
  )
$$;

-- Check if user can approve filings
CREATE OR REPLACE FUNCTION public.can_approve_filings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin', 'manager')
  )
$$;

-- Check if user can submit filings
CREATE OR REPLACE FUNCTION public.can_submit_filings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin', 'manager')
  )
$$;

-- Check if user can manage templates
CREATE OR REPLACE FUNCTION public.can_manage_templates(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin', 'manager')
  )
$$;

-- Check if user can manage team
CREATE OR REPLACE FUNCTION public.can_manage_team(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin')
  )
$$;

-- Check if user can manage automation rules
CREATE OR REPLACE FUNCTION public.can_manage_automation_rules(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin', 'manager')
  )
$$;

-- Check if user can manage practice settings
CREATE OR REPLACE FUNCTION public.can_manage_practice_settings(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role::text IN ('owner', 'admin')
  )
$$;

-- Safe RPC: Update job status with permission check and audit logging
CREATE OR REPLACE FUNCTION public.update_job_status_safe(
  p_job_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_old_status text;
BEGIN
  -- Fetch job
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;
  
  -- Check permission
  IF NOT can_modify_jobs(auth.uid(), v_job.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  v_old_status := v_job.status;
  
  -- Update job
  UPDATE jobs SET status = p_new_status, updated_at = now() WHERE id = p_job_id;
  
  -- Write audit log
  INSERT INTO audit_log (
    organization_id, entity_type, entity_id, action,
    field_name, old_value, new_value, user_id, metadata
  ) VALUES (
    v_job.organization_id, 'job', p_job_id, 'status_change',
    'status', v_old_status, p_new_status, auth.uid(),
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN jsonb_build_object('success', true, 'old_status', v_old_status, 'new_status', p_new_status);
END;
$$;

-- Safe RPC: Finalize workpaper with permission check and audit logging
CREATE OR REPLACE FUNCTION public.finalize_workpaper_safe(
  p_workpaper_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workpaper record;
  v_filing_id uuid;
BEGIN
  -- Fetch workpaper
  SELECT * INTO v_workpaper FROM workpaper_instances WHERE id = p_workpaper_id;
  
  IF v_workpaper.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workpaper not found');
  END IF;
  
  -- Check permission
  IF NOT can_finalize_workpapers(auth.uid(), v_workpaper.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only managers and above can finalize workpapers');
  END IF;
  
  -- Update workpaper
  UPDATE workpaper_instances SET 
    status = 'finalised',
    finalised_by = auth.uid(),
    finalised_at = now(),
    locked = true
  WHERE id = p_workpaper_id;
  
  -- Create filing record
  INSERT INTO filings (
    organization_id, job_id, workpaper_instance_id, client_id, company_id,
    filing_type, filing_body, period_start, period_end, tax_year,
    filing_data, status
  ) VALUES (
    v_workpaper.organization_id, v_workpaper.job_id, p_workpaper_id,
    v_workpaper.client_id, v_workpaper.company_id, v_workpaper.service_type,
    'HMRC', v_workpaper.period_start, v_workpaper.period_end,
    v_workpaper.period_label, v_workpaper.field_values, 'draft'
  )
  RETURNING id INTO v_filing_id;
  
  -- Write audit logs
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
  VALUES (v_workpaper.organization_id, 'workpaper_instance', p_workpaper_id, 'finalise', 'status', v_workpaper.status, 'finalised', auth.uid());
  
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id)
  VALUES (v_workpaper.organization_id, 'filing', v_filing_id, 'create', auth.uid());
  
  RETURN jsonb_build_object('success', true, 'filing_id', v_filing_id);
END;
$$;

-- Safe RPC: Approve filing with permission check and audit logging
CREATE OR REPLACE FUNCTION public.approve_filing_safe(
  p_filing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filing record;
BEGIN
  -- Fetch filing
  SELECT * INTO v_filing FROM filings WHERE id = p_filing_id;
  
  IF v_filing.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Filing not found');
  END IF;
  
  -- Check permission
  IF NOT can_approve_filings(auth.uid(), v_filing.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only managers and above can approve filings');
  END IF;
  
  -- Update filing
  UPDATE filings SET 
    status = 'approved_by_client',
    approved_by = auth.uid(),
    approved_at = now()
  WHERE id = p_filing_id;
  
  -- Write audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
  VALUES (v_filing.organization_id, 'filing', p_filing_id, 'approve', 'status', v_filing.status, 'approved_by_client', auth.uid());
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Safe RPC: Submit filing with permission check and audit logging
CREATE OR REPLACE FUNCTION public.submit_filing_safe(
  p_filing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filing record;
BEGIN
  -- Fetch filing
  SELECT * INTO v_filing FROM filings WHERE id = p_filing_id;
  
  IF v_filing.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Filing not found');
  END IF;
  
  -- Check permission
  IF NOT can_submit_filings(auth.uid(), v_filing.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only managers and above can submit filings');
  END IF;
  
  -- Update filing
  UPDATE filings SET 
    status = 'filed',
    submitted_by = auth.uid(),
    submitted_at = now()
  WHERE id = p_filing_id;
  
  -- Write audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
  VALUES (v_filing.organization_id, 'filing', p_filing_id, 'submit', 'status', v_filing.status, 'filed', auth.uid());
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Safe RPC: Update deadline with permission check and audit logging
CREATE OR REPLACE FUNCTION public.update_deadline_safe(
  p_deadline_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline record;
BEGIN
  -- Fetch deadline
  SELECT * INTO v_deadline FROM deadlines WHERE id = p_deadline_id;
  
  IF v_deadline.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deadline not found');
  END IF;
  
  -- Check permission
  IF NOT can_modify_jobs(auth.uid(), v_deadline.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;
  
  -- Update deadline
  UPDATE deadlines SET 
    name = COALESCE(p_updates->>'name', name),
    due_date = COALESCE((p_updates->>'due_date')::date, due_date),
    status = COALESCE(p_updates->>'status', status),
    updated_at = now()
  WHERE id = p_deadline_id;
  
  -- Write audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_deadline.organization_id, 'deadline', p_deadline_id, 'update', auth.uid(), p_updates);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Get user permissions for current organization
CREATE OR REPLACE FUNCTION public.get_user_permissions(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  
  SELECT role INTO v_role FROM organization_users
  WHERE user_id = v_user_id AND organization_id = _org_id;
  
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('role', null, 'permissions', jsonb_build_object());
  END IF;
  
  RETURN jsonb_build_object(
    'role', v_role,
    'permissions', jsonb_build_object(
      'can_manage_practice_settings', v_role IN ('owner', 'admin'),
      'can_manage_integrations', v_role IN ('owner', 'admin'),
      'can_manage_automation_rules', v_role IN ('owner', 'admin', 'manager'),
      'can_finalize_workpapers', v_role IN ('owner', 'admin', 'manager'),
      'can_approve_filings', v_role IN ('owner', 'admin', 'manager'),
      'can_submit_filings', v_role IN ('owner', 'admin', 'manager'),
      'can_view_all_jobs', v_role IN ('owner', 'admin', 'manager', 'staff'),
      'can_manage_billing', v_role = 'owner',
      'can_manage_team', v_role IN ('owner', 'admin'),
      'can_manage_templates', v_role IN ('owner', 'admin', 'manager'),
      'can_create_jobs', v_role IN ('owner', 'admin', 'manager', 'staff'),
      'can_view_sensitive_data', v_role IN ('owner', 'admin', 'manager'),
      'can_delete_records', v_role IN ('owner', 'admin')
    )
  );
END;
$$;

-- Update user role (admin/owner only)
CREATE OR REPLACE FUNCTION public.update_user_role_safe(
  p_target_user_id uuid,
  p_org_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
BEGIN
  -- Check caller has permission
  IF NOT can_manage_team(auth.uid(), p_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only owners and admins can manage team roles');
  END IF;
  
  -- Get caller role
  SELECT role INTO v_caller_role FROM organization_users
  WHERE user_id = auth.uid() AND organization_id = p_org_id;
  
  -- Get target current role
  SELECT role INTO v_target_role FROM organization_users
  WHERE user_id = p_target_user_id AND organization_id = p_org_id;
  
  -- Prevent demoting owner unless caller is also owner
  IF v_target_role = 'owner' AND v_caller_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can modify other owner roles');
  END IF;
  
  -- Prevent non-owners from creating owners
  IF p_new_role = 'owner' AND v_caller_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can assign owner role');
  END IF;
  
  -- Update role
  UPDATE organization_users SET role = p_new_role
  WHERE user_id = p_target_user_id AND organization_id = p_org_id;
  
  -- Write audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
  VALUES (p_org_id, 'user_role', p_target_user_id, 'role_change', 'role', v_target_role, p_new_role, auth.uid());
  
  RETURN jsonb_build_object('success', true, 'old_role', v_target_role, 'new_role', p_new_role);
END;
$$;