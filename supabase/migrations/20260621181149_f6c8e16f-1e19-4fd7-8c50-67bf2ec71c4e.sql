-- ============================================================
-- Sprint 1 — Increment 3a / Task 2
-- Read/EL onboarding RPCs gain OPTIONAL access token (validate-if-present)
-- ============================================================
-- public_get_onboarding / public_preview_engagement_letter /
-- public_sign_engagement_letter: trailing p_access_token text DEFAULT NULL.
-- Token supplied => must be valid (else reject); NULL => unchanged (legacy).
-- DROP+CREATE (signature change). Bodies verbatim from 20260617114623 /
-- 20260604205211 + the validation block only (verified by diff). Fresh GRANTs
-- for the new signatures. Backward-compatible: no caller sends a token until
-- the frontend (Task 5) does.
-- ============================================================

DROP FUNCTION IF EXISTS public.public_get_onboarding(uuid);
CREATE OR REPLACE FUNCTION public.public_get_onboarding(p_application_id uuid, p_access_token text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_org record;
  v_brand record;
  v_quote record;
  v_docs jsonb;
  v_engagement record;
  v_has_connect boolean;
  v_display_name text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Onboarding application not found' USING ERRCODE='P0002'; END IF;
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;

  SELECT id, name, logo_url, stripe_connect_account_id INTO v_org
    FROM public.organizations WHERE id = v_app.organization_id;
  v_has_connect := v_org.stripe_connect_account_id IS NOT NULL;

  SELECT trading_name, legal_name INTO v_brand
    FROM public.organization_branding WHERE organization_id = v_app.organization_id;

  v_display_name := COALESCE(NULLIF(v_brand.trading_name, ''), NULLIF(v_brand.legal_name, ''), v_org.name);

  SELECT id, quote_number, accepted_snapshot, currency
    INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'document_type', document_type, 'file_name', file_name,
    'file_path', file_path, 'created_at', created_at
  ) ORDER BY created_at), '[]'::jsonb) INTO v_docs
    FROM public.onboarding_documents WHERE application_id = p_application_id;

  SELECT id, signed_at, sent_at, document_content INTO v_engagement
    FROM public.engagement_letters
   WHERE onboarding_application_id = p_application_id
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'application', to_jsonb(v_app) - 'access_token' - 'access_token_expires_at',
    'organization', jsonb_build_object(
      'id', v_org.id,
      'name', v_display_name,
      'logo_url', v_org.logo_url,
      'has_stripe_connect', v_has_connect
    ),
    'quote', to_jsonb(v_quote),
    'documents', v_docs,
    'engagement_letter', to_jsonb(v_engagement)
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.public_get_onboarding(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.public_preview_engagement_letter(uuid);
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
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN RETURN NULL; END IF;
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
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

DROP FUNCTION IF EXISTS public.public_sign_engagement_letter(uuid, jsonb);
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
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_app.organization_id;
  SELECT accepted_snapshot, currency INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  IF v_app.client_id IS NOT NULL THEN
    SELECT preferred_name INTO v_preferred FROM public.clients WHERE id = v_app.client_id;
  END IF;

  v_client_name := COALESCE(
    NULLIF(trim(v_preferred), ''),
    NULLIF(trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')), ''),
    v_app.company_name
  );

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      v_lines := v_lines || '<li>' || (v_line->>'service_name') ||
        ' — ' || COALESCE(v_quote.currency,'GBP') || ' ' || (v_line->>'subtotal') ||
        ' (' || COALESCE(v_line->>'billing_frequency','annual') || ')</li>';
    END LOOP;
  END IF;

  v_content := '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || v_org_name || '</strong> ("the Firm") and <strong>' ||
    v_client_name || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2><p>Total commercial terms as per accepted proposal dated ' ||
    to_char((v_quote.accepted_snapshot->>'accepted_at')::timestamptz, 'DD Mon YYYY') || '.</p>' ||
    '<h2>Acceptance</h2><p>By signing below the Client confirms acceptance of the terms above.</p>';

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
