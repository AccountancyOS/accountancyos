-- =====================================================================================
-- The engagement letter states the fees exactly as the proposal quoted them.
-- =====================================================================================
-- APPLY AFTER 20260727170000_billing_frequency_annual.sql, which introduced the annual
-- billing period and the accepted_snapshot.total_annual bucket this reads.
--
-- The problem. The letter is the contract, and it did not say what the accountant
-- quoted:
--   * Each service line ended with a raw vocabulary token — "(monthly)", "(now)" — which
--     is internal wording, not something a client should be asked to sign.
--   * The fee paragraph knew only two buckets: "One-off fees due now total X. Ongoing
--     monthly fees total Y per month." Since 20260727170000, total_now means one-off
--     ONLY, so an annual fee now appears in NEITHER sentence — a fee the client agreed
--     to would be silently absent from the contract. That is worse than mislabelled.
--
-- What this changes, in public_preview_engagement_letter and
-- public_sign_engagement_letter (the two functions that compose letter wording):
--   (1) Each line reads "£960.00 per year" / "per month" / "one-off" instead of a token.
--   (2) The fee section lists every non-zero period, and says so explicitly when there
--       are no fees rather than printing a blank.
--   (3) Variant templates can use a {{total_annual}} merge field.
--
-- On (3): render_engagement_letter_body is a pure IMMUTABLE merge-field replacer whose
-- signature carries only one-off and monthly totals. Rather than re-issue it — adding an
-- argument means either a signature change or an overload, and this codebase has already
-- been bitten by two divergent overloads of one RPC — the callers substitute
-- {{total_annual}} on the rendered output. The helper is untouched.
--
-- Basis: the LIVE bodies fetched via MCP catalog_functions(include_source: true) on
-- 2026-07-27 — public_preview_engagement_letter 62319ab49fe6829a50964735e47b548d and
-- public_sign_engagement_letter 6c803c5dc60f01747d75d9a34ca8c8f1 — reproduced verbatim
-- except the wording changes above. No table, policy or trigger is touched.
-- =====================================================================================

-- (1) Preview -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_preview_engagement_letter(p_application_id uuid, p_access_token text DEFAULT NULL::text)
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
  v_total_annual numeric;
  v_fees text := '';
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
  -- Absent on snapshots taken before 20260727170000 — those proposals had no annual line.
  v_total_annual := COALESCE((v_quote.accepted_snapshot->>'total_annual')::numeric, 0);

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      -- CHANGED: the client reads a fee and a period, not an internal token.
      v_lines := v_lines || '<li>' || (v_line->>'service_name') ||
        ' — ' || v_currency || ' ' ||
        trim(to_char(COALESCE((v_line->>'subtotal')::numeric, 0), 'FM999999990.00')) || ' ' ||
        CASE COALESCE(v_line->>'billing_frequency', 'now')
          WHEN 'monthly' THEN 'per month'
          WHEN 'annual'  THEN 'per year'
          ELSE 'one-off'
        END || '</li>';
    END LOOP;
  END IF;

  -- CHANGED: every period the client is agreeing to, and never a silent blank.
  IF v_total_now > 0 THEN
    v_fees := v_fees || '<li>One-off fees due on acceptance: ' || v_currency || ' ' ||
              trim(to_char(v_total_now, 'FM999999990.00')) || '</li>';
  END IF;
  IF v_total_monthly > 0 THEN
    v_fees := v_fees || '<li>Ongoing fees: ' || v_currency || ' ' ||
              trim(to_char(v_total_monthly, 'FM999999990.00')) || ' per month</li>';
  END IF;
  IF v_total_annual > 0 THEN
    v_fees := v_fees || '<li>Ongoing fees: ' || v_currency || ' ' ||
              trim(to_char(v_total_annual, 'FM999999990.00')) || ' per year</li>';
  END IF;
  IF v_fees = '' THEN
    v_fees := '<li>No fees are payable under this engagement.</li>';
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
    -- CHANGED: the renderer's signature has no annual total, so the merge field is
    -- substituted here rather than re-issuing that IMMUTABLE helper.
    IF v_rendered IS NOT NULL THEN
      v_rendered := replace(v_rendered, '{{total_annual}}',
                            trim(to_char(v_total_annual, 'FM999999990.00')));
      RETURN v_rendered;
    END IF;
  END IF;

  RETURN '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || v_org_name || '</strong> ("the Firm") and <strong>' ||
    v_client_name || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2><ul>' || v_fees || '</ul>' ||
    '<h2>Confidentiality</h2>' ||
    '<p>The Firm will treat all information received in the course of this engagement as confidential, except where disclosure is required by law or regulatory authority.</p>' ||
    '<h2>Acceptance</h2>' ||
    '<p>By signing below the Client confirms acceptance of the terms above, in respect of the proposal accepted on ' ||
    to_char(v_accepted_at, 'DD Mon YYYY') || '.</p>';
END;
$function$;

-- (2) Signing -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter(p_application_id uuid, p_signature_data jsonb, p_access_token text DEFAULT NULL::text)
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
  v_total_annual numeric;
  v_fees text := '';
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
  v_total_annual := COALESCE((v_quote.accepted_snapshot->>'total_annual')::numeric, 0);

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      v_lines := v_lines || '<li>' || (v_line->>'service_name') ||
        ' — ' || v_currency || ' ' ||
        trim(to_char(COALESCE((v_line->>'subtotal')::numeric, 0), 'FM999999990.00')) || ' ' ||
        CASE COALESCE(v_line->>'billing_frequency', 'now')
          WHEN 'monthly' THEN 'per month'
          WHEN 'annual'  THEN 'per year'
          ELSE 'one-off'
        END || '</li>';
    END LOOP;
  END IF;

  IF v_total_now > 0 THEN
    v_fees := v_fees || '<li>One-off fees due on acceptance: ' || v_currency || ' ' ||
              trim(to_char(v_total_now, 'FM999999990.00')) || '</li>';
  END IF;
  IF v_total_monthly > 0 THEN
    v_fees := v_fees || '<li>Ongoing fees: ' || v_currency || ' ' ||
              trim(to_char(v_total_monthly, 'FM999999990.00')) || ' per month</li>';
  END IF;
  IF v_total_annual > 0 THEN
    v_fees := v_fees || '<li>Ongoing fees: ' || v_currency || ' ' ||
              trim(to_char(v_total_annual, 'FM999999990.00')) || ' per year</li>';
  END IF;
  IF v_fees = '' THEN
    v_fees := '<li>No fees are payable under this engagement.</li>';
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
    IF v_rendered IS NOT NULL THEN
      v_rendered := replace(v_rendered, '{{total_annual}}',
                            trim(to_char(v_total_annual, 'FM999999990.00')));
    END IF;
  END IF;

  v_content := COALESCE(
    v_rendered,
    '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || v_org_name || '</strong> ("the Firm") and <strong>' ||
    v_client_name || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2><ul>' || v_fees || '</ul>' ||
    '<p>Commercial terms as per the proposal accepted on ' ||
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
