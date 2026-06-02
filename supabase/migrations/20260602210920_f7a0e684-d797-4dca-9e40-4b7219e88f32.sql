
-- 1. Service entity scope
ALTER TABLE public.services_catalog
  ADD COLUMN IF NOT EXISTS entity_scope text NOT NULL DEFAULT 'either';

ALTER TABLE public.services_catalog
  DROP CONSTRAINT IF EXISTS services_catalog_entity_scope_check;
ALTER TABLE public.services_catalog
  ADD CONSTRAINT services_catalog_entity_scope_check
  CHECK (entity_scope IN ('individual','company','partnership','either'));

UPDATE public.services_catalog SET entity_scope = 'individual'
  WHERE code IN ('sa_non_mtd','sa_mtd','cgt_60_day');
UPDATE public.services_catalog SET entity_scope = 'company'
  WHERE code IN ('company_accounts','corporation_tax','confirmation_statement','registered_office');
UPDATE public.services_catalog SET entity_scope = 'either'
  WHERE code IN ('vat_return','payroll','cis','p11d','pensions','mtd_quarterly','advisory');

-- 2. Quotes columns + status
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS ported_to_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supersedes_quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_check
  CHECK (status = ANY (ARRAY['draft','sent','accepted','rejected','expired','superseded']));

-- 3. Accept-by-token rewrite
CREATE OR REPLACE FUNCTION public.public_accept_quote_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tok record;
  v_quote record;
  v_lead record;
  v_org uuid;
  v_client_id uuid;
  v_company_id uuid;
  v_has_individual boolean := false;
  v_has_company boolean := false;
  v_has_partnership boolean := false;
  v_is_mtd boolean := false;
  v_line record;
  v_target_client uuid;
  v_target_company uuid;
  v_frequency text;
  v_company_name text;
BEGIN
  SELECT * INTO v_tok FROM public.quote_acceptance_tokens WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('error','used'); END IF;
  IF v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now() THEN
    RETURN jsonb_build_object('error','expired');
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = v_tok.quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;

  -- Idempotent replay
  IF v_quote.status = 'accepted' THEN
    UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE id = v_tok.id AND used_at IS NULL;
    RETURN jsonb_build_object('success', true, 'client_id', v_quote.ported_to_client_id, 'company_id', v_quote.ported_to_company_id);
  END IF;

  IF v_quote.status NOT IN ('draft','sent') THEN
    RETURN jsonb_build_object('error','not_open');
  END IF;

  v_org := v_quote.organization_id;

  -- Classify lines
  SELECT
    bool_or(sc.entity_scope = 'individual') OR bool_or(sc.entity_scope = 'either' AND ql_inner.code IN ('sa_mtd','sa_non_mtd','cgt_60_day')),
    bool_or(sc.entity_scope = 'company'),
    bool_or(sc.entity_scope = 'partnership'),
    bool_or(sc.code = 'sa_mtd')
  INTO v_has_individual, v_has_company, v_has_partnership, v_is_mtd
  FROM public.quote_lines ql
  JOIN public.services_catalog sc ON sc.id = ql.service_id
  LEFT JOIN public.services_catalog ql_inner ON ql_inner.id = ql.service_id
  WHERE ql.quote_id = v_quote.id;

  v_has_individual := COALESCE(v_has_individual, false);
  v_has_company := COALESCE(v_has_company, false);
  v_has_partnership := COALESCE(v_has_partnership, false);

  -- Pull lead if present
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = v_quote.lead_id;
  END IF;

  -- Existing direct client/company on quote take priority
  v_client_id := v_quote.client_id;
  v_company_id := v_quote.company_id;

  -- Create / reuse individual client
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
      VALUES (v_client_id, v_org, v_is_mtd)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (v_org, v_client_id, 'active', 'practice', now());
    END IF;
  END IF;

  -- Create / reuse company
  IF v_has_company AND v_company_id IS NULL AND v_lead.id IS NOT NULL THEN
    v_company_name := COALESCE(
      NULLIF(v_lead.ch_company_profile->>'company_name',''),
      NULLIF(v_lead.ch_company_profile->>'title',''),
      trim(v_lead.first_name || ' ' || v_lead.last_name)
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

  -- Create / reuse partnership client (stored in clients with type='partnership')
  IF v_has_partnership AND v_lead.id IS NOT NULL THEN
    DECLARE v_partnership_id uuid;
    BEGIN
      SELECT id INTO v_partnership_id FROM public.clients
        WHERE organization_id = v_org AND lower(email) = lower(v_lead.email)
          AND client_type = 'partnership'
        LIMIT 1;
      IF v_partnership_id IS NULL THEN
        INSERT INTO public.clients (organization_id, first_name, last_name, email, phone, client_type, status, notes)
        VALUES (v_org, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone,
                'partnership', 'pending', v_lead.notes)
        RETURNING id INTO v_partnership_id;
        INSERT INTO public.client_detail_partnership (client_id, organization_id)
        VALUES (v_partnership_id, v_org) ON CONFLICT DO NOTHING;
        INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
        VALUES (v_org, v_partnership_id, 'active', 'practice', now());
      END IF;
      -- Use partnership as the client_id slot if no individual client created
      IF v_client_id IS NULL THEN v_client_id := v_partnership_id; END IF;
    END;
  END IF;

  -- Create engagements per line
  FOR v_line IN
    SELECT ql.*, sc.entity_scope, sc.code
    FROM public.quote_lines ql
    JOIN public.services_catalog sc ON sc.id = ql.service_id
    WHERE ql.quote_id = v_quote.id
  LOOP
    v_frequency := CASE WHEN v_line.billing_frequency = 'monthly' THEN 'monthly' ELSE 'one_off' END;

    IF v_line.entity_scope = 'company' OR (v_line.entity_scope = 'either' AND v_company_id IS NOT NULL) THEN
      v_target_company := v_company_id; v_target_client := NULL;
    ELSIF v_line.entity_scope = 'partnership' THEN
      v_target_client := v_client_id; v_target_company := NULL;
    ELSE
      v_target_client := v_client_id; v_target_company := NULL;
    END IF;

    IF v_target_client IS NULL AND v_target_company IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.engagements
      (organization_id, client_id, company_id, service_id, quote_id, frequency, start_date, status, activated_at)
    VALUES
      (v_org, v_target_client, v_target_company, v_line.service_id, v_quote.id,
       v_frequency, current_date, 'active', now());
  END LOOP;

  -- Mark quote accepted
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

  -- Mark lead won
  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET pipeline_stage = 'won', won_at = now(), converted_at = now()
     WHERE id = v_quote.lead_id;
  END IF;

  UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE id = v_tok.id;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'QUOTE_ACCEPTED', 'quote', v_quote.id,
          jsonb_build_object('client_id', v_client_id, 'company_id', v_company_id, 'source','public_token'));

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

  RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'company_id', v_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_accept_quote_by_token(text) TO anon, authenticated;

-- 4. Reject-by-token rewrite (captures reason; marks lead lost without org-access check)
CREATE OR REPLACE FUNCTION public.public_reject_quote_by_token(p_token text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tok record;
  v_quote record;
  v_org uuid;
BEGIN
  SELECT * INTO v_tok FROM public.quote_acceptance_tokens WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('error','used'); END IF;
  IF v_tok.expires_at IS NOT NULL AND v_tok.expires_at < now() THEN
    RETURN jsonb_build_object('error','expired');
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = v_tok.quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid'); END IF;
  IF v_quote.status NOT IN ('draft','sent') THEN RETURN jsonb_build_object('error','not_open'); END IF;

  v_org := v_quote.organization_id;

  UPDATE public.quotes
     SET status = 'rejected',
         rejected_at = now(),
         rejection_reason = COALESCE(NULLIF(p_reason,''), 'Declined by client')
   WHERE id = v_quote.id;

  UPDATE public.quote_acceptance_tokens SET used_at = now() WHERE id = v_tok.id;

  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET pipeline_stage = 'lost',
           lost_at = now(),
           lost_reason = COALESCE(NULLIF(p_reason,''), 'Quote declined')
     WHERE id = v_quote.lead_id
       AND pipeline_stage <> 'won';
  END IF;

  INSERT INTO public.automation_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (v_org, 'QUOTE_REJECTED', 'quote', v_quote.id,
          jsonb_build_object('reason', p_reason, 'source','public_token'));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_reject_quote_by_token(text, text) TO anon, authenticated;

-- 5. Re-issue quote
CREATE OR REPLACE FUNCTION public.reissue_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src record;
  v_new_id uuid;
  v_new_number text;
BEGIN
  SELECT * INTO v_src FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF NOT user_has_organization_access(v_src.organization_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF v_src.status = 'accepted' THEN RAISE EXCEPTION 'Accepted quotes cannot be re-issued'; END IF;

  v_new_number := public.generate_quote_number(v_src.organization_id);

  INSERT INTO public.quotes
    (organization_id, quote_number, lead_id, client_id, company_id, status,
     total_amount, currency, valid_until, notes, supersedes_quote_id)
  VALUES
    (v_src.organization_id, v_new_number, v_src.lead_id, v_src.client_id, v_src.company_id, 'draft',
     v_src.total_amount, v_src.currency, v_src.valid_until, v_src.notes, v_src.id)
  RETURNING id INTO v_new_id;

  INSERT INTO public.quote_lines
    (organization_id, quote_id, service_id, description_override, quantity, unit_price, subtotal, line_order, billing_frequency)
  SELECT organization_id, v_new_id, service_id, description_override, quantity, unit_price, subtotal, line_order, billing_frequency
    FROM public.quote_lines WHERE quote_id = v_src.id;

  -- Supersede original if still open
  IF v_src.status IN ('draft','sent') THEN
    UPDATE public.quotes SET status = 'superseded' WHERE id = v_src.id;
  END IF;

  -- Invalidate any open acceptance tokens for the original
  UPDATE public.quote_acceptance_tokens
     SET used_at = now()
   WHERE quote_id = v_src.id AND used_at IS NULL;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reissue_quote(uuid) TO authenticated;
