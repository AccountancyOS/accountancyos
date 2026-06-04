
-- 1. Self-heal accepted_snapshot in public_get_quote_by_token, and return it via onboarding bundle.
CREATE OR REPLACE FUNCTION public.public_get_quote_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tok record; v_quote record; v_practice_name text; v_recipient_name text; v_lines jsonb;
  v_onboarding_id uuid;
  v_lead record;
  v_app_type text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_company_name text;
  v_company_number text;
  v_has_company boolean;
  v_snapshot jsonb;
  v_total_now numeric;
  v_total_monthly numeric;
BEGIN
  SELECT * INTO v_tok FROM quote_acceptance_tokens WHERE token = p_token;
  IF v_tok.token IS NULL THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  IF v_tok.expires_at <= now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_tok.quote_id;

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_practice_name
  FROM organizations o LEFT JOIN organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_quote.organization_id;

  IF v_quote.lead_id IS NOT NULL THEN
    SELECT first_name || ' ' || last_name INTO v_recipient_name FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT first_name || ' ' || last_name INTO v_recipient_name FROM clients WHERE id = v_quote.client_id;
  ELSIF v_quote.company_id IS NOT NULL THEN
    SELECT company_name INTO v_recipient_name FROM companies WHERE id = v_quote.company_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'service_id', ql.service_id,
    'service_code', sc.code,
    'service_name', COALESCE(NULLIF(ql.description_override, ''), sc.name),
    'quantity', ql.quantity, 'unit_price', ql.unit_price,
    'subtotal', ql.subtotal, 'billing_frequency', ql.billing_frequency
  ) ORDER BY ql.line_order, ql.created_at), '[]'::jsonb)
    INTO v_lines
  FROM quote_lines ql JOIN services_catalog sc ON sc.id = ql.service_id
  WHERE ql.quote_id = v_quote.id;

  SELECT id INTO v_onboarding_id
  FROM onboarding_applications
  WHERE quote_id = v_quote.id
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Self-heal: accepted quote without onboarding application
  IF v_onboarding_id IS NULL AND v_quote.status = 'accepted' THEN
    IF v_quote.lead_id IS NOT NULL THEN
      SELECT * INTO v_lead FROM leads WHERE id = v_quote.lead_id;
      v_first_name := v_lead.first_name;
      v_last_name := v_lead.last_name;
      v_email := v_lead.email;
      v_phone := v_lead.phone;
    ELSIF v_quote.client_id IS NOT NULL THEN
      SELECT first_name, last_name, email, phone
        INTO v_first_name, v_last_name, v_email, v_phone
        FROM clients WHERE id = v_quote.client_id;
    END IF;

    v_has_company := v_quote.company_id IS NOT NULL;
    IF v_has_company THEN
      SELECT company_name, company_number INTO v_company_name, v_company_number
        FROM companies WHERE id = v_quote.company_id;
    END IF;

    v_app_type := CASE WHEN v_has_company THEN 'company' ELSE 'individual' END;

    INSERT INTO onboarding_applications (
      organization_id, lead_id, quote_id, application_type, status,
      first_name, last_name, email, phone,
      company_name, company_number, client_id, company_id
    ) VALUES (
      v_quote.organization_id, v_quote.lead_id, v_quote.id, v_app_type, 'in_progress',
      v_first_name, v_last_name, v_email, v_phone,
      v_company_name, v_company_number, v_quote.client_id, v_quote.company_id
    )
    RETURNING id INTO v_onboarding_id;
  END IF;

  -- Self-heal: accepted quote without accepted_snapshot
  IF v_quote.status = 'accepted' AND (v_quote.accepted_snapshot IS NULL OR v_quote.accepted_snapshot = 'null'::jsonb) THEN
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') <> 'monthly' THEN COALESCE(subtotal,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') = 'monthly' THEN COALESCE(subtotal,0) ELSE 0 END), 0)
      INTO v_total_now, v_total_monthly
    FROM jsonb_to_recordset(v_lines)
      AS x(subtotal numeric, billing_frequency text);

    v_snapshot := jsonb_build_object(
      'lines', v_lines,
      'currency', COALESCE(v_quote.currency, 'GBP'),
      'quote_number', v_quote.quote_number,
      'accepted_at', COALESCE(v_quote.accepted_at, now()),
      'valid_until', v_quote.valid_until,
      'total_now', v_total_now,
      'total_monthly', v_total_monthly,
      'total_amount', COALESCE(v_quote.total_amount, v_total_now + v_total_monthly)
    );

    UPDATE quotes SET accepted_snapshot = v_snapshot WHERE id = v_quote.id;
    v_quote.accepted_snapshot := v_snapshot;
  END IF;

  RETURN jsonb_build_object(
    'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'status', v_quote.status,
    'currency', v_quote.currency, 'total_amount', v_quote.total_amount,
    'valid_until', v_quote.valid_until, 'sent_at', v_quote.sent_at,
    'accepted_at', v_quote.accepted_at, 'rejected_at', v_quote.rejected_at,
    'notes', v_quote.notes, 'practice_name', v_practice_name,
    'recipient_name', v_recipient_name, 'lines', v_lines,
    'used', v_tok.used_at IS NOT NULL,
    'onboarding_application_id', v_onboarding_id
  );
END;
$function$;

-- 2. Engagement letter preview RPC (builds HTML without writing).
CREATE OR REPLACE FUNCTION public.public_preview_engagement_letter(p_application_id uuid)
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
  v_currency text;
  v_accepted_at timestamptz;
  v_total_now numeric;
  v_total_monthly numeric;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_org_name
  FROM public.organizations o
  LEFT JOIN public.organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_app.organization_id;

  SELECT accepted_snapshot, currency, accepted_at
    INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  v_client_name := COALESCE(v_app.company_name,
    trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')));
  v_currency := COALESCE(v_quote.currency, 'GBP');
  v_accepted_at := COALESCE((v_quote.accepted_snapshot->>'accepted_at')::timestamptz, v_quote.accepted_at, now());
  v_total_now := COALESCE((v_quote.accepted_snapshot->>'total_now')::numeric, 0);
  v_total_monthly := COALESCE((v_quote.accepted_snapshot->>'total_monthly')::numeric, 0);

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      v_lines := v_lines || '<li>' || COALESCE(v_line->>'service_name','Service') ||
        ' — ' || v_currency || ' ' || COALESCE(v_line->>'subtotal','0') ||
        ' (' || COALESCE(v_line->>'billing_frequency','annual') || ')</li>';
    END LOOP;
  END IF;

  RETURN
    '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || COALESCE(v_org_name,'The Firm') || '</strong> ("the Firm") and <strong>' ||
    COALESCE(v_client_name,'the Client') || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2>' ||
    '<p>Payable now: <strong>' || v_currency || ' ' || to_char(v_total_now,'FM999G999G990D00') || '</strong></p>' ||
    '<p>Payable monthly: <strong>' || v_currency || ' ' || to_char(v_total_monthly,'FM999G999G990D00') || '</strong></p>' ||
    '<h2>Term</h2>' ||
    '<p>This engagement commences on the date of signature and continues until terminated by either party in writing.</p>' ||
    '<h2>Responsibilities</h2>' ||
    '<p>The Firm will perform the services listed above with reasonable skill and care, in accordance with applicable professional standards. ' ||
    'The Client will provide accurate and complete information on a timely basis, and will be responsible for the accuracy of any data supplied.</p>' ||
    '<h2>Confidentiality</h2>' ||
    '<p>The Firm will treat all information received in the course of this engagement as confidential, except where disclosure is required by law or regulatory authority.</p>' ||
    '<h2>Acceptance</h2>' ||
    '<p>By signing below the Client confirms acceptance of the terms above, in respect of the proposal accepted on ' ||
    to_char(v_accepted_at, 'DD Mon YYYY') || '.</p>';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_preview_engagement_letter(uuid) TO anon, authenticated;

-- 3. Include engagement letter document_content in onboarding bundle.
CREATE OR REPLACE FUNCTION public.public_get_onboarding(p_application_id uuid)
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
    'application', to_jsonb(v_app),
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
