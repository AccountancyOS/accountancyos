-- Proposal Phase 1 — Task 6b-2: CT600 depends on the finalised Accounts.
--
-- Wire a corporation_tax (CT600) job to depend on the SAME company's
-- company_accounts job for the SAME accounts year-end, via jobs.prerequisite_job_id
-- (the column added additively in Task 6a, migration 20260725130000).
--
-- RPC-replacement discipline: the body below is the LIVE definition of
-- public.lifecycle_materialize_jobs (fetched via Lovable MCP catalog_functions;
-- live pg_get_functiondef md5 = 7765d483eb09fde669d762246a9f01e9, which already
-- carries the Task-1 per-line-period COALESCE change), reproduced BYTE-FOR-BYTE,
-- with the ONLY addition being an idempotent linking UPDATE inserted immediately
-- before the final RETURN. No existing arm, branch, period math, or the Task-1
-- COALESCE lines are altered. Additive only. System B is left dormant;
-- calculate_deadline and the UI are untouched.

CREATE OR REPLACE FUNCTION public.lifecycle_materialize_jobs(p_org uuid, p_client_id uuid, p_company_id uuid, p_partnership_id uuid, p_quote_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := CURRENT_DATE;
  v_company record;
  v_tax_year_start date; v_tax_year_end date;
  v_line record; v_frequency text;
  v_target_client uuid; v_target_company uuid; v_engagement_id uuid;
  v_period_start date; v_period_end date; v_period_label text;
  v_jobs int := 0;
BEGIN
  IF p_company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  ELSE
    SELECT NULL::uuid AS id, NULL::int AS year_end_month, NULL::int AS year_end_day INTO v_company;
  END IF;

  IF EXTRACT(MONTH FROM v_today) > 4
     OR (EXTRACT(MONTH FROM v_today) = 4 AND EXTRACT(DAY FROM v_today) >= 6) THEN
    v_tax_year_start := make_date(EXTRACT(YEAR FROM v_today)::int, 4, 6);
  ELSE
    v_tax_year_start := make_date(EXTRACT(YEAR FROM v_today)::int - 1, 4, 6);
  END IF;
  v_tax_year_end := v_tax_year_start + INTERVAL '1 year' - INTERVAL '1 day';

  FOR v_line IN
    SELECT ql.*, sc.entity_scope, sc.code, sc.name AS service_name
    FROM public.quote_lines ql
    JOIN public.services_catalog sc ON sc.id = ql.service_id
    WHERE ql.quote_id = p_quote_id
  LOOP
    v_frequency := CASE WHEN v_line.billing_frequency = 'monthly' THEN 'monthly' ELSE 'one_off' END;

    IF v_line.entity_scope = 'company'
       OR (v_line.entity_scope = 'either' AND p_company_id IS NOT NULL
           AND v_line.code NOT IN ('sa_mtd','sa_non_mtd','cgt_60_day')) THEN
      v_target_company := p_company_id; v_target_client := NULL;
    ELSIF v_line.entity_scope = 'partnership' THEN
      v_target_client := COALESCE(p_partnership_id, p_client_id); v_target_company := NULL;
    ELSE
      v_target_client := p_client_id; v_target_company := NULL;
    END IF;
    IF v_target_client IS NULL AND v_target_company IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_engagement_id FROM public.engagements
      WHERE quote_id = p_quote_id AND service_id = v_line.service_id LIMIT 1;
    IF v_engagement_id IS NULL THEN
      INSERT INTO public.engagements
        (organization_id, client_id, company_id, service_id, quote_id, frequency, start_date, status, activated_at)
      VALUES
        (p_org, v_target_client, v_target_company, v_line.service_id, p_quote_id, v_frequency, v_today, 'active', now())
      RETURNING id INTO v_engagement_id;
    END IF;

    v_period_start := NULL; v_period_end := NULL; v_period_label := NULL;
    IF v_target_company IS NOT NULL AND v_company.year_end_month IS NOT NULL AND v_company.year_end_day IS NOT NULL THEN
      v_period_end := make_date(EXTRACT(YEAR FROM v_today)::int, v_company.year_end_month, v_company.year_end_day);
      IF v_period_end > v_today THEN v_period_end := v_period_end - INTERVAL '1 year'; END IF;
      v_period_start := v_period_end - INTERVAL '1 year' + INTERVAL '1 day';
      v_period_label := to_char(v_period_end, 'YYYY') || ' Year-End';
    ELSIF v_line.code IN ('sa_mtd','sa_non_mtd') THEN
      v_period_start := v_tax_year_start; v_period_end := v_tax_year_end;
      v_period_label := EXTRACT(YEAR FROM v_tax_year_start)::text || '/' || substr(EXTRACT(YEAR FROM v_tax_year_end)::text, 3, 2);
    ELSIF v_line.code = 'payroll' THEN
      v_period_start := date_trunc('month', v_today)::date;
      v_period_end := (date_trunc('month', v_today) + INTERVAL '1 month - 1 day')::date;
      v_period_label := to_char(v_today, 'Mon YYYY');
    ELSE
      v_period_start := v_today; v_period_end := v_today + INTERVAL '30 days'; v_period_label := 'Setup Pending';
    END IF;

    -- Proposal Phase 1 T1 (the ONLY behavioural change): an explicit per-line period set on
    -- the quote_line wins over the computed fallback above. Fully backward-compatible — a NULL
    -- line period (every pre-existing line) falls straight through to the computed value.
    v_period_start := COALESCE(v_line.period_start, v_period_start);
    v_period_end   := COALESCE(v_line.period_end,   v_period_end);
    v_period_label := COALESCE(NULLIF(v_line.period_label, ''), v_period_label);

    PERFORM public.lifecycle_upsert_job_with_deadlines(
      p_org, v_target_client, v_target_company, v_engagement_id,
      v_line.code, v_line.service_name, v_period_start, v_period_end, v_period_label, p_source);
    v_jobs := v_jobs + 1;
  END LOOP;

  -- Proposal Phase 1 T6b-2 (the ONLY addition in this migration): a CT600 job depends on
  -- the finalised Accounts for the SAME company + SAME accounts year-end. Idempotent —
  -- only writes when the link differs, and only when we are materializing for a company.
  -- The ct.period_end IS NOT NULL guard prevents a NULL period_end from cross-linking a
  -- CT600 to an Accounts job of a different (or unknown) accounts year.
  IF p_company_id IS NOT NULL THEN
    UPDATE public.jobs ct
       SET prerequisite_job_id = acc.id
      FROM public.jobs acc
     WHERE ct.organization_id = p_org
       AND ct.company_id      = p_company_id
       AND ct.service_type    = 'corporation_tax'
       AND ct.period_end      IS NOT NULL
       AND acc.organization_id = p_org
       AND acc.company_id      = p_company_id
       AND acc.service_type    = 'company_accounts'
       AND acc.period_end      = ct.period_end          -- same accounts year-end
       AND ct.prerequisite_job_id IS DISTINCT FROM acc.id;
  END IF;

  RETURN jsonb_build_object('status','ok','services', v_jobs);
END;
$function$;
