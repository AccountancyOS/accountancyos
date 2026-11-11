-- ============================================================
-- Consolidation P1 — the ONE canonical job + deadline engine
-- ============================================================
-- Single source of truth for materialising engagements + jobs + deadlines from an
-- accepted quote. Idempotent (dedupes engagements on quote+service, jobs on
-- org+entity+service+period, deadlines on job+service+due_date). Every caller —
-- quote acceptance, onboarding approval, manual Add Job, rollover — routes through
-- this, so the same client/service/period can never produce two jobs again.
--
-- This body is a faithful extraction of the (correct) logic currently inline in
-- public_accept_quote_by_token (20260625070935): tax-year + company-year-end +
-- payroll period computation, calculate_deadline per service, statutory deadline
-- rows + the extra CT payment deadline. No behavioural change vs that path; the
-- next migrations route approve/accept to call it (removing the duplicated inline
-- copies). Additive: nothing calls it yet, so this migration changes no behaviour.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lifecycle_materialize_jobs(
  p_org uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_partnership_id uuid,
  p_quote_id uuid,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today           date := CURRENT_DATE;
  v_company         record;
  v_tax_year_start  date;
  v_tax_year_end    date;
  v_line            record;
  v_frequency       text;
  v_target_client   uuid;
  v_target_company  uuid;
  v_engagement_id   uuid;
  v_period_start    date;
  v_period_end      date;
  v_period_label    text;
  v_filing_deadline date;
  v_job_id          uuid;
  v_jobs_created    int := 0;
  v_jobs_reused     int := 0;
BEGIN
  -- Company year-end (for company-period services). NULL fields if no company.
  IF p_company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  ELSE
    SELECT NULL::uuid AS id, NULL::int AS year_end_month, NULL::int AS year_end_day INTO v_company;
  END IF;

  -- Current UK tax year (6 Apr – 5 Apr).
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

    -- Engagement (idempotent on quote + service).
    SELECT id INTO v_engagement_id FROM public.engagements
      WHERE quote_id = p_quote_id AND service_id = v_line.service_id
      LIMIT 1;
    IF v_engagement_id IS NULL THEN
      INSERT INTO public.engagements
        (organization_id, client_id, company_id, service_id, quote_id, frequency, start_date, status, activated_at)
      VALUES
        (p_org, v_target_client, v_target_company, v_line.service_id, p_quote_id,
         v_frequency, v_today, 'active', now())
      RETURNING id INTO v_engagement_id;
    END IF;

    -- Period + filing deadline per service.
    v_period_start := NULL; v_period_end := NULL; v_period_label := NULL; v_filing_deadline := NULL;
    IF v_target_company IS NOT NULL AND v_company.year_end_month IS NOT NULL AND v_company.year_end_day IS NOT NULL THEN
      v_period_end := make_date(EXTRACT(YEAR FROM v_today)::int, v_company.year_end_month, v_company.year_end_day);
      IF v_period_end > v_today THEN v_period_end := v_period_end - INTERVAL '1 year'; END IF;
      v_period_start := v_period_end - INTERVAL '1 year' + INTERVAL '1 day';
      v_period_label := to_char(v_period_end, 'YYYY') || ' Year-End';
    ELSIF v_line.code IN ('sa_mtd','sa_non_mtd') THEN
      v_period_start := v_tax_year_start;
      v_period_end := v_tax_year_end;
      v_period_label := EXTRACT(YEAR FROM v_tax_year_start)::text || '/' || substr(EXTRACT(YEAR FROM v_tax_year_end)::text, 3, 2);
    ELSIF v_line.code = 'payroll' THEN
      v_period_start := date_trunc('month', v_today)::date;
      v_period_end := (date_trunc('month', v_today) + INTERVAL '1 month - 1 day')::date;
      v_period_label := to_char(v_today, 'Mon YYYY');
    ELSE
      v_period_start := v_today;
      v_period_end := v_today + INTERVAL '30 days';
      v_period_label := 'Setup Pending';
    END IF;

    v_filing_deadline := CASE v_line.code
      WHEN 'company_accounts' THEN public.calculate_deadline('companies_house_accounts', v_period_start, v_period_end, '{}'::jsonb)
      WHEN 'confirmation_statement' THEN public.calculate_deadline('companies_house_confirmation', v_period_start, v_period_end, '{}'::jsonb)
      WHEN 'corporation_tax' THEN public.calculate_deadline('corporation_tax_filing', v_period_start, v_period_end, '{}'::jsonb)
      WHEN 'sa_mtd' THEN public.calculate_deadline('self_assessment', v_period_start, v_period_end, '{}'::jsonb)
      WHEN 'sa_non_mtd' THEN public.calculate_deadline('self_assessment', v_period_start, v_period_end, '{}'::jsonb)
      WHEN 'vat_return' THEN public.calculate_deadline('vat_return', v_period_start, v_period_end, '{}'::jsonb)
      WHEN 'payroll' THEN public.calculate_deadline('payroll_fps', v_period_start, v_period_end, '{}'::jsonb)
      ELSE NULL
    END;

    -- Job (idempotent on org + service + entity + period).
    SELECT id INTO v_job_id FROM public.jobs
      WHERE organization_id = p_org
        AND service_type = v_line.code
        AND COALESCE(client_id::text,'') = COALESCE(v_target_client::text,'')
        AND COALESCE(company_id::text,'') = COALESCE(v_target_company::text,'')
        AND COALESCE(period_label,'') = COALESCE(v_period_label,'')
      LIMIT 1;

    IF v_job_id IS NULL THEN
      INSERT INTO public.jobs (organization_id, client_id, company_id, job_name, service_type,
                               period_start, period_end, period_label, status, priority,
                               filing_deadline, automation_source, is_auto_generated, auto_generated_at,
                               generation_reason)
      VALUES (p_org, v_target_client, v_target_company,
              v_line.service_name || ' - ' || COALESCE(v_period_label,'Setup Pending'),
              v_line.code, v_period_start, v_period_end, v_period_label,
              'blank', 'normal', v_filing_deadline, 'template', true, now(),
              p_source)
      RETURNING id INTO v_job_id;
      v_jobs_created := v_jobs_created + 1;
    ELSE
      v_jobs_reused := v_jobs_reused + 1;
    END IF;

    -- Statutory deadline (idempotent on job + service + due_date).
    IF v_filing_deadline IS NOT NULL AND v_line.code IN ('company_accounts','confirmation_statement','corporation_tax','sa_mtd','sa_non_mtd','vat_return','payroll') THEN
      INSERT INTO public.deadlines (organization_id, client_id, company_id, engagement_id, job_id,
                                    name, deadline_type, filing_body, service_code,
                                    period_start, period_end, due_date, warning_date, status)
      SELECT p_org, v_target_client, v_target_company, v_engagement_id, v_job_id,
             v_line.service_name || ' - ' || COALESCE(v_period_label,''),
             'statutory',
             CASE v_line.code
               WHEN 'company_accounts' THEN 'COMPANIES_HOUSE'
               WHEN 'confirmation_statement' THEN 'COMPANIES_HOUSE'
               ELSE 'HMRC'
             END,
             v_line.code, v_period_start, v_period_end, v_filing_deadline,
             v_filing_deadline - INTERVAL '30 days', 'pending'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.deadlines
        WHERE job_id = v_job_id AND service_code = v_line.code AND due_date = v_filing_deadline
      );

      IF v_line.code = 'corporation_tax' THEN
        INSERT INTO public.deadlines (organization_id, client_id, company_id, engagement_id, job_id,
                                      name, deadline_type, filing_body, service_code,
                                      period_start, period_end, due_date, warning_date, status)
        SELECT p_org, v_target_client, v_target_company, v_engagement_id, v_job_id,
               'Corporation Tax Payment - ' || COALESCE(v_period_label,''),
               'statutory', 'HMRC', 'corporation_tax_payment',
               v_period_start, v_period_end,
               public.calculate_deadline('corporation_tax_payment', v_period_start, v_period_end, '{}'::jsonb),
               public.calculate_deadline('corporation_tax_payment', v_period_start, v_period_end, '{}'::jsonb) - INTERVAL '30 days',
               'pending'
        WHERE NOT EXISTS (
          SELECT 1 FROM public.deadlines
          WHERE job_id = v_job_id AND service_code = 'corporation_tax_payment'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status','ok','jobs_created', v_jobs_created, 'jobs_reused', v_jobs_reused);
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_materialize_jobs(uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_materialize_jobs(uuid, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
