-- ============================================================
-- P0 Security Fix: Lock down templates + automation_rule_templates
-- Remove all {public} role access, enforce org-member-only access
-- ============================================================

-- Phase 0: Defensive revokes (defense in depth)
REVOKE ALL ON TABLE public.automation_rule_templates FROM anon;
REVOKE ALL ON TABLE public.templates FROM anon;

-- ============================================================
-- Phase 1: automation_rule_templates - STRICT org-member only
-- (System templates contain proprietary logic - no global access)
-- ============================================================

-- 1A. Drop ALL legacy {public} policies
DROP POLICY IF EXISTS "Users can manage templates in their organization" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "Users can view templates in their organization" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "public read" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "anon read" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "allow select" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "read all" ON public.automation_rule_templates;

-- 1B. Drop the is_system=true global access policy (proprietary logic)
DROP POLICY IF EXISTS "Authenticated users can view system templates" ON public.automation_rule_templates;

-- 1C. Ensure RLS is enabled
ALTER TABLE public.automation_rule_templates ENABLE ROW LEVEL SECURITY;

-- 1D. Drop existing policies we're replacing (clean slate)
DROP POLICY IF EXISTS "org_members_select_automation_rule_templates" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "org_members_write_automation_rule_templates" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "Org members can create templates" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "Org members can update their templates" ON public.automation_rule_templates;
DROP POLICY IF EXISTS "Org members can delete their templates" ON public.automation_rule_templates;

-- 1E. Create strict org-member-only SELECT policy
CREATE POLICY "org_members_select_automation_rule_templates"
ON public.automation_rule_templates
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
);

-- 1F. Create org-member INSERT policy
CREATE POLICY "org_members_insert_automation_rule_templates"
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

-- 1G. Create org-member UPDATE policy (non-system only)
CREATE POLICY "org_members_update_automation_rule_templates"
ON public.automation_rule_templates
FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (is_system IS NULL OR is_system = false)
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
)
WITH CHECK (
  organization_id IS NOT NULL
  AND (is_system IS NULL OR is_system = false)
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
);

-- 1H. Create org-member DELETE policy (non-system only)
CREATE POLICY "org_members_delete_automation_rule_templates"
ON public.automation_rule_templates
FOR DELETE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (is_system IS NULL OR is_system = false)
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = automation_rule_templates.organization_id
  )
);

-- 1I. Grant privileges to authenticated (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.automation_rule_templates TO authenticated;

-- ============================================================
-- Phase 2: templates - auth required, system templates allowed
-- ============================================================

-- 2A. Drop ALL legacy {public} policies
DROP POLICY IF EXISTS "Users can manage templates in their organization" ON public.templates;
DROP POLICY IF EXISTS "Users can view templates in their organization or system templa" ON public.templates;
DROP POLICY IF EXISTS "Admins can insert templates" ON public.templates;
DROP POLICY IF EXISTS "Admins can update templates" ON public.templates;
DROP POLICY IF EXISTS "Admins can delete templates" ON public.templates;
DROP POLICY IF EXISTS "public read" ON public.templates;
DROP POLICY IF EXISTS "anon read" ON public.templates;
DROP POLICY IF EXISTS "allow select" ON public.templates;
DROP POLICY IF EXISTS "read all" ON public.templates;
DROP POLICY IF EXISTS "authenticated_view_templates" ON public.templates;

-- 2B. Ensure RLS is enabled
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- 2C. Create correct SELECT policy (auth required; system templates allowed; org templates require membership)
CREATE POLICY "authenticated_view_templates"
ON public.templates
FOR SELECT
TO authenticated
USING (
  -- System templates (org_id IS NULL) visible to all authenticated users
  organization_id IS NULL
  OR 
  -- Org templates visible to org members only
  EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = templates.organization_id
  )
);

-- 2D. Create org admin INSERT policy
CREATE POLICY "org_admins_insert_templates"
ON public.templates
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = templates.organization_id
      AND ou.role IN ('owner', 'admin')
  )
);

-- 2E. Create org admin UPDATE policy
CREATE POLICY "org_admins_update_templates"
ON public.templates
FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = templates.organization_id
      AND ou.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = templates.organization_id
      AND ou.role IN ('owner', 'admin')
  )
);

-- 2F. Create org admin DELETE policy
CREATE POLICY "org_admins_delete_templates"
ON public.templates
FOR DELETE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = templates.organization_id
      AND ou.role IN ('owner', 'admin')
  )
);

-- 2G. Grant privileges to authenticated (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.templates TO authenticated;

-- ============================================================
-- Phase 3: Performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_templates_org ON public.templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_rule_templates_org ON public.automation_rule_templates(organization_id);