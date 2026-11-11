-- Fix RLS for automation_rule_templates table
-- This table should only be accessible to organization members, not public

-- First, ensure RLS is enabled
ALTER TABLE public.automation_rule_templates ENABLE ROW LEVEL SECURITY;

-- Drop any existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view system templates" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "Public can view system templates" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "System templates are viewable by all" ON public.automation_rule_templates;

-- Create proper org-member policies for automation_rule_templates

-- Organization members can view templates that are either:
-- 1. System templates (is_system = true) - available to all authenticated users
-- 2. Templates belonging to their organization
CREATE POLICY "Authenticated users can view system templates"
ON public.automation_rule_templates
FOR SELECT
TO authenticated
USING (
  is_system = true
  OR (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.organization_id = automation_rule_templates.organization_id
    )
  )
);

-- Only org members can insert templates for their organization
CREATE POLICY "Org members can create templates"
ON public.automation_rule_templates
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
);

-- Only org members can update their org's templates (not system templates)
CREATE POLICY "Org members can update their templates"
ON public.automation_rule_templates
FOR UPDATE
TO authenticated
USING (
  is_system = false
  AND organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
)
WITH CHECK (
  is_system = false
  AND organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
);

-- Only org members can delete their org's templates (not system templates)
CREATE POLICY "Org members can delete their templates"
ON public.automation_rule_templates
FOR DELETE
TO authenticated
USING (
  is_system = false
  AND organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
);