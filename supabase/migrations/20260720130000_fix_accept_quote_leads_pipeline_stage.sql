-- ============================================================
-- Fix: quote acceptance failed with 'column "status" of relation "leads" does not exist'
-- ============================================================
-- public_accept_quote_by_token (latest def 20260629163528, line 226) updated the won lead with
--   UPDATE public.leads SET status = 'won' ...
-- but public.leads has no `status` column -- the pipeline column is `pipeline_stage` (values are
-- lowercase, incl. 'won'; confirmed live 2026-07-16, and the earlier correct def 20260602205415
-- used `pipeline_stage='won'`). This regressed on 2026-06-29 and made EVERY quote acceptance throw,
-- blocking client onboarding.
--
-- This migration reproduces public_accept_quote_by_token BYTE-FOR-BYTE from 20260629163528 with the
-- SINGLE change `SET status = 'won'` -> `SET pipeline_stage = 'won'` (asserted by the build: the two
-- bodies differ only by that swap). No GRANT is re-issued -- CREATE OR REPLACE preserves the
-- existing anon grant.
--
-- DIVERGENCE NOTE for Lovable: this replaces the live function with git's latest def + the one-line
-- fix. The live error matches this exact def's bug, so live == this version. If Lovable has made
-- OTHER out-of-git edits to this function, diff before applying so they are not lost.
-- ============================================================

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
  v_company_name text;
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
  ELSE
    SELECT NULL::uuid AS id,
           NULL::int  AS year_end_month,
           NULL::int  AS year_end_day
    INTO v_company;
  END IF;

  IF EXTRACT(MONTH FROM v_today) > 4
     OR (EXTRACT(MONTH FROM v_today) = 4 AND EXTRACT(DAY FROM v_today) >= 6) THEN
    v_tax_year_start := make_date(EXTRACT(YEAR FROM v_today)::int, 4, 6);
  ELSE
    v_tax_year_start := make_date(EXTRACT(YEAR FROM v_today)::int - 1, 4, 6);
  END IF;
  v_tax_year_end := v_tax_year_start + INTERVAL '1 year' - INTERVAL '1 day';

  IF NOT v_canonical THEN
    PERFORM public.lifecycle_materialize_jobs(
      v_org, v_client_id, v_company_id, v_partnership_id, v_quote.id,
      'quote_acceptance:' || v_quote.id::text);
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
    UPDATE public.leads SET pipeline_stage = 'won', updated_at = now() WHERE id = v_quote.lead_id;
  END IF;

  UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE token = v_token_uuid;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'QUOTE_ACCEPTED', 'quote', v_quote.id,
          jsonb_build_object('client_id', v_client_id, 'company_id', v_company_id, 'partnership_id', v_partnership_id));

  RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'company_id', v_company_id, 'partnership_id', v_partnership_id);
END;
$function$;
