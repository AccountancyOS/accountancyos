-- ============================================================
-- Consolidation P2 — shared job/deadline core + manual Add Job through it
-- ============================================================
-- Extracts the per-service "create one job + its deadlines" logic into a single core
-- (lifecycle_upsert_job_with_deadlines). The quote engine (lifecycle_materialize_jobs)
-- is refactored to call it, and a new lifecycle_create_manual_job RPC calls the SAME
-- core — so manual Add Job, quote acceptance and onboarding approval are now ONE
-- implementation. Idempotent throughout. Behaviour-preserving for the engine.
-- ============================================================

-- 1. CORE: idempotent job + deadlines for one service+period. Deadline dates come from
--    the single calculate_deadline calculator. Returns the job id.
CREATE OR REPLACE FUNCTION public.lifecycle_upsert_job_with_deadlines(
  p_org uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_engagement_id uuid,
  p_service_code text,
  p_service_name text,
  p_period_start date,
  p_period_end date,
  p_period_label text,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filing_deadline date;
  v_job_id uuid;
BEGIN
  v_filing_deadline := CASE p_service_code
    WHEN 'company_accounts' THEN public.calculate_deadline('companies_house_accounts', p_period_start, p_period_end, '{}'::jsonb)
    WHEN 'confirmation_statement' THEN public.calculate_deadline('companies_house_confirmation', p_period_start, p_period_end, '{}'::jsonb)
    WHEN 'corporation_tax' THEN public.calculate_deadline('corporation_tax_filing', p_period_start, p_period_end, '{}'::jsonb)
    WHEN 'sa_mtd' THEN public.calculate_deadline('self_assessment', p_period_start, p_period_end, '{}'::jsonb)
    WHEN 'sa_non_mtd' THEN public.calculate_deadline('self_assessment', p_period_start, p_period_end, '{}'::jsonb)
    WHEN 'vat_return' THEN public.calculate_deadline('vat_return', p_period_start, p_period_end, '{}'::jsonb)
    WHEN 'payroll' THEN public.calculate_deadline('payroll_fps', p_period_start, p_period_end, '{}'::jsonb)
    ELSE NULL
  END;

  -- Job (idempotent on org + service + entity + period).
  SELECT id INTO v_job_id FROM public.jobs
    WHERE organization_id = p_org
      AND service_type = p_service_code
      AND COALESCE(client_id::text,'') = COALESCE(p_client_id::text,'')
      AND COALESCE(company_id::text,'') = COALESCE(p_company_id::text,'')
      AND COALESCE(period_label,'') = COALESCE(p_period_label,'')
    LIMIT 1;

  IF v_job_id IS NULL THEN
    INSERT INTO public.jobs (organization_id, client_id, company_id, job_name, service_type,
                             period_start, period_end, period_label, status, priority,
                             filing_deadline, automation_source, is_auto_generated, auto_generated_at,
                             generation_reason)
    VALUES (p_org, p_client_id, p_company_id,
            p_service_name || ' - ' || COALESCE(p_period_label,'Setup Pending'),
            p_service_code, p_period_start, p_period_end, p_period_label,
            'blank', 'normal', v_filing_deadline, 'template', true, now(),
            p_source)
    RETURNING id INTO v_job_id;
  END IF;

  -- Statutory deadline (idempotent on job + service + due_date) + CT payment.
  IF v_filing_deadline IS NOT NULL AND p_service_code IN ('company_accounts','confirmation_statement','corporation_tax','sa_mtd','sa_non_mtd','vat_return','payroll') THEN
    INSERT INTO public.deadlines (organization_id, client_id, company_id, engagement_id, job_id,
                                  name, deadline_type, filing_body, service_code,
                                  period_start, period_end, due_date, warning_date, status)
    SELECT p_org, p_client_id, p_company_id, p_engagement_id, v_job_id,
           p_service_name || ' - ' || COALESCE(p_period_label,''),
           'statutory',
           CASE p_service_code
             WHEN 'company_accounts' THEN 'COMPANIES_HOUSE'
             WHEN 'confirmation_statement' THEN 'COMPANIES_HOUSE'
             ELSE 'HMRC'
           END,
           p_service_code, p_period_start, p_period_end, v_filing_deadline,
           v_filing_deadline - INTERVAL '30 days', 'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.deadlines
      WHERE job_id = v_job_id AND service_code = p_service_code AND due_date = v_filing_deadline
    );

    IF p_service_code = 'corporation_tax' THEN
      INSERT INTO public.deadlines (organization_id, client_id, company_id, engagement_id, job_id,
                                    name, deadline_type, filing_body, service_code,
                                    period_start, period_end, due_date, warning_date, status)
      SELECT p_org, p_client_id, p_company_id, p_engagement_id, v_job_id,
             'Corporation Tax Payment - ' || COALESCE(p_period_label,''),
             'statutory', 'HMRC', 'corporation_tax_payment',
             p_period_start, p_period_end,
             public.calculate_deadline('corporation_tax_payment', p_period_start, p_period_end, '{}'::jsonb),
             public.calculate_deadline('corporation_tax_payment', p_period_start, p_period_end, '{}'::jsonb) - INTERVAL '30 days',
             'pending'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.deadlines
        WHERE job_id = v_job_id AND service_code = 'corporation_tax_payment'
      );
    END IF;
  END IF;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_upsert_job_with_deadlines(uuid,uuid,uuid,uuid,text,text,date,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_upsert_job_with_deadlines(uuid,uuid,uuid,uuid,text,text,date,date,text,text) TO authenticated, service_role;

-- 2. ENGINE refactored to call the core (period computation stays here; creation delegated).
CREATE OR REPLACE FUNCTION public.lifecycle_materialize_jobs(
  p_org uuid, p_client_id uuid, p_company_id uuid, p_partnership_id uuid, p_quote_id uuid, p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    PERFORM public.lifecycle_upsert_job_with_deadlines(
      p_org, v_target_client, v_target_company, v_engagement_id,
      v_line.code, v_line.service_name, v_period_start, v_period_end, v_period_label, p_source);
    v_jobs := v_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('status','ok','services', v_jobs);
END;
$$;

-- 3. MANUAL Add Job RPC — same core. For SA, p_tax_year_start selects the tax year
--    (e.g. 2024 => 2024/25); call once per chosen year for multi-year. Org-scoped + authorised.
CREATE OR REPLACE FUNCTION public.lifecycle_create_manual_job(
  p_client_id uuid,
  p_company_id uuid,
  p_service_code text,
  p_tax_year_start int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_svc record;
  v_today date := CURRENT_DATE;
  v_company record;
  v_period_start date; v_period_end date; v_period_label text;
  v_job_id uuid;
BEGIN
  IF p_client_id IS NULL AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'A client or company is required';
  END IF;

  -- Resolve org from the entity.
  IF p_client_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.companies WHERE id = p_company_id;
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;
  IF NOT public.user_has_organization_access(v_org) THEN
    RAISE EXCEPTION 'Access denied to organization' USING ERRCODE='42501';
  END IF;

  SELECT code, name INTO v_svc FROM public.services_catalog WHERE code = p_service_code AND organization_id = v_org LIMIT 1;
  IF v_svc.code IS NULL THEN
    SELECT code, name INTO v_svc FROM public.services_catalog WHERE code = p_service_code LIMIT 1;
  END IF;
  IF v_svc.code IS NULL THEN RAISE EXCEPTION 'Unknown service %', p_service_code; END IF;

  -- Period.
  IF p_service_code IN ('sa_mtd','sa_non_mtd') THEN
    IF p_tax_year_start IS NULL THEN
      -- default to the current tax year
      IF EXTRACT(MONTH FROM v_today) > 4 OR (EXTRACT(MONTH FROM v_today) = 4 AND EXTRACT(DAY FROM v_today) >= 6) THEN
        p_tax_year_start := EXTRACT(YEAR FROM v_today)::int;
      ELSE
        p_tax_year_start := EXTRACT(YEAR FROM v_today)::int - 1;
      END IF;
    END IF;
    v_period_start := make_date(p_tax_year_start, 4, 6);
    v_period_end := make_date(p_tax_year_start + 1, 4, 5);
    v_period_label := p_tax_year_start::text || '/' || substr((p_tax_year_start + 1)::text, 3, 2);
  ELSIF p_company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
    IF v_company.year_end_month IS NOT NULL AND v_company.year_end_day IS NOT NULL THEN
      v_period_end := make_date(EXTRACT(YEAR FROM v_today)::int, v_company.year_end_month, v_company.year_end_day);
      IF v_period_end > v_today THEN v_period_end := v_period_end - INTERVAL '1 year'; END IF;
      v_period_start := v_period_end - INTERVAL '1 year' + INTERVAL '1 day';
      v_period_label := to_char(v_period_end, 'YYYY') || ' Year-End';
    ELSE
      v_period_start := v_today; v_period_end := v_today + INTERVAL '30 days'; v_period_label := 'Setup Pending';
    END IF;
  ELSE
    v_period_start := v_today; v_period_end := v_today + INTERVAL '30 days'; v_period_label := 'Setup Pending';
  END IF;

  v_job_id := public.lifecycle_upsert_job_with_deadlines(
    v_org, p_client_id, p_company_id, NULL, v_svc.code, v_svc.name,
    v_period_start, v_period_end, v_period_label, 'manual');

  RETURN jsonb_build_object('job_id', v_job_id, 'period_label', v_period_label);
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_create_manual_job(uuid,uuid,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_create_manual_job(uuid,uuid,text,int) TO authenticated, service_role;
