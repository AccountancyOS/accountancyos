-- ============================================================
-- Sprint 1 -- Increment 3b
-- Enforce the onboarding access token when the org flag is ON
-- ============================================================
-- Adds lifecycle_require_onboarding_token(): when the application's org has
-- canonical_lifecycle_enabled = true, a valid token is REQUIRED (NULL or
-- invalid rejected); when the flag is OFF (default for every org), it keeps
-- today's validate-if-present behaviour. Each onboarding RPC's inline
-- validate block is swapped for a PERFORM of this guard. Bodies are
-- reproduced byte-for-byte from 20260621181149 / 20260623215252 with ONLY
-- that one block replaced (CREATE OR REPLACE; same signatures). Dormant
-- until a flag is enabled.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lifecycle_require_onboarding_token(
  p_application_id uuid,
  p_access_token text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.onboarding_applications WHERE id = p_application_id;
  IF public.is_canonical_lifecycle_enabled(v_org) THEN
    -- Enforced: a valid, unexpired token is required.
    IF p_access_token IS NULL
       OR NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
      RAISE EXCEPTION 'Onboarding access token required or invalid' USING ERRCODE='42501';
    END IF;
  ELSE
    -- Legacy (flag off): validate only if a token was supplied.
    IF p_access_token IS NOT NULL
       AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
      RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_require_onboarding_token(uuid, text) TO anon, authenticated, service_role;

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
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);

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
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
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

CREATE OR REPLACE FUNCTION public.public_record_aml_upload(
  p_application_id uuid,
  p_document_type text,
  p_file_name text,
  p_file_path text,
  p_file_size integer,
  p_mime_type text,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_has_id boolean;
  v_has_poa boolean;
  v_next_status text;
BEGIN
  IF p_document_type NOT IN ('id','proof_of_address','incorporation_cert','other') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;

  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  INSERT INTO public.onboarding_documents (
    organization_id, application_id, document_type, file_name, file_path, file_size, mime_type
  ) VALUES (
    v_app.organization_id, p_application_id, p_document_type, p_file_name, p_file_path, p_file_size, p_mime_type
  );

  v_has_id := v_app.id_document_uploaded OR p_document_type = 'id';
  v_has_poa := v_app.proof_of_address_uploaded OR p_document_type = 'proof_of_address';

  v_next_status := v_app.status;
  IF v_has_id AND v_has_poa AND v_app.status IN ('engagement_pending','aml_pending') THEN
    v_next_status := 'billing_pending';
  END IF;

  UPDATE public.onboarding_applications
     SET id_document_uploaded = v_has_id,
         proof_of_address_uploaded = v_has_poa,
         additional_documents_uploaded = CASE WHEN p_document_type IN ('incorporation_cert','other')
                                              THEN true ELSE additional_documents_uploaded END,
         aml_submitted_at = COALESCE(aml_submitted_at,
                                     CASE WHEN v_has_id AND v_has_poa THEN now() ELSE NULL END),
         status = v_next_status,
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('status', v_next_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_record_aml_upload(uuid, text, text, text, integer, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_skip_billing(p_application_id uuid, p_access_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  UPDATE public.onboarding_applications
     SET billing_status = 'skipped',
         status = CASE WHEN status IN ('billing_pending','aml_pending','engagement_pending')
                       THEN 'portal_pending' ELSE status END,
         updated_at = now()
   WHERE id = p_application_id
     AND status NOT IN ('approved','rejected','cancelled');
  RETURN jsonb_build_object('status','portal_pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_skip_billing(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_complete_billing(
  p_application_id uuid,
  p_stripe_session_id text,
  p_amount numeric,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);

  UPDATE public.onboarding_applications
     SET billing_status = 'completed',
         billing_amount = COALESCE(p_amount, billing_amount),
         stripe_checkout_session_id = COALESCE(p_stripe_session_id, stripe_checkout_session_id),
         billing_completed_at = now(),
         status = CASE WHEN status IN ('billing_pending','aml_pending','engagement_pending')
                       THEN 'portal_pending' ELSE status END,
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('status','portal_pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_complete_billing(uuid, text, numeric, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_submit_onboarding_for_review(
  p_application_id uuid,
  p_portal_email text,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_org_name text;
  v_member record;
  v_client_name text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  IF v_app.status = 'for_review' THEN
    RETURN jsonb_build_object('status','for_review','already', true);
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'for_review',
         portal_email = COALESCE(p_portal_email, portal_email),
         submitted_for_review_at = now(),
         updated_at = now()
   WHERE id = p_application_id;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_app.organization_id;
  v_client_name := COALESCE(v_app.company_name,
    NULLIF(trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')), ''),
    v_app.email, 'New onboarding');

  -- Notify all org members (owner + staff)
  FOR v_member IN
    SELECT user_id FROM public.organization_users WHERE organization_id = v_app.organization_id
  LOOP
    INSERT INTO public.notifications (
      organization_id, user_id, type, title, message, entity_type, entity_id
    ) VALUES (
      v_app.organization_id, v_member.user_id, 'onboarding_for_review',
      'New onboarding ready for review',
      v_client_name || ' has completed onboarding and is ready for review.',
      'onboarding_application', p_application_id
    );
  END LOOP;

  -- Internal email summary to owners
  INSERT INTO public.email_queue (
    organization_id, to_email, to_name, subject, body_html, status, context, entity_type, entity_id
  )
  SELECT v_app.organization_id,
         u.email,
         COALESCE(u.raw_user_meta_data->>'full_name', u.email),
         'Onboarding ready for review: ' || v_client_name,
         '<p>' || v_client_name || ' has completed the onboarding wizard.</p>' ||
         '<p>Please review in AccountancyOS.</p>',
         'pending', 'onboarding', 'onboarding_application', p_application_id
    FROM public.organization_users om
    JOIN auth.users u ON u.id = om.user_id
   WHERE om.organization_id = v_app.organization_id
     AND om.role = 'owner'
     AND u.email IS NOT NULL;

  RETURN jsonb_build_object('status','for_review','already', false);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.public_submit_onboarding_for_review(uuid, text, text) TO anon, authenticated;
