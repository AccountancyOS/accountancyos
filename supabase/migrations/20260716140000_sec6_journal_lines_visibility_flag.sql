-- ============================================================
-- SEC-6 (completion): journal_lines portal reads must honour show_detailed_ledger
-- ============================================================
-- SEC-6 (20260713130000) rewrote the portal SELECT policies on 9 bookkeeping/invoicing tables to
-- require the per-flag toggles in portal_visibility_settings. It MISSED public.journal_lines, which
-- carries its own portal read policy from 20260605122942:
--
--   CREATE POLICY "Portal bookkeeping read journal lines" ON public.journal_lines
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM public.journals j WHERE j.id = journal_lines.journal_id
--       AND public.portal_can_access_bookkeeping(j.client_id, j.company_id)));
--
-- That gates on "does this portal user have ANY bookkeeping access to the entity" and ignores the
-- flags entirely — the exact defect SEC-6 exists to close. journal_lines is double-entry line
-- detail, i.e. precisely what show_detailed_ledger is meant to hide; its sibling ledger_entries is
-- already gated on that flag (20260713130000:73-76). Nothing has ever dropped or replaced this
-- policy, so it is still live.
--
-- REACHABILITY (be honest about it): in the git-visible schema public.journals has RLS enabled
-- (20251127012417:184) but NO SELECT policy at all — only journals_no_direct_insert/update/delete
-- (20251217154236), which are WITH CHECK(false)/USING(false) write blocks. RLS applies to tables
-- referenced inside a policy's USING expression, so that EXISTS should evaluate false for every
-- non-superuser and journal_lines should be unreadable today. BUT the accountant frontend selects
-- from public.journals over PostgREST (JournalsTab.tsx:45, JournalEditor.tsx:225, OpsHealth.tsx:219),
-- which only works if a SELECT policy exists LIVE that is absent from git — and live has diverged
-- from git on this project before. There is also no bookkeeping data yet, so an always-empty
-- Journals tab would not have been noticed either way.
--
-- Therefore this migration does NOT rely on journals lacking a SELECT policy. It fixes the
-- SPECIFICATION so the policy is correct whether or not journals is readable: reads require the
-- flag. If journals is unreadable the policy is simply fail-closed (zero rows), which is safe; if a
-- live SELECT policy on journals does exist, this closes a real read leak.
--
-- Scope: journal_lines only. The 9 tables verified after SEC-6 applied are untouched.
-- Additive/safe: no data change, no grants, no widening — strictly narrows an existing SELECT
-- policy by ANDing the flag requirement onto the access check that was already there.
-- Idempotent: safe to re-run (dynamic drop + drop-by-name, then CREATE).
-- ============================================================

-- 1. Drop any portal SELECT policy on journal_lines DYNAMICALLY (drift-proof: matches by the portal
-- access helpers rather than by name, so it converges regardless of live policy-name churn — the
-- same approach SEC-6 used, and the reason SEC-6 landed cleanly).
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

-- Belt and braces: the known legacy name, in case its qual was edited live and escaped the match.
DROP POLICY IF EXISTS "Portal bookkeeping read journal lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Portal clients view journal lines when permitted" ON public.journal_lines;

-- 2. Canonical flag-gated policy.
-- Mirrors the ledger_entries access model (same flag) using the parent-join shape SEC-6 used for
-- invoice_lines: journal_lines has no client_id/company_id of its own, so entity scoping comes from
-- the parent journal. portal_has_perm() itself first checks portal_can_access_bookkeeping, so the
-- original access gate is PRESERVED — this only ADDS the flag requirement. Client/company/portal-user
-- scoping is unchanged; portal_has_perm rejects any permission outside its whitelist (RETURN false),
-- and 'show_detailed_ledger' is in it.
CREATE POLICY "Portal clients view journal lines when permitted"
  ON public.journal_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journals j
    WHERE j.id = journal_lines.journal_id
      AND public.portal_has_perm(j.client_id, j.company_id, 'show_detailed_ledger')
  ));

-- 3. Diagnostic: surface (do NOT auto-drop) any residual portal FOR ALL policy on journal_lines.
-- RLS is permissive-OR, so a surviving FOR ALL would re-open the read bypass. Auto-dropping one
-- would also remove portal WRITES, which is not this migration's call to make.
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
