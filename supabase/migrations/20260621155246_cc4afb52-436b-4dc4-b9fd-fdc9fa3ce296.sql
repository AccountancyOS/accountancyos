-- ============================================================
-- Sprint 1 — Increment 1 / Task 2
-- Idempotency backstop indexes (engagements / accountant_client_links / jobs)
-- ============================================================
-- Partial UNIQUE indexes that prevent duplicate activation outputs once the
-- canonical lifecycle starts creating them (later increments). Each index is
-- created ONLY if an in-migration duplicate preflight finds zero dup groups
-- for its key against current data; otherwise it RAISEs an ACTIONABLE WARNING
-- (key values, row ids, count, inspection query) and SKIPS that one index so
-- the migration still applies. Only the data-duplicate case is downgraded;
-- schema/syntax errors are NOT caught and fail loudly.
--
-- IMPORTANT (completion semantics): a skipped index means that class is NOT
-- protected yet. Treat the migration as INCOMPLETE for any class that WARNs;
-- resolve the duplicates and re-run (the IF NOT EXISTS makes already-created
-- indexes no-ops, so re-running only fills the gaps).
--
-- Indexes (all partial):
--   engagements_quote_service_uq  (quote_id, service_id) WHERE quote_id IS NOT NULL
--   acl_active_client_uq          (practice_id, client_id)  WHERE client_id  IS NOT NULL AND status='active'
--   acl_active_company_uq         (practice_id, company_id) WHERE company_id IS NOT NULL AND status='active'
--   jobs_client_period_uq         (organization_id, service_type, client_id,  period_label) WHERE client_id  IS NOT NULL AND company_id IS NULL
--   jobs_company_period_uq        (organization_id, service_type, company_id, period_label) WHERE company_id IS NOT NULL AND client_id  IS NULL
-- The jobs split into two single-target partial indexes avoids NULL-distinct
-- semantics that a single nullable composite would suffer. A third both-set
-- index is intentionally omitted (code paths set client XOR company); the
-- both-set probe in the plan confirms whether any such rows exist.
-- ============================================================

-- 1) engagements (quote_id, service_id)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT quote_id, service_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.engagements
    WHERE quote_id IS NOT NULL
    GROUP BY quote_id, service_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'engagements_quote_service_uq: dup (quote_id=%, service_id=%) count=% rows=% — inspect: SELECT * FROM public.engagements WHERE quote_id=% AND service_id=%;',
      r.quote_id, r.service_id, r.c, r.row_ids, r.quote_id, r.service_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS engagements_quote_service_uq
      ON public.engagements (quote_id, service_id) WHERE quote_id IS NOT NULL;
  ELSE
    RAISE WARNING 'engagements_quote_service_uq SKIPPED: % dup group(s) — class NOT protected; resolve and re-run.', n;
  END IF;
END $$;

-- 2) accountant_client_links — one active link per (practice, client)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT practice_id, client_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.accountant_client_links
    WHERE client_id IS NOT NULL AND status = 'active'
    GROUP BY practice_id, client_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'acl_active_client_uq: dup (practice_id=%, client_id=%) count=% rows=% — inspect: SELECT * FROM public.accountant_client_links WHERE practice_id=% AND client_id=% AND status=''active'';',
      r.practice_id, r.client_id, r.c, r.row_ids, r.practice_id, r.client_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS acl_active_client_uq
      ON public.accountant_client_links (practice_id, client_id)
      WHERE client_id IS NOT NULL AND status = 'active';
  ELSE
    RAISE WARNING 'acl_active_client_uq SKIPPED: % dup group(s) — class NOT protected; resolve and re-run.', n;
  END IF;
END $$;

-- 3) accountant_client_links — one active link per (practice, company)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT practice_id, company_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.accountant_client_links
    WHERE company_id IS NOT NULL AND status = 'active'
    GROUP BY practice_id, company_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'acl_active_company_uq: dup (practice_id=%, company_id=%) count=% rows=% — inspect: SELECT * FROM public.accountant_client_links WHERE practice_id=% AND company_id=% AND status=''active'';',
      r.practice_id, r.company_id, r.c, r.row_ids, r.practice_id, r.company_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS acl_active_company_uq
      ON public.accountant_client_links (practice_id, company_id)
      WHERE company_id IS NOT NULL AND status = 'active';
  ELSE
    RAISE WARNING 'acl_active_company_uq SKIPPED: % dup group(s) — class NOT protected; resolve and re-run.', n;
  END IF;
END $$;

-- 4) jobs — client-scoped (client set, company null)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT organization_id, service_type, client_id, period_label, count(*) AS c, array_agg(id) AS row_ids
    FROM public.jobs
    WHERE client_id IS NOT NULL AND company_id IS NULL
    GROUP BY organization_id, service_type, client_id, period_label HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'jobs_client_period_uq: dup (org=%, service_type=%, client_id=%, period_label=%) count=% rows=% — inspect: SELECT * FROM public.jobs WHERE organization_id=% AND service_type=% AND client_id=% AND COALESCE(period_label,'''')=COALESCE(%,'''') AND company_id IS NULL;',
      r.organization_id, r.service_type, r.client_id, r.period_label, r.c, r.row_ids,
      r.organization_id, r.service_type, r.client_id, r.period_label;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_client_period_uq
      ON public.jobs (organization_id, service_type, client_id, period_label)
      WHERE client_id IS NOT NULL AND company_id IS NULL;
  ELSE
    RAISE WARNING 'jobs_client_period_uq SKIPPED: % dup group(s) — class NOT protected; resolve and re-run.', n;
  END IF;
END $$;

-- 5) jobs — company-scoped (company set, client null)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT organization_id, service_type, company_id, period_label, count(*) AS c, array_agg(id) AS row_ids
    FROM public.jobs
    WHERE company_id IS NOT NULL AND client_id IS NULL
    GROUP BY organization_id, service_type, company_id, period_label HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'jobs_company_period_uq: dup (org=%, service_type=%, company_id=%, period_label=%) count=% rows=% — inspect: SELECT * FROM public.jobs WHERE organization_id=% AND service_type=% AND company_id=% AND COALESCE(period_label,'''')=COALESCE(%,'''') AND client_id IS NULL;',
      r.organization_id, r.service_type, r.company_id, r.period_label, r.c, r.row_ids,
      r.organization_id, r.service_type, r.company_id, r.period_label;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_period_uq
      ON public.jobs (organization_id, service_type, company_id, period_label)
      WHERE company_id IS NOT NULL AND client_id IS NULL;
  ELSE
    RAISE WARNING 'jobs_company_period_uq SKIPPED: % dup group(s) — class NOT protected; resolve and re-run.', n;
  END IF;
END $$;
