-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view their organization members" ON public.organization_users;

-- Recreate the policy using the existing security definer function
CREATE POLICY "Users can view their organization members" 
ON public.organization_users 
FOR SELECT 
USING (
  user_id = auth.uid() 
  OR organization_id = public.get_user_organization_id()
);