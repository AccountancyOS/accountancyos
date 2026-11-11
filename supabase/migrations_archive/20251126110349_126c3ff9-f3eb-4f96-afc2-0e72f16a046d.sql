-- Fix infinite recursion in organization_users RLS policies

-- Drop all problematic policies
DROP POLICY IF EXISTS "Users can view their own membership" ON public.organization_users;
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_users;
DROP POLICY IF EXISTS "Users can create their own membership" ON public.organization_users;
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_users;
DROP POLICY IF EXISTS "Accountants can view org roles" ON public.user_roles;

-- Create security definer function to get user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id(check_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.organization_users 
  WHERE user_id = check_user_id
  LIMIT 1;
$$;

-- Create security definer function to check if user is in organization
CREATE OR REPLACE FUNCTION public.user_in_organization(check_user_id uuid, check_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_users 
    WHERE user_id = check_user_id 
      AND organization_id = check_org_id
  );
$$;

-- Create security definer function to check user role in organization
CREATE OR REPLACE FUNCTION public.user_has_org_role(check_user_id uuid, check_org_id uuid, required_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_users 
    WHERE user_id = check_user_id 
      AND organization_id = check_org_id
      AND role = required_role
  );
$$;

-- Now create simple, non-recursive policies using these functions

-- Policy 1: Users can view their own organization membership
CREATE POLICY "Users can view their own membership"
  ON public.organization_users FOR SELECT
  USING (user_id = auth.uid());

-- Policy 2: Users can view other members in their organization (using security definer)
CREATE POLICY "Users can view org members"
  ON public.organization_users FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

-- Policy 3: Authenticated users can insert their own membership (for signup)
CREATE POLICY "Users can create their own membership"
  ON public.organization_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy 4: Owners and admins can add new members
CREATE POLICY "Admins can add members"
  ON public.organization_users FOR INSERT
  WITH CHECK (
    public.user_has_org_role(auth.uid(), organization_id, 'owner') OR
    public.user_has_org_role(auth.uid(), organization_id, 'admin')
  );

-- Fix user_roles policy to use security definer function
CREATE POLICY "Accountants can view org roles"
  ON public.user_roles FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));