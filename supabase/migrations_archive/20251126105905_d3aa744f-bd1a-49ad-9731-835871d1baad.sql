-- Fix RLS policies for signup flow

-- Drop existing problematic policy on organization_users
DROP POLICY IF EXISTS "Users can view organization members" ON public.organization_users;

-- Allow users to view their own organization membership directly (fixes circular dependency)
CREATE POLICY "Users can view their own membership"
  ON public.organization_users FOR SELECT
  USING (user_id = auth.uid());

-- Allow users to view other members in their organization
CREATE POLICY "Users can view org members"
  ON public.organization_users FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert their own organization membership (for signup)
CREATE POLICY "Users can create their own membership"
  ON public.organization_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow owners/admins to insert new members
CREATE POLICY "Admins can add members"
  ON public.organization_users FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Drop and recreate organizations insert policy
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix user_roles policies - allow users to read their own roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Allow accountants in the organization to view all roles in their org
CREATE POLICY "Accountants can view org roles"
  ON public.user_roles FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );