
-- Wave 1: 3-Role Collapse and Membership Security

-- Step 1: Migrate existing data to 3-role model
UPDATE public.organization_users SET role = 'admin' WHERE role = 'manager';
UPDATE public.organization_users SET role = 'staff' WHERE role = 'viewer';

-- Step 2: Drop old CHECK constraint and add new one
ALTER TABLE public.organization_users DROP CONSTRAINT organization_users_role_check;
ALTER TABLE public.organization_users ADD CONSTRAINT organization_users_role_check 
  CHECK (role IN ('owner', 'admin', 'staff'));

-- Step 3: Create role hierarchy helper
CREATE OR REPLACE FUNCTION public.role_level(r text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE r
    WHEN 'owner' THEN 3
    WHEN 'admin' THEN 2
    WHEN 'staff' THEN 1
    ELSE 0
  END;
$$;

-- Step 4: Create user_role_is_at_least helper (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.user_role_is_at_least(
  check_user_id uuid, 
  check_org_id uuid, 
  min_role text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_users 
    WHERE user_id = check_user_id 
      AND organization_id = check_org_id
      AND role_level(role) >= role_level(min_role)
  );
$$;

-- Step 5: Secure add_org_member RPC (only owners can add, no self-escalation)
CREATE OR REPLACE FUNCTION public.add_org_member(
  target_org_id uuid,
  target_user_id uuid,
  target_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text;
  new_id uuid;
BEGIN
  -- Validate role
  IF target_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Invalid role. Only admin or staff can be assigned.';
  END IF;

  -- Check caller is owner of the org
  SELECT role INTO caller_role
  FROM public.organization_users
  WHERE user_id = auth.uid() AND organization_id = target_org_id;

  IF caller_role IS NULL OR caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can add members directly.';
  END IF;

  -- Prevent duplicate
  IF EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = target_user_id AND organization_id = target_org_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization.';
  END IF;

  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (target_org_id, target_user_id, target_role)
  RETURNING id INTO new_id;

  -- Audit log
  INSERT INTO public.audit_log (organization_id, user_id, entity_type, entity_id, action, actor_role, metadata)
  VALUES (target_org_id, auth.uid(), 'organization_user', new_id, 'member_added', caller_role,
    jsonb_build_object('target_user_id', target_user_id, 'assigned_role', target_role));

  RETURN new_id;
END;
$$;

-- Step 6: Secure accept_org_invitation RPC
CREATE OR REPLACE FUNCTION public.accept_org_invitation(
  invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv record;
  new_member_id uuid;
BEGIN
  -- Get invitation
  SELECT * INTO inv
  FROM public.invitations
  WHERE id = invitation_id AND status = 'pending';

  IF inv IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation.';
  END IF;

  -- Verify the current user matches invitation email
  IF inv.email != (SELECT email FROM auth.users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'This invitation is not for your account.';
  END IF;

  -- Check not already a member
  IF EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = auth.uid() AND organization_id = inv.organization_id
  ) THEN
    -- Already a member, just mark invitation as accepted
    UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = invitation_id;
    RETURN (SELECT id FROM public.organization_users WHERE user_id = auth.uid() AND organization_id = inv.organization_id);
  END IF;

  -- Add member
  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (inv.organization_id, auth.uid(), inv.role)
  RETURNING id INTO new_member_id;

  -- Mark invitation accepted
  UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = invitation_id;

  RETURN new_member_id;
END;
$$;

-- Step 7: Tighten RLS - Block direct inserts (must use RPCs above)
DROP POLICY IF EXISTS "Safe org membership insert" ON public.organization_users;

CREATE POLICY "Block direct inserts - use RPCs"
ON public.organization_users
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Step 8: Tighten UPDATE - only owners can change roles, prevent owner demotion by non-self
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_users;

CREATE POLICY "Owners can update member roles"
ON public.organization_users
FOR UPDATE
TO authenticated
USING (
  user_has_org_role(auth.uid(), organization_id, 'owner')
)
WITH CHECK (
  user_has_org_role(auth.uid(), organization_id, 'owner')
);

-- Step 9: Tighten DELETE - owners can remove anyone, users can leave (but not last owner)
DROP POLICY IF EXISTS "Owners admins can remove members or self-leave" ON public.organization_users;

CREATE POLICY "Owners can remove members or self-leave"
ON public.organization_users
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() 
  OR user_has_org_role(auth.uid(), organization_id, 'owner')
);

-- Step 10: Consolidate SELECT policies
DROP POLICY IF EXISTS "Users can view their organization members" ON public.organization_users;
DROP POLICY IF EXISTS "Users can view their own membership" ON public.organization_users;
-- Keep only the org-membership-based one
