-- ============================================================
-- Fix 8 · Increment 5: tighten the jobs backstop indexes (NULLS NOT DISTINCT)
-- ============================================================
-- jobs_client_period_uq / jobs_company_period_uq key on the nullable period_label with the
-- default NULLS DISTINCT, so two NULL-label jobs for the same (org, service_type, entity) never
-- conflict — the exact class of duplicate the rogue writers can create. Recreate both indexes
-- with NULLS NOT DISTINCT so a duplicate NULL-label job is rejected.
--
-- Conservative on purpose (rules 5-7): period_label stays NULLABLE, so an unrouted rogue writer
-- that creates a SINGLE unlabelled job still works — only a genuine duplicate (a second
-- unlabelled job for the same entity+service) is now blocked. This does NOT fix the LC-1
-- accept-vs-approve duplicate (those rows have DIFFERENT labels — 'Setup Pending' vs
-- 'YYYY Year-End'); that is handled by the single activation gate (Inc 8.2) + Setup-Pending
-- absorption (Inc 8.3). This is a backstop, not the core fix.
--
-- Preflight (rule 8): abort with a clear message BEFORE dropping anything if any duplicate group
-- exists (matching each index's exact coverage — no status filter), so a stale/racy duplicate
-- can never cause a half-applied migration. Live reconciliation reported all orgs clean.
-- Requires PostgreSQL 15+ (NULLS NOT DISTINCT).
-- ============================================================

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT 1 FROM public.jobs
     WHERE client_id IS NOT NULL AND company_id IS NULL
     GROUP BY organization_id, service_type, client_id, period_label
    HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'ABORT (Inc 8.5): % client-scoped duplicate job group(s) exist. Run public.lifecycle_reconciliation_report(org) and resolve before tightening jobs_client_period_uq. Nothing was changed.', n;
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT 1 FROM public.jobs
     WHERE company_id IS NOT NULL AND client_id IS NULL
     GROUP BY organization_id, service_type, company_id, period_label
    HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'ABORT (Inc 8.5): % company-scoped duplicate job group(s) exist. Resolve before tightening jobs_company_period_uq. Nothing was changed.', n;
  END IF;
END $$;

-- Preflight passed → recreate both indexes with NULLS NOT DISTINCT (same columns + partial
-- predicate as before, so no behavioural change other than closing the NULL-label gap).
DROP INDEX IF EXISTS public.jobs_client_period_uq;
CREATE UNIQUE INDEX jobs_client_period_uq
  ON public.jobs (organization_id, service_type, client_id, period_label) NULLS NOT DISTINCT
  WHERE client_id IS NOT NULL AND company_id IS NULL;

DROP INDEX IF EXISTS public.jobs_company_period_uq;
CREATE UNIQUE INDEX jobs_company_period_uq
  ON public.jobs (organization_id, service_type, company_id, period_label) NULLS NOT DISTINCT
  WHERE company_id IS NOT NULL AND client_id IS NULL;
