-- Drop and recreate can_finalise function using TEXT comparison on organization_users
CREATE OR REPLACE FUNCTION public.can_finalise(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
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