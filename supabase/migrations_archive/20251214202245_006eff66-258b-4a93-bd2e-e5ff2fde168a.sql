-- Fix function search_path security warnings
-- These are unrelated functions that have search_path issues from earlier migrations

-- Update create_organization_with_owner to be more explicit
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(org_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  new_org_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Create organization
  INSERT INTO public.organizations (name)
  VALUES (org_name)
  RETURNING id INTO new_org_id;
  
  -- Link user as owner
  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (new_org_id, current_user_id, 'owner');
  
  RETURN new_org_id;
END;
$function$;