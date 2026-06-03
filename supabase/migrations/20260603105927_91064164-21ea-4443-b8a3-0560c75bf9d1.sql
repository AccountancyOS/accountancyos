
-- 1. Fix conflicting status constraints on onboarding_applications
ALTER TABLE public.onboarding_applications
  DROP CONSTRAINT IF EXISTS chk_onboarding_applications_status;
ALTER TABLE public.onboarding_applications
  DROP CONSTRAINT IF EXISTS onboarding_applications_status_check;

-- Normalise legacy values
UPDATE public.onboarding_applications
   SET status = 'in_progress'
 WHERE status IN ('pending','sent','draft');
UPDATE public.onboarding_applications
   SET status = 'for_review'
 WHERE status = 'aml_review';
UPDATE public.onboarding_applications
   SET status = 'approved'
 WHERE status = 'contracts_signed';

ALTER TABLE public.onboarding_applications
  ADD CONSTRAINT onboarding_applications_status_check
  CHECK (status = ANY (ARRAY[
    'draft','in_progress',
    'engagement_pending','aml_pending','billing_pending','portal_pending',
    'for_review','needs_client_action',
    'approved','rejected','cancelled'
  ]));

-- 2. Add accepted_snapshot to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS accepted_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS accepted_ip text,
  ADD COLUMN IF NOT EXISTS terms_version text;

-- 3. Lock quote_lines once quote.status = 'accepted'
CREATE OR REPLACE FUNCTION public.prevent_accepted_quote_line_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_quote_id uuid;
BEGIN
  v_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
  SELECT status INTO v_status FROM public.quotes WHERE id = v_quote_id;
  IF v_status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot modify line items on an accepted quote (quote_id: %). Issue a new quote instead.', v_quote_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_accepted_quote_line_changes ON public.quote_lines;
CREATE TRIGGER trg_prevent_accepted_quote_line_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_accepted_quote_line_changes();

-- 4. Update public_accept_quote_by_token: write snapshot + create onboarding record
CREATE OR REPLACE FUNCTION public.public_accept_quote_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tok record;
  v_quote record;
  v_lead record;
  v_org uuid;
  v_client_id uuid;
  v_company_id uuid;
  v_partnership_id uuid;
  v_has_individual boolean := false;
  v_has_company boolean := false;
  v_has_partnership boolean := false;
  v_has_cgt boolean := false;
  v_is_mtd boolean := false;
  v_line record;
  v_target_client uuid;
  v_target_company uuid;
  v_frequency text;
  v_company_name text;
  v_engagement_id uuid;
  v_job_id uuid;
  v_period_start date;
  v_period_end date;
  v_period_label text;
  v_filing_deadline date;
  v_company record;
  v_today date := current_date;
  v_tax_year_start date;
  v_tax_year_end date;
  v_token_uuid uuid;
  v_snapshot jsonb;
  v_total_now numeric := 0;
  v_total_monthly numeric := 0;
  v_app_id uuid;
  v_app_type text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
BEGIN
  BEGIN
    v_token_uuid := p_token::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('error','invalid');
  END;

  SELECT * INTO v_tok FROM public.quote_acceptance_tokens WHERE token = v_token_uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('error','used'); END IF;
  IF v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now() THEN
    RETURN jsonb_build_object('error','expired');
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = v_tok.quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;

  IF v_quote.status = 'accepted' THEN
    UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE token = v_token_uuid AND used_at IS NULL;
    SELECT id INTO v_app_id FROM public.onboarding_applications WHERE quote_id = v_quote.id LIMIT 1;
    RETURN jsonb_build_object(
      'success', true,
      'client_id', v_quote.ported_to_client_id,
      'company_id', v_quote.ported_to_company_id,
      'onboarding_application_id', v_app_id,
      'replay', true
    );
  END IF;

  IF v_quote.status NOT IN ('draft','sent') THEN
    RETURN jsonb_build_object('error','not_open');
  END IF;

  v_org := v_quote.organization_id;

  SELECT
    bool_or(sc.entity_scope = 'individual') OR bool_or(sc.code IN ('sa_mtd','sa_non_mtd','cgt_60_day')),
    bool_or(sc.entity_scope = 'company'),
    bool_or(sc.entity_scope = 'partnership'),
    bool_or(sc.code = 'sa_mtd'),
    bool_or(sc.code = 'cgt_60_day')
  INTO v_has_individual, v_has_company, v_has_partnership, v_is_mtd, v_has_cgt
  FROM public.quote_lines ql
  JOIN public.services_catalog sc ON sc.id = ql.service_id
  WHERE ql.quote_id = v_quote.id;

  v_has_individual := COALESCE(v_has_individual, false);
  v_has_company := COALESCE(v_has_company, false);
  v_has_partnership := COALESCE(v_has_partnership, false);
  v_has_cgt := COALESCE(v_has_cgt, false);

  IF v_quote.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = v_quote.lead_id;
  END IF;

  v_client_id := v_quote.client_id;
  v_company_id := v_quote.company_id;

  IF v_has_individual AND v_client_id IS NULL AND v_lead.id IS NOT NULL THEN
    SELECT id INTO v_client_id FROM public.clients
      WHERE organization_id = v_org AND lower(email) = lower(v_lead.email)
        AND client_type IN ('sa_non_mtd','sa_mtd')
      LIMIT 1;
    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status, notes)
      VALUES (v_org, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone,
              CASE WHEN v_is_mtd THEN 'sa_mtd' ELSE 'sa_non_mtd' END,
              'pending', v_lead.notes)
      RETURNING id INTO v_client_id;

      INSERT INTO public.client_detail_sa (client_id, organization_id, is_mtd)
      VALUES (v_client_id, v_org, v_is_mtd) ON CONFLICT DO NOTHING;

      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (v_org, v_client_id, 'active', 'practice', now());
    END IF;

    IF v_has_cgt THEN
      INSERT INTO public.client_detail_cgt (client_id, organization_id)
      VALUES (v_client_id, v_org) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF v_has_company AND v_company_id IS NULL AND v_lead.id IS NOT NULL THEN
    v_company_name := COALESCE(
      NULLIF(v_lead.ch_company_profile->>'company_name',''),
      NULLIF(v_lead.ch_company_profile->>'title',''),
      trim(coalesce(v_lead.first_name,'') || ' ' || coalesce(v_lead.last_name,''))
    );

    SELECT id INTO v_company_id FROM public.companies
      WHERE organization_id = v_org AND lower(email) = lower(v_lead.email)
      LIMIT 1;
    IF v_company_id IS NULL THEN
      INSERT INTO public.companies (organization_id, company_name, email, phone, company_number,
                                    ch_company_profile, status, notes)
      VALUES (v_org, v_company_name, v_lead.email, v_lead.phone,
              v_lead.ch_company_profile->>'company_number',
              v_lead.ch_company_profile, 'pending', v_lead.notes)
      RETURNING id INTO v_company_id;

      INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
      VALUES (v_org, v_company_id, 'active', 'practice', now());
    END IF;
  END IF;

  IF v_has_partnership AND v_lead.id IS NOT NULL THEN
    SELECT id INTO v_partnership_id FROM public.clients
      WHERE organization_id = v_org AND lower(email) = lower(v_lead.email)
        AND client_type = 'partnership'
      LIMIT 1;
    IF v_partnership_id IS NULL THEN
      INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status, notes)
      VALUES (v_org, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone,
              'partnership', 'pending',
              coalesce(v_lead.notes,'') || E'\n[Action required] Partnership second contact required.')
      RETURNING id INTO v_partnership_id;
      INSERT INTO public.client_detail_partnership (client_id, organization_id)
      VALUES (v_partnership_id, v_org) ON CONFLICT DO NOTHING;
      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (v_org, v_partnership_id, 'active', 'practice', now());

      INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
      VALUES (v_org, 'PARTNERSHIP_SECOND_CONTACT_REQUIRED', 'client', v_partnership_id,
              jsonb_build_object('quote_id', v_quote.id, 'lead_id', v_lead.id));
    END IF;
    IF v_client_id IS NULL THEN v_client_id := v_partnership_id; END IF;
  END IF;

  IF v_company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies WHERE id = v_company_id;
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
    WHERE ql.quote_id = v_quote.id
  LOOP
    v_frequency := CASE WHEN v_line.billing_frequency = 'monthly' THEN 'monthly' ELSE 'one_off' END;

    IF v_line.entity_scope = 'company'
       OR (v_line.entity_scope = 'either' AND v_company_id IS NOT NULL
           AND v_line.code NOT IN ('sa_mtd','sa_non_mtd','cgt_60_day')) THEN
      v_target_company := v_company_id; v_target_client := NULL;
    ELSIF v_line.entity_scope = 'partnership' THEN
      v_target_client := COALESCE(v_partnership_id, v_client_id); v_target_company := NULL;
    ELSE
      v_target_client := v_client_id; v_target_company := NULL;
    END IF;

    IF v_target_client IS NULL AND v_target_company IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_engagement_id FROM public.engagements
      WHERE quote_id = v_quote.id AND service_id = v_line.service_id
      LIMIT 1;

    IF v_engagement_id IS NULL THEN
      INSERT INTO public.engagements
        (organization_id, client_id, company_id, service_id, quote_id, frequency, start_date, status, activated_at)
      VALUES
        (v_org, v_target_client, v_target_company, v_line.service_id, v_quote.id,
         v_frequency, v_today, 'active', now())
      RETURNING id INTO v_engagement_id;
    END IF;

    v_period_start := NULL; v_period_end := NULL; v_period_label := NULL; v_filing_deadline := NULL;

    IF v_target_company IS NOT NULL AND v_company.year_end_month IS NOT NULL AND v_company.year_end_day IS NOT NULL THEN
      v_period_end := make_date(EXTRACT(YEAR FROM v_today)::int, v_company.year_end_month, v_company.year_end_day);
      IF v_period_end > v_today THEN
        v_period_end := v_period_end - INTERVAL '1 year';
      END IF;
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

    SELECT id INTO v_job_id FROM public.jobs
      WHERE organization_id = v_org
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
      VALUES (v_org, v_target_client, v_target_company,
              v_line.service_name || ' - ' || COALESCE(v_period_label,'Setup Pending'),
              v_line.code, v_period_start, v_period_end, v_period_label,
              'blank', 'normal', v_filing_deadline, 'template', true, now(),
              'quote_acceptance:' || v_quote.id::text)
      RETURNING id INTO v_job_id;
    END IF;

    IF v_filing_deadline IS NOT NULL AND v_line.code IN ('company_accounts','confirmation_statement','corporation_tax','sa_mtd','sa_non_mtd','vat_return','payroll') THEN
      INSERT INTO public.deadlines (organization_id, client_id, company_id, engagement_id, job_id,
                                    name, deadline_type, filing_body, service_code,
                                    period_start, period_end, due_date, warning_date, status)
      SELECT v_org, v_target_client, v_target_company, v_engagement_id, v_job_id,
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
        SELECT v_org, v_target_client, v_target_company, v_engagement_id, v_job_id,
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

  -- Build accepted snapshot
  SELECT
    COALESCE(SUM(CASE WHEN billing_frequency = 'monthly' THEN 0 ELSE subtotal END), 0),
    COALESCE(SUM(CASE WHEN billing_frequency = 'monthly' THEN subtotal / 12.0 ELSE 0 END), 0)
  INTO v_total_now, v_total_monthly
  FROM public.quote_lines WHERE quote_id = v_quote.id;

  SELECT jsonb_build_object(
    'quote_id', v_quote.id,
    'quote_number', v_quote.quote_number,
    'currency', v_quote.currency,
    'total_amount', v_quote.total_amount,
    'total_now', v_total_now,
    'total_monthly', v_total_monthly,
    'valid_until', v_quote.valid_until,
    'accepted_at', now(),
    'lines', COALESCE(jsonb_agg(jsonb_build_object(
      'service_id', ql.service_id,
      'service_code', sc.code,
      'service_name', sc.name,
      'quantity', ql.quantity,
      'unit_price', ql.unit_price,
      'subtotal', ql.subtotal,
      'billing_frequency', ql.billing_frequency
    ) ORDER BY ql.line_order, ql.created_at), '[]'::jsonb)
  ) INTO v_snapshot
  FROM public.quote_lines ql
  JOIN public.services_catalog sc ON sc.id = ql.service_id
  WHERE ql.quote_id = v_quote.id;

  -- Lock the quote
  UPDATE public.quotes
     SET status = 'accepted',
         accepted_at = now(),
         sent_at = COALESCE(sent_at, now()),
         client_id = COALESCE(client_id, v_client_id),
         company_id = COALESCE(company_id, v_company_id),
         ported_to_client_id = COALESCE(ported_to_client_id, v_client_id),
         ported_to_company_id = COALESCE(ported_to_company_id, v_company_id),
         ported_at = COALESCE(ported_at, now()),
         accepted_snapshot = v_snapshot,
         accepted_by_name = COALESCE(accepted_by_name,
           trim(coalesce(v_lead.first_name,'') || ' ' || coalesce(v_lead.last_name,'')))
   WHERE id = v_quote.id;

  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET pipeline_stage = 'won', won_at = now(), converted_at = now()
     WHERE id = v_quote.lead_id;
  END IF;

  UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE token = v_token_uuid;

  -- Create onboarding application (idempotent on quote_id)
  SELECT id INTO v_app_id FROM public.onboarding_applications WHERE quote_id = v_quote.id LIMIT 1;
  IF v_app_id IS NULL THEN
    v_app_type := CASE WHEN v_has_company THEN 'company' ELSE 'individual' END;
    IF v_lead.id IS NOT NULL THEN
      v_first_name := v_lead.first_name;
      v_last_name := v_lead.last_name;
      v_email := v_lead.email;
      v_phone := v_lead.phone;
    ELSIF v_client_id IS NOT NULL THEN
      SELECT first_name, last_name, email, phone
        INTO v_first_name, v_last_name, v_email, v_phone
        FROM public.clients WHERE id = v_client_id;
    END IF;

    INSERT INTO public.onboarding_applications (
      organization_id, lead_id, quote_id, application_type, status,
      first_name, last_name, email, phone,
      company_name, company_number, client_id, company_id
    )
    VALUES (
      v_org, v_quote.lead_id, v_quote.id, v_app_type, 'in_progress',
      v_first_name, v_last_name, v_email, v_phone,
      CASE WHEN v_app_type = 'company' THEN COALESCE(v_company.company_name, v_company_name) ELSE NULL END,
      CASE WHEN v_app_type = 'company' THEN v_company.company_number ELSE NULL END,
      v_client_id, v_company_id
    )
    RETURNING id INTO v_app_id;
  END IF;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'QUOTE_ACCEPTED', 'quote', v_quote.id,
          jsonb_build_object('client_id', v_client_id, 'company_id', v_company_id,
                             'onboarding_application_id', v_app_id, 'source','public_token'));

  IF v_client_id IS NOT NULL THEN
    INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
    VALUES (v_org, 'CLIENT_ONBOARDING_STARTED', 'client', v_client_id,
            jsonb_build_object('quote_id', v_quote.id, 'onboarding_application_id', v_app_id));
  END IF;
  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
    VALUES (v_org, 'CLIENT_ONBOARDING_STARTED', 'company', v_company_id,
            jsonb_build_object('quote_id', v_quote.id, 'onboarding_application_id', v_app_id));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'company_id', v_company_id,
    'onboarding_application_id', v_app_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_accept_quote_by_token(text) TO anon, authenticated;
