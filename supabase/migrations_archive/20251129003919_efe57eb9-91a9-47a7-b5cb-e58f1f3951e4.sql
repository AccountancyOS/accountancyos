-- Fix security: Require authentication for sensitive tables

-- For clients table: Add explicit authentication check
DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;
CREATE POLICY "Users can view clients in their organization"
ON public.clients FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND user_has_organization_access(organization_id)
);

-- For onboarding_applications table: Add explicit authentication check
DROP POLICY IF EXISTS "Users can view applications in their organization" ON public.onboarding_applications;
CREATE POLICY "Users can view applications in their organization"
ON public.onboarding_applications FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND user_has_organization_access(organization_id)
);

DROP POLICY IF EXISTS "Users can insert applications in their organization" ON public.onboarding_applications;
CREATE POLICY "Users can insert applications in their organization"
ON public.onboarding_applications FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND user_has_organization_access(organization_id)
);

DROP POLICY IF EXISTS "Users can update applications in their organization" ON public.onboarding_applications;
CREATE POLICY "Users can update applications in their organization"
ON public.onboarding_applications FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND user_has_organization_access(organization_id)
);