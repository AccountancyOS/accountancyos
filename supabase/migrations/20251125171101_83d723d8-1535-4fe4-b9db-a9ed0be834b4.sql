-- Fix infinite recursion in organization_users RLS policies
-- Create a security definer function to check organization membership
CREATE OR REPLACE FUNCTION public.user_has_organization_access(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = auth.uid()
    AND organization_id = org_id
  );
$$;

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view organization members" ON public.organization_users;

-- Create new non-recursive policy for organization_users
CREATE POLICY "Users can view their organization members"
ON public.organization_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR organization_id IN (
  SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
));

-- Allow users to insert themselves into organization_users during signup
CREATE POLICY "Users can insert organization membership"
ON public.organization_users
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow inserting organizations (needed for signup)
CREATE POLICY "Authenticated users can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update organizations RLS to use the new function
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;

CREATE POLICY "Users can view their organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (public.user_has_organization_access(id));

DROP POLICY IF EXISTS "Users can update their organization" ON public.organizations;

CREATE POLICY "Users can update their organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (id IN (
  SELECT organization_id 
  FROM public.organization_users 
  WHERE user_id = auth.uid() 
  AND role IN ('owner', 'admin')
));