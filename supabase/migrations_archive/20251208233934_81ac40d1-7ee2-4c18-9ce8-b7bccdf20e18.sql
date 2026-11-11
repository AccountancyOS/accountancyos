-- Create role enum type
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'manager', 'staff', 'viewer');

-- Create function to check if user has a specific role in an organization
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _org_id uuid, _role app_role)
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
      AND role::text = _role::text
  )
$$;

-- Create function to check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _org_id uuid, _roles text[])
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
      AND role::text = ANY(_roles)
  )
$$;

-- Create function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid, _org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.organization_users
  WHERE user_id = _user_id
    AND organization_id = _org_id
  LIMIT 1
$$;