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
-- REACHABILITY (verified against the LIVE database on 2026-07-16). public.journals has RLS enabled
-- (20251127012417:184), NOT forced, and carries TWO SELECT policies live:
--   1. "Users can view journals in their organization" — USING user_has_organization_access(
--      organization_id), from 20251127012417. The accountant path; correct and org-bounded.
--   2. a portal path — USING portal_can_access_bookkeeping(client_id, company_id) — which exists
--      LIVE but is ABSENT FROM GIT (live/git drift, confirmed by live inspection, not inferable
--      from this repo).
-- RLS is applied to tables referenced inside a policy's USING expression, so the EXISTS below
-- resolves for a portal user via (2). The gap this migration closes is therefore REACHABLE, not
-- theoretical: before this change, a portal user with any bookkeeping access to the entity could
-- read journal line detail while show_detailed_ledger was switched off.
--
-- (An earlier draft of this comment claimed journals had NO SELECT policy and that journal_lines
-- was consequently unreadable. That was wrong — it came from a line-based grep that missed the
-- two-line CREATE POLICY statement, and it also cited journals_no_direct_insert/update/delete,
-- which 20260218184412 had already dropped. Corrected here so the record is not misleading; the
-- executable SQL below is unchanged and was never affected by the error.)
--
-- OUT OF SCOPE, TRACKED SEPARATELY: policy (2) on journals itself carries NO show_* flag, so journal
-- HEADER rows stay portal-readable with show_detailed_ledger off even after this migration. Fixing
-- that means changing a live-only policy on a different table and needs its own migration and its
-- own decision. This migration is journal_lines only.
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
