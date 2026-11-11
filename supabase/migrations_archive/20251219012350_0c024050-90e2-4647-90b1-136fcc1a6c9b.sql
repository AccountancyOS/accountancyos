-- ============================================================
-- P0 Security Fix: Lock down public.invoices (org-member only)
-- The invoices table contains sensitive financial data
-- ============================================================

-- 1) Defence in depth - revoke anon access
REVOKE ALL ON TABLE public.invoices FROM anon;

-- Ensure RLS is enabled
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 2) Drop any permissive / legacy policies
DROP POLICY IF EXISTS "public read" ON public.invoices;
DROP POLICY IF EXISTS "anon read" ON public.invoices;
DROP POLICY IF EXISTS "read all" ON public.invoices;
DROP POLICY IF EXISTS "allow select" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Users can manage invoices in their organization" ON public.invoices;

-- 3) Create org-member SELECT policy
CREATE POLICY "org_members_select_invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = invoices.organization_id
  )
);

-- 4) Create org-member INSERT policy
CREATE POLICY "org_members_insert_invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = invoices.organization_id
  )
);

-- 5) Create org-member UPDATE policy
CREATE POLICY "org_members_update_invoices"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = invoices.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = invoices.organization_id
  )
);

-- 6) Create org-member DELETE policy
CREATE POLICY "org_members_delete_invoices"
ON public.invoices
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = invoices.organization_id
  )
);

-- 7) Grant privileges to authenticated (RLS still gates access)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;

-- 8) Performance index for RLS
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);