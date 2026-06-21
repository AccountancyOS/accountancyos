-- =====================================================================
-- PHASE D: CANONICAL LIFECYCLE RPCS
-- Server-side, idempotent, feature-flag gated.
-- =====================================================================

-- Helper: confirm caller is a member of the org (Owner/Staff/Admin).
CREATE OR REPLACE FUNCTION public._canonical_caller_in_org(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_users
     WHERE organization_id = p_org AND user_id = auth.uid()
  );
$$;

-- Helper: read feature flag for an org (default false).
CREATE OR REPLACE FUNCTION public._canonical_spine_enabled(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT canonical_spine_v1 FROM public.org_settings WHERE organization_id = p_org LIMIT 1),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 1. lifecycle_activate_client_services(quote_id)
--    Materialise engagements from accepted quote lines, one per canonical service.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_activate_client_services(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote        RECORD;
  v_client_id    uuid;
  v_company_id   uuid;
  v_lead         RECORD;
  v_line         RECORD;
  v_eng_id       uuid;
  v_created      int := 0;
  v_skipped      int := 0;
  v_results      jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  IF NOT public._canonical_caller_in_org(v_quote.organization_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT public._canonical_spine_enabled(v_quote.organization_id) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'canonical_spine_v1 flag disabled',
      'quote_id', p_quote_id
    );
  END IF;

  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Quote % not accepted (status=%)', p_quote_id, v_quote.status;
  END IF;

  -- Resolve target client/company via lead -> conversion
  SELECT * INTO v_lead FROM public.leads WHERE id = v_quote.lead_id;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Quote % has no lead', p_quote_id;
  END IF;

  v_client_id  := v_lead.converted_client_id;
  v_company_id := v_lead.converted_company_id;

  IF v_client_id IS NULL AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'Lead % has not been converted to a client/company yet', v_lead.id;
  END IF;

  FOR v_line IN
    SELECT ql.*, sc.id AS svc_id
      FROM public.quote_lines ql
      JOIN public.services_catalog sc ON sc.id = ql.service_id
     WHERE ql.quote_id = p_quote_id
       AND ql.canonical_service_code IS NOT NULL
  LOOP
    -- Idempotent: find existing engagement keyed on (org, client/company, canonical_service_code)
    SELECT id INTO v_eng_id
      FROM public.engagements
     WHERE organization_id = v_quote.organization_id
       AND canonical_service_code = v_line.canonical_service_code
       AND COALESCE(client_id::text, '') = COALESCE(v_client_id::text, '')
       AND COALESCE(company_id::text, '') = COALESCE(v_company_id::text, '')
     LIMIT 1;

    IF v_eng_id IS NULL THEN
      INSERT INTO public.engagements (
        organization_id, client_id, company_id, service_id, quote_id,
        canonical_service_code, frequency, start_date, status, active, activated_at
      ) VALUES (
        v_quote.organization_id, v_client_id, v_company_id, v_line.service_id, p_quote_id,
        v_line.canonical_service_code,
        COALESCE(v_line.billing_frequency, 'one_off'),
        CURRENT_DATE, 'active', true, now()
      )
      RETURNING id INTO v_eng_id;
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'canonical_service_code', v_line.canonical_service_code,
        'engagement_id', v_eng_id,
        'action', 'created'
      );
    ELSE
      -- Re-activate if previously suspended/terminated
      UPDATE public.engagements
         SET status = 'active', active = true, activated_at = COALESCE(activated_at, now())
       WHERE id = v_eng_id AND status <> 'active';
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'canonical_service_code', v_line.canonical_service_code,
        'engagement_id', v_eng_id,
        'action', 'reused'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'quote_id', p_quote_id,
    'engagements_created', v_created,
    'engagements_reused', v_skipped,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_activate_client_services(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_activate_client_services(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. lifecycle_generate_jobs_for_service(engagement_id, period_start, period_end)
--    For each canonical_job_template under the engagement's canonical service,
--    create a job for the given period if one doesn't already exist.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_generate_jobs_for_service(
  p_engagement_id uuid,
  p_period_start date DEFAULT NULL,
  p_period_end   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eng       RECORD;
  v_svc       RECORD;
  v_tpl       RECORD;
  v_job_id    uuid;
  v_existing  uuid;
  v_created   int := 0;
  v_skipped   int := 0;
  v_results   jsonb := '[]'::jsonb;
  v_period_label text;
BEGIN
  SELECT * INTO v_eng FROM public.engagements WHERE id = p_engagement_id;
  IF v_eng IS NULL THEN
    RAISE EXCEPTION 'Engagement % not found', p_engagement_id;
  END IF;

  IF NOT public._canonical_caller_in_org(v_eng.organization_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT public._canonical_spine_enabled(v_eng.organization_id) THEN
    RETURN jsonb_build_object('status','skipped','reason','canonical_spine_v1 flag disabled');
  END IF;

  IF v_eng.canonical_service_code IS NULL THEN
    RAISE EXCEPTION 'Engagement % is not mapped to a canonical service', p_engagement_id;
  END IF;

  IF v_eng.status <> 'active' THEN
    RETURN jsonb_build_object('status','skipped','reason','engagement not active');
  END IF;

  SELECT * INTO v_svc FROM public.canonical_services WHERE code = v_eng.canonical_service_code;
  IF v_svc IS NULL OR NOT v_svc.creates_jobs THEN
    RETURN jsonb_build_object('status','skipped','reason','canonical service does not create jobs');
  END IF;

  v_period_label := CASE
    WHEN p_period_start IS NOT NULL AND p_period_end IS NOT NULL
      THEN to_char(p_period_start,'YYYY-MM-DD') || ' to ' || to_char(p_period_end,'YYYY-MM-DD')
    ELSE NULL
  END;

  FOR v_tpl IN
    SELECT * FROM public.canonical_job_templates
     WHERE canonical_service_code = v_eng.canonical_service_code AND active = true
  LOOP
    -- Idempotency key: org + entity + job_template_code + period
    SELECT id INTO v_existing
      FROM public.jobs
     WHERE organization_id = v_eng.organization_id
       AND job_template_code = v_tpl.job_template_code
       AND COALESCE(client_id::text,'') = COALESCE(v_eng.client_id::text,'')
       AND COALESCE(company_id::text,'') = COALESCE(v_eng.company_id::text,'')
       AND COALESCE(period_start::text,'') = COALESCE(p_period_start::text,'')
       AND COALESCE(period_end::text,'')   = COALESCE(p_period_end::text,'')
     LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.jobs (
        organization_id, client_id, company_id, job_name, service_type,
        canonical_service_code, job_template_code,
        period_start, period_end, period_label,
        status, priority, is_auto_generated, auto_generated_at, generation_reason,
        automation_source
      ) VALUES (
        v_eng.organization_id, v_eng.client_id, v_eng.company_id,
        v_tpl.display_name || COALESCE(' — ' || v_period_label, ''),
        v_eng.canonical_service_code, -- service_type kept human readable; canonical codes carry truth
        v_eng.canonical_service_code, v_tpl.job_template_code,
        p_period_start, p_period_end, v_period_label,
        COALESCE(v_tpl.default_status, 'blank'), 'normal', true, now(),
        'canonical_lifecycle',
        'canonical_spine_v1'
      )
      RETURNING id INTO v_job_id;
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'job_template_code', v_tpl.job_template_code,
        'job_id', v_job_id,
        'action', 'created'
      );
    ELSE
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'job_template_code', v_tpl.job_template_code,
        'job_id', v_existing,
        'action', 'reused'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','ok',
    'engagement_id', p_engagement_id,
    'jobs_created', v_created,
    'jobs_reused', v_skipped,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_generate_jobs_for_service(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_generate_jobs_for_service(uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. lifecycle_generate_deadlines_for_job(job_id, facts)
--    For every canonical_deadline_rule attached to the job's job_template,
--    compute the due_date from `facts` and upsert a deadline.
--    Missing required facts produce a `missing_fact` client_task instead.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_generate_deadlines_for_job(
  p_job_id uuid,
  p_facts  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job       RECORD;
  v_rule      RECORD;
  v_calc      jsonb;
  v_due       date;
  v_missing   text[];
  v_fact      text;
  v_created   int := 0;
  v_skipped   int := 0;
  v_missing_facts_logged int := 0;
  v_existing  uuid;
  v_results   jsonb := '[]'::jsonb;
  v_tax_year_end date;
  v_after_tax  boolean;
  v_fixed_txt  text;
  v_existing_dl record;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;

  IF NOT public._canonical_caller_in_org(v_job.organization_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT public._canonical_spine_enabled(v_job.organization_id) THEN
    RETURN jsonb_build_object('status','skipped','reason','canonical_spine_v1 flag disabled');
  END IF;

  IF v_job.job_template_code IS NULL OR v_job.canonical_service_code IS NULL THEN
    RAISE EXCEPTION 'Job % is not mapped to a canonical job template', p_job_id;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.canonical_deadline_rules
     WHERE active = true
       AND (job_template_code = v_job.job_template_code
            OR (job_template_code IS NULL AND canonical_service_code = v_job.canonical_service_code))
  LOOP
    v_calc := v_rule.calculation_method;
    v_due := NULL;
    v_missing := ARRAY[]::text[];

    -- Check required_facts presence in p_facts JSON
    IF v_rule.required_facts IS NOT NULL THEN
      FOREACH v_fact IN ARRAY v_rule.required_facts
      LOOP
        -- skip "fact" entries that actually reference another deadline_code we may have just made
        IF p_facts ? v_fact THEN
          CONTINUE;
        END IF;
        -- internal cross-deadline references are resolved later; not blocking
        IF v_fact IN ('companies_house_accounts_filing','ct600_filing','partnership_tax_return_filing') THEN
          CONTINUE;
        END IF;
        v_missing := v_missing || v_fact;
      END LOOP;
    END IF;

    IF array_length(v_missing, 1) > 0 THEN
      -- create a client_task as a missing-fact placeholder (idempotent on title+job)
      IF NOT EXISTS (
        SELECT 1 FROM public.client_tasks
         WHERE job_id = p_job_id
           AND title = 'Missing data: ' || v_rule.deadline_name
      ) THEN
        INSERT INTO public.client_tasks (
          organization_id, client_id, company_id, job_id,
          title, description, status, visibility
        ) VALUES (
          v_job.organization_id, v_job.client_id, v_job.company_id, p_job_id,
          'Missing data: ' || v_rule.deadline_name,
          'Cannot compute "' || v_rule.deadline_name || '" — missing fact(s): '
            || array_to_string(v_missing, ', '),
          'pending', 'internal'
        );
        v_missing_facts_logged := v_missing_facts_logged + 1;
      END IF;
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code,
        'action', 'missing_facts',
        'missing', v_missing
      );
      CONTINUE;
    END IF;

    -- Compute due_date from calculation_method (covers the common shapes)
    IF v_calc ? 'add_months_to' THEN
      v_due := ((p_facts->>(v_calc->>'add_months_to'))::date
                + ((v_calc->>'months')::int || ' months')::interval)::date;
    ELSIF v_calc ? 'add_to' THEN
      v_due := ((p_facts->>(v_calc->>'add_to'))::date
                + ((COALESCE(v_calc->>'months','0'))::int || ' months')::interval
                + ((COALESCE(v_calc->>'days','0'))::int || ' days')::interval)::date;
    ELSIF v_calc ? 'fixed_date' AND COALESCE((v_calc->>'after_tax_year')::boolean, false) THEN
      -- tax year of form '2024/25' → year-end 5 April 2025 → due = fixed_date in calendar year after tax_year_end
      v_tax_year_end := (
        SELECT (split_part(p_facts->>'tax_year','/',1)::int + 1)::text || '-04-05'
      )::date;
      v_fixed_txt := v_calc->>'fixed_date';
      v_due := to_date(v_fixed_txt || ' ' || (extract(year FROM v_tax_year_end)::int + 1)::text, 'DD Month YYYY');
    ELSIF v_calc ? 'offset_days_before' THEN
      -- Resolve against a previously created deadline by deadline_code on this job
      SELECT due_date INTO v_due FROM public.deadlines
       WHERE job_id = p_job_id AND deadline_code = (v_calc->>'offset_days_before')
       ORDER BY created_at DESC LIMIT 1;
      IF v_due IS NOT NULL THEN
        v_due := v_due - ((v_calc->>'default_days')::int);
      END IF;
    END IF;

    IF v_due IS NULL THEN
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code,
        'action', 'unsupported_calculation'
      );
      CONTINUE;
    END IF;

    -- Idempotent upsert keyed on (job_id, deadline_code)
    SELECT id INTO v_existing FROM public.deadlines
     WHERE job_id = p_job_id AND deadline_code = v_rule.deadline_code
     LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.deadlines (
        organization_id, client_id, company_id, engagement_id, job_id,
        name, deadline_type, service_code, canonical_service_code, deadline_code,
        due_date, status
      ) VALUES (
        v_job.organization_id, v_job.client_id, v_job.company_id, NULL, p_job_id,
        v_rule.deadline_name, v_rule.deadline_type, v_job.canonical_service_code,
        v_job.canonical_service_code, v_rule.deadline_code,
        v_due, 'open'
      );
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code, 'due_date', v_due, 'action', 'created'
      );
    ELSE
      UPDATE public.deadlines
         SET due_date = v_due, updated_at = now()
       WHERE id = v_existing AND status NOT IN ('completed','filed');
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code, 'due_date', v_due, 'action', 'updated'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','ok',
    'job_id', p_job_id,
    'deadlines_created', v_created,
    'deadlines_updated', v_skipped,
    'missing_fact_tasks', v_missing_facts_logged,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_generate_deadlines_for_job(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_generate_deadlines_for_job(uuid, jsonb) TO authenticated, service_role;