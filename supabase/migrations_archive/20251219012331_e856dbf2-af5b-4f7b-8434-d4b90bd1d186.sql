-- ============================================================
-- P0 Security Fix: Lock down public.leads (org-member only)
-- The leads table contains sensitive CRM data - must not be public
-- ============================================================

-- 1) Defence in depth - revoke anon access
REVOKE ALL ON TABLE public.leads FROM anon;

-- Ensure RLS is enabled
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 2) Drop any permissive / legacy policies
DROP POLICY IF EXISTS "public read" ON public.leads;
DROP POLICY IF EXISTS "anon read" ON public.leads;
DROP POLICY IF EXISTS "read all" ON public.leads;
DROP POLICY IF EXISTS "allow select" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Users can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads in their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can manage leads in their organization" ON public.leads;

-- 3) Create org-member SELECT policy
CREATE POLICY "org_members_select_leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = leads.organization_id
  )
);

-- 4) Create org-member INSERT policy
CREATE POLICY "org_members_insert_leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = leads.organization_id
  )
);

-- 5) Create org-member UPDATE policy
CREATE POLICY "org_members_update_leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = leads.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = leads.organization_id
  )
);

-- 6) Create org-member DELETE policy
CREATE POLICY "org_members_delete_leads"
ON public.leads
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = leads.organization_id
  )
);

-- 7) Grant privileges to authenticated (RLS still gates access)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;

-- 8) Performance index for RLS
CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads(organization_id);