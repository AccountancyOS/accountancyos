-- 1. Schema: add editable letter body to existing variants table.
ALTER TABLE public.engagement_letter_template_variants
  ADD COLUMN IF NOT EXISTS letter_body text;

-- 2. Shared helper: render a letter body template with merge fields, or NULL if empty.
CREATE OR REPLACE FUNCTION public.render_engagement_letter_body(
  p_template text,
  p_firm_name text,
  p_client_name text,
  p_services_list_html text,
  p_currency text,
  p_total_one_off numeric,
  p_total_monthly numeric,
  p_accepted_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF p_template IS NULL OR length(btrim(p_template)) = 0 THEN
    RETURN NULL;
  END IF;
  v := p_template;
  v := replace(v, '{{firm_name}}',     COALESCE(p_firm_name, ''));
  v := replace(v, '{{firm.name}}',     COALESCE(p_firm_name, ''));
  v := replace(v, '{{client_name}}',   COALESCE(p_client_name, ''));
  v := replace(v, '{{client.name}}',   COALESCE(p_client_name, ''));
  v := replace(v, '{{recipient_name}}',COALESCE(p_client_name, ''));
  v := replace(v, '{{services_list}}', COALESCE(p_services_list_html, ''));
  v := replace(v, '{{currency}}',      COALESCE(p_currency, ''));
  v := replace(v, '{{total_one_off}}', COALESCE(p_total_one_off::text, '0'));
  v := replace(v, '{{total_monthly}}', COALESCE(p_total_monthly::text, '0'));
  v := replace(v, '{{accepted_date}}', to_char(COALESCE(p_accepted_at, now()), 'DD Mon YYYY'));
  v := replace(v, '{{today}}',         to_char(now(), 'DD Mon YYYY'));
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.render_engagement_letter_body(text, text, text, text, text, numeric, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_engagement_letter_body(text, text, text, text, text, numeric, numeric, timestamptz) TO anon, authenticated, service_role;

-- 3. Preview function: use firm's custom letter wording if set, else built-in default.
CREATE OR REPLACE FUNCTION public.public_preview_engagement_letter(p_application_id uuid, p_access_token text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_quote record;
  v_org_name text;
  v_lines text := '';
  v_line jsonb;
  v_client_name text;
  v_preferred text;
  v_currency text;
  v_accepted_at timestamptz;
  v_total_now numeric;
  v_total_monthly numeric;
  v_client_type text;
  v_variant_id uuid;
  v_letter_body text;
  v_rendered text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN RETURN NULL; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_org_name
  FROM public.organizations o
  LEFT JOIN public.organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_app.organization_id;

  SELECT accepted_snapshot, currency, accepted_at
    INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  IF v_app.client_id IS NOT NULL THEN
    SELECT preferred_name INTO v_preferred FROM public.clients WHERE id = v_app.client_id;
  END IF;

  v_client_name := COALESCE(
    NULLIF(trim(v_preferred), ''),
    NULLIF(trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')), ''),
    v_app.company_name
  );
  v_currency := COALESCE(v_quote.currency, 'GBP');
  v_accepted_at := COALESCE((v_quote.accepted_snapshot->>'accepted_at')::timestamptz, v_quote.accepted_at, now());
  v_total_now := COALESCE((v_quote.accepted_snapshot->>'total_now')::numeric, 0);
  v_total_monthly := COALESCE((v_quote.accepted_snapshot->>'total_monthly')::numeric, 0);

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      v_lines := v_lines || '<li>' || (v_line->>'service_name') ||
        ' — ' || v_currency || ' ' || (v_line->>'subtotal') ||
        ' (' || COALESCE(v_line->>'billing_frequency','annual') || ')</li>';
    END LOOP;
  END IF;

  v_client_type := CASE WHEN v_app.application_type = 'individual' THEN 'individual' ELSE 'limited_company' END;
  v_variant_id := public.resolve_engagement_letter_variant(
    v_app.organization_id, v_client_type, NULL, NULL, 'recurring'
  );
  IF v_variant_id IS NOT NULL THEN
    SELECT letter_body INTO v_letter_body
      FROM public.engagement_letter_template_variants WHERE id = v_variant_id;
    v_rendered := public.render_engagement_letter_body(
      v_letter_body, v_org_name, v_client_name,
      '<ul>' || v_lines || '</ul>',
      v_currency, v_total_now, v_total_monthly, v_accepted_at
    );
    IF v_rendered IS NOT NULL THEN RETURN v_rendered; END IF;
  END IF;

  RETURN '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || v_org_name || '</strong> ("the Firm") and <strong>' ||
    v_client_name || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2>' ||
    '<p>One-off fees due now total ' || v_currency || ' ' || v_total_now::text || '. ' ||
    'Ongoing monthly fees total ' || v_currency || ' ' || v_total_monthly::text || ' per month.</p>' ||
    '<h2>Confidentiality</h2>' ||
    '<p>The Firm will treat all information received in the course of this engagement as confidential, except where disclosure is required by law or regulatory authority.</p>' ||
    '<h2>Acceptance</h2>' ||
    '<p>By signing below the Client confirms acceptance of the terms above, in respect of the proposal accepted on ' ||
    to_char(v_accepted_at, 'DD Mon YYYY') || '.</p>';
END;
$function$;
GRANT EXECUTE ON FUNCTION public.public_preview_engagement_letter(uuid, text) TO anon, authenticated;

-- 4. Sign function: same custom-wording-with-fallback for the snapshot stored on signing.
CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter(p_application_id uuid, p_signature_data jsonb, p_access_token text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_quote record;
  v_org_name text;
  v_content text;
  v_letter_id uuid;
  v_lines text := '';
  v_line jsonb;
  v_client_name text;
  v_preferred text;
  v_currency text;
  v_accepted_at timestamptz;
  v_total_now numeric;
  v_total_monthly numeric;
  v_client_type text;
  v_variant_id uuid;
  v_letter_body text;
  v_rendered text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_org_name
  FROM public.organizations o
  LEFT JOIN public.organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_app.organization_id;

  SELECT accepted_snapshot, currency, accepted_at
    INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  IF v_app.client_id IS NOT NULL THEN
    SELECT preferred_name INTO v_preferred FROM public.clients WHERE id = v_app.client_id;
  END IF;

  v_client_name := COALESCE(
    NULLIF(trim(v_preferred), ''),
    NULLIF(trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')), ''),
    v_app.company_name
  );
  v_currency := COALESCE(v_quote.currency, 'GBP');
  v_accepted_at := COALESCE((v_quote.accepted_snapshot->>'accepted_at')::timestamptz, v_quote.accepted_at, now());
  v_total_now := COALESCE((v_quote.accepted_snapshot->>'total_now')::numeric, 0);
  v_total_monthly := COALESCE((v_quote.accepted_snapshot->>'total_monthly')::numeric, 0);

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      v_lines := v_lines || '<li>' || (v_line->>'service_name') ||
        ' — ' || v_currency || ' ' || (v_line->>'subtotal') ||
        ' (' || COALESCE(v_line->>'billing_frequency','annual') || ')</li>';
    END LOOP;
  END IF;

  v_client_type := CASE WHEN v_app.application_type = 'individual' THEN 'individual' ELSE 'limited_company' END;
  v_variant_id := public.resolve_engagement_letter_variant(
    v_app.organization_id, v_client_type, NULL, NULL, 'recurring'
  );
  IF v_variant_id IS NOT NULL THEN
    SELECT letter_body INTO v_letter_body
      FROM public.engagement_letter_template_variants WHERE id = v_variant_id;
    v_rendered := public.render_engagement_letter_body(
      v_letter_body, v_org_name, v_client_name,
      '<ul>' || v_lines || '</ul>',
      v_currency, v_total_now, v_total_monthly, v_accepted_at
    );
  END IF;

  v_content := COALESCE(
    v_rendered,
    '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || v_org_name || '</strong> ("the Firm") and <strong>' ||
    v_client_name || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2><p>Total commercial terms as per accepted proposal dated ' ||
    to_char(v_accepted_at, 'DD Mon YYYY') || '.</p>' ||
    '<h2>Acceptance</h2><p>By signing below the Client confirms acceptance of the terms above.</p>'
  );

  SELECT id INTO v_letter_id FROM public.engagement_letters
   WHERE onboarding_application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  IF v_letter_id IS NULL THEN
    INSERT INTO public.engagement_letters (
      organization_id, onboarding_application_id, document_content,
      sent_at, signed_at, signature_ip, signature_user_agent
    ) VALUES (
      v_app.organization_id, p_application_id, v_content,
      now(), now(),
      p_signature_data->>'ip', p_signature_data->>'user_agent'
    ) RETURNING id INTO v_letter_id;
  ELSE
    UPDATE public.engagement_letters
       SET document_content = v_content,
           signed_at = now(),
           sent_at = COALESCE(sent_at, now()),
           signature_ip = COALESCE(signature_ip, p_signature_data->>'ip'),
           signature_user_agent = COALESCE(signature_user_agent, p_signature_data->>'user_agent'),
           updated_at = now()
     WHERE id = v_letter_id;
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'aml_pending',
         contracts_signed_at = now(),
         contracts_sent_at = COALESCE(contracts_sent_at, now()),
         signature_data = p_signature_data,
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('engagement_letter_id', v_letter_id, 'status','aml_pending');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.public_sign_engagement_letter(uuid, jsonb, text) TO anon, authenticated;