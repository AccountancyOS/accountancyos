-- Create atomic function for organization creation with owner linking
-- This bypasses RLS chicken-and-egg problem during signup
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  org_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Create organization
  INSERT INTO organizations (name)
  VALUES (org_name)
  RETURNING id INTO new_org_id;
  
  -- Link user as owner
  INSERT INTO organization_users (organization_id, user_id, role)
  VALUES (new_org_id, current_user_id, 'owner');
  
  RETURN new_org_id;
END;
$$;