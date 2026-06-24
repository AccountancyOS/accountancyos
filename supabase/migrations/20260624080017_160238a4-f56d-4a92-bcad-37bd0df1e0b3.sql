CREATE OR REPLACE FUNCTION public.resolve_company_director(
  p_company_id uuid,
  p_lead_id uuid,
  p_org_id uuid
)
RETURNS TABLE(first_name text, last_name text, email text, phone text, source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_name text;
  v_contact record;
  v_person record;
  v_officer jsonb;
  v_full_name text;
  v_comma_pos int;
  v_lead record;
BEGIN
  IF p_company_id IS NOT NULL THEN
    SELECT company_name INTO v_company_name FROM public.companies WHERE id = p_company_id;
  END IF;

  IF p_company_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE company_id = p_company_id
      AND role ILIKE 'director%'
    ORDER BY is_primary DESC NULLS LAST, created_at ASC
    LIMIT 1;

    IF v_contact.id IS NOT NULL AND COALESCE(trim(v_contact.name), '') <> '' THEN
      first_name := split_part(trim(v_contact.name), ' ', 1);
      last_name  := NULLIF(trim(substring(trim(v_contact.name) FROM position(' ' IN trim(v_contact.name) || ' ') + 1)), '');
      email := v_contact.email;
      phone := v_contact.phone;
      source := 'contacts';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF p_company_id IS NOT NULL THEN
    SELECT cp.first_name, cp.last_name, cp.email, cp.phone
      INTO v_person
    FROM public.company_officers co
    JOIN public.company_persons cp ON cp.id = co.person_id
    WHERE co.company_id = p_company_id
      AND co.role ILIKE 'director%'
      AND co.resigned_at IS NULL
    ORDER BY co.appointed_at ASC NULLS LAST
    LIMIT 1;

    IF v_person.first_name IS NOT NULL OR v_person.last_name IS NOT NULL THEN
      first_name := v_person.first_name;
      last_name := v_person.last_name;
      email := v_person.email;
      phone := v_person.phone;
      source := 'company_officers';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF p_company_id IS NOT NULL THEN
    SELECT officer INTO v_officer
    FROM public.companies c,
         LATERAL jsonb_array_elements(COALESCE(c.ch_company_profile->'officers','[]'::jsonb)) AS officer
    WHERE c.id = p_company_id
      AND lower(COALESCE(officer->>'officer_role','')) LIKE 'director%'
      AND (officer->>'resigned_on') IS NULL
    LIMIT 1;

    IF v_officer IS NOT NULL THEN
      v_full_name := COALESCE(v_officer->>'name', '');
      v_comma_pos := position(',' IN v_full_name);
      IF v_comma_pos > 0 THEN
        last_name := NULLIF(trim(substring(v_full_name FROM 1 FOR v_comma_pos - 1)), '');
        first_name := NULLIF(trim(substring(v_full_name FROM v_comma_pos + 1)), '');
      ELSE
        first_name := split_part(trim(v_full_name), ' ', 1);
        last_name  := NULLIF(trim(substring(trim(v_full_name) FROM position(' ' IN trim(v_full_name) || ' ') + 1)), '');
      END IF;
      IF first_name IS NOT NULL OR last_name IS NOT NULL THEN
        email := NULL;
        phone := NULL;
        source := 'ch_profile';
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF v_lead.id IS NOT NULL THEN
      v_full_name := trim(COALESCE(v_lead.first_name,'') || ' ' || COALESCE(v_lead.last_name,''));
      IF v_full_name <> ''
         AND lower(v_full_name) <> lower(COALESCE(v_company_name,''))
         AND lower(COALESCE(v_lead.first_name,'')) <> lower(COALESCE(v_company_name,'')) THEN
        first_name := v_lead.first_name;
        last_name := v_lead.last_name;
        email := v_lead.email;
        phone := v_lead.phone;
        source := 'lead';
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_company_director(uuid, uuid, uuid) TO authenticated, service_role;

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
  v_canonical boolean;
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
  v_director record;
  v_sa_first text;
  v_sa_last text;
  v_sa_email text;
  v_sa_phone text;
  v_sa_blocked boolean := false;
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
    RETURN jsonb_build_object('success', true, 'client_id', v_quote.ported_to_client_id, 'company_id', v_quote.ported_to_company_id, 'replay', true);
  END IF;

  IF v_quote.status NOT IN ('draft','sent') THEN
    RETURN jsonb_build_object('error','not_open');
  END IF;

  v_org := v_quote.organization_id;
  v_canonical := public.is_canonical_lifecycle_enabled(v_org);

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

      IF NOT v_canonical THEN
      INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
      VALUES (v_org, v_company_id, 'active', 'practice', now());
      END IF;
    END IF;
  END IF;

  IF v_has_individual AND v_client_id IS NULL AND v_lead.id IS NOT NULL THEN
    IF v_has_company THEN
      SELECT * INTO v_director FROM public.resolve_company_director(v_company_id, v_quote.lead_id, v_org);
      IF v_director.first_name IS NOT NULL OR v_director.last_name IS NOT NULL THEN
        v_sa_first := v_director.first_name;
        v_sa_last  := v_director.last_name;
        v_sa_email := COALESCE(v_director.email, v_lead.email);
        v_sa_phone := COALESCE(v_director.phone, v_lead.phone);
      ELSE
        v_sa_blocked := true;
        INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
        VALUES (v_org, 'SA_DIRECTOR_DETAILS_REQUIRED', 'company', v_company_id,
                jsonb_build_object(
                  'quote_id', v_quote.id,
                  'lead_id', v_quote.lead_id,
                  'reason', 'no_director_on_file'
                ));
      END IF;
    ELSE
      v_sa_first := v_lead.first_name;
      v_sa_last  := v_lead.last_name;
      v_sa_email := v_lead.email;
      v_sa_phone := v_lead.phone;
    END IF;

    IF NOT v_sa_blocked THEN
      SELECT id INTO v_client_id FROM public.clients
        WHERE organization_id = v_org AND lower(email) = lower(v_sa_email)
          AND client_type IN ('sa_non_mtd','sa_mtd')
        LIMIT 1;
      IF v_client_id IS NULL THEN
        INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status, notes)
        VALUES (v_org, v_sa_first, v_sa_last, v_sa_email, v_sa_phone,
                CASE WHEN v_is_mtd THEN 'sa_mtd' ELSE 'sa_non_mtd' END,
                'pending', v_lead.notes)
        RETURNING id INTO v_client_id;

        INSERT INTO public.client_detail_sa (client_id, organization_id, is_mtd)
        VALUES (v_client_id, v_org, v_is_mtd)
        ON CONFLICT DO NOTHING;

        IF NOT v_canonical THEN
        INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
        VALUES (v_org, v_client_id, 'active', 'practice', now());
        END IF;
      END IF;

      IF v_has_cgt THEN
        INSERT INTO public.client_detail_cgt (client_id, organization_id)
        VALUES (v_client_id, v_org)
        ON CONFLICT DO NOTHING;
      END IF;
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
      IF NOT v_canonical THEN
      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (v_org, v_partnership_id, 'active', 'practice', now());
      END IF;

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

  IF NOT v_canonical THEN
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
  END IF;

  UPDATE public.quotes
     SET status = 'accepted',
         accepted_at = now(),
         sent_at = COALESCE(sent_at, now()),
         client_id = COALESCE(client_id, v_client_id),
         company_id = COALESCE(company_id, v_company_id),
         ported_to_client_id = COALESCE(ported_to_client_id, v_client_id),
         ported_to_company_id = COALESCE(ported_to_company_id, v_company_id),
         ported_at = COALESCE(ported_at, now())
   WHERE id = v_quote.id;

  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET pipeline_stage = 'won', won_at = now(), converted_at = now()
     WHERE id = v_quote.lead_id;
  END IF;

  UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE token = v_token_uuid;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'QUOTE_ACCEPTED', 'quote', v_quote.id,
          jsonb_build_object('client_id', v_client_id, 'company_id', v_company_id, 'source','public_token',
                             'sa_blocked', v_sa_blocked));

  IF v_client_id IS NOT NULL THEN
    INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
    VALUES (v_org, 'CLIENT_ONBOARDING_STARTED', 'client', v_client_id,
            jsonb_build_object('quote_id', v_quote.id));
  END IF;
  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
    VALUES (v_org, 'CLIENT_ONBOARDING_STARTED', 'company', v_company_id,
            jsonb_build_object('quote_id', v_quote.id));
  END IF;

  RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'company_id', v_company_id,
                            'sa_blocked', v_sa_blocked);
END;
$function$;