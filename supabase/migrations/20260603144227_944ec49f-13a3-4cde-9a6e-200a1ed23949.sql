CREATE OR REPLACE FUNCTION public.public_get_onboarding(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
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

  SELECT id, signed_at, sent_at INTO v_engagement
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
$$;