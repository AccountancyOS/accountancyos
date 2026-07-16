-- ============================================================
-- SEC-6 (completion): journal_lines portal reads must honour show_detailed_ledger
-- ============================================================
-- See file header in 20260716140000 for full rationale. Summary: SEC-6 (20260713130000)
-- rewrote 9 portal SELECT policies to require per-flag toggles but missed
-- public.journal_lines, whose live portal read policy gates only on
-- portal_can_access_bookkeeping(). Line detail is exactly what show_detailed_ledger is
-- meant to hide (ledger_entries already gates on it). Strictly narrows an existing
-- SELECT policy; no grants, no widening. Drift-proof dynamic drop matches by helper
-- rather than by name.

-- 1. Drop any portal SELECT policy on journal_lines DYNAMICALLY
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_lines'
      AND cmd = 'SELECT'
      AND (
        qual ILIKE '%client_has_portal_access%'
        OR qual ILIKE '%portal_can_access_bookkeeping%'
        OR qual ILIKE '%portal_has_perm%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.journal_lines', r.policyname);
    RAISE NOTICE 'SEC-6/journal_lines: dropped portal SELECT policy %', r.policyname;
  END LOOP;
END $$;

-- Belt and braces
DROP POLICY IF EXISTS "Portal bookkeeping read journal lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Portal clients view journal lines when permitted" ON public.journal_lines;

-- 2. Canonical flag-gated policy (parent-join to journals for entity scoping)
CREATE POLICY "Portal clients view journal lines when permitted"
  ON public.journal_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journals j
    WHERE j.id = journal_lines.journal_id
      AND public.portal_has_perm(j.client_id, j.company_id, 'show_detailed_ledger')
  ));

-- 3. Diagnostic: warn on any residual portal FOR ALL policy on journal_lines
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_lines'
      AND cmd = 'ALL'
      AND (
        qual ILIKE '%client_has_portal_access%'
        OR qual ILIKE '%portal_can_access_bookkeeping%'
      )
  LOOP
    RAISE WARNING 'SEC-6 RESIDUAL: portal FOR ALL policy % on journal_lines still grants reads bypassing show_detailed_ledger — review.', r.policyname;
  END LOOP;
END $$;