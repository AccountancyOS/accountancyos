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
    RAISE WARNING 'engagements_quote_service_uq: dup (quote_id=%, service_id=%) count=% rows=%',
      r.quote_id, r.service_id, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS engagements_quote_service_uq
      ON public.engagements (quote_id, service_id) WHERE quote_id IS NOT NULL;
  ELSE
    RAISE WARNING 'engagements_quote_service_uq SKIPPED: % dup group(s)', n;
  END IF;
END $$;

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
    RAISE WARNING 'acl_active_client_uq: dup (practice_id=%, client_id=%) count=% rows=%',
      r.practice_id, r.client_id, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS acl_active_client_uq
      ON public.accountant_client_links (practice_id, client_id)
      WHERE client_id IS NOT NULL AND status = 'active';
  ELSE
    RAISE WARNING 'acl_active_client_uq SKIPPED: % dup group(s)', n;
  END IF;
END $$;

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
    RAISE WARNING 'acl_active_company_uq: dup (practice_id=%, company_id=%) count=% rows=%',
      r.practice_id, r.company_id, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS acl_active_company_uq
      ON public.accountant_client_links (practice_id, company_id)
      WHERE company_id IS NOT NULL AND status = 'active';
  ELSE
    RAISE WARNING 'acl_active_company_uq SKIPPED: % dup group(s)', n;
  END IF;
END $$;

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
    RAISE WARNING 'jobs_client_period_uq: dup (org=%, service_type=%, client_id=%, period_label=%) count=% rows=%',
      r.organization_id, r.service_type, r.client_id, r.period_label, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_client_period_uq
      ON public.jobs (organization_id, service_type, client_id, period_label)
      WHERE client_id IS NOT NULL AND company_id IS NULL;
  ELSE
    RAISE WARNING 'jobs_client_period_uq SKIPPED: % dup group(s)', n;
  END IF;
END $$;

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
    RAISE WARNING 'jobs_company_period_uq: dup (org=%, service_type=%, company_id=%, period_label=%) count=% rows=%',
      r.organization_id, r.service_type, r.company_id, r.period_label, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_period_uq
      ON public.jobs (organization_id, service_type, company_id, period_label)
      WHERE company_id IS NOT NULL AND client_id IS NULL;
  ELSE
    RAISE WARNING 'jobs_company_period_uq SKIPPED: % dup group(s)', n;
  END IF;
END $$;