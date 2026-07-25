-- Proposal Phase 1 — Task 1 (FOUNDATION): quote_lines carry exact compliance periods,
-- and the single-source job engine honours them.
--
-- WHY: A proposal (quote) must be able to pin the EXACT period per service line so that
-- acceptance materializes the right separate jobs (SA per tax year, Accounts per CH period,
-- VAT per stagger-generated period, etc.). Today lifecycle_materialize_jobs COMPUTES one
-- period per line from CURRENT_DATE. This change lets a line carry its own period; the engine
-- consumes it when present and otherwise keeps the historical computed behaviour verbatim.
--
-- ADDITIVE + BACKWARD-COMPATIBLE:
--   * Three nullable columns on quote_lines (period_start / period_end / period_label).
--     Existing lines are NULL → old computed behaviour is unchanged.
--   * lifecycle_materialize_jobs is re-issued from its LIVE body (catalog_functions
--     include_source, def hash bb4b609f86e88ec7606363147483065f as of 2026-07-25) — NOT the
--     git file, which may have diverged. Every line of the original body is preserved
--     byte-for-byte. The ONLY change: after the existing period-computation IF/ELSIF chain,
--     an explicit per-line period wins via COALESCE (see the marked block).
--
-- RPC-replacement discipline: based on the LIVE body; single additive semantic change.

ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS period_label text;

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

  RETURN jsonb_build_object('status','ok','services', v_jobs);
END;
$function$;