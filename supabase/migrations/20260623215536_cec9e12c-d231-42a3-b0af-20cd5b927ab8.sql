-- ============================================================
-- Sprint 1 — Increment 3a / Task 4
-- public_get_quote_by_token returns the onboarding access_token (trusted channel)
-- ============================================================
-- The quote-accept flow (gated by the secret quote token) is a trusted channel,
-- so it may hand the client the onboarding access_token. Adds the token of the
-- resolved onboarding application to the return JSON ('onboarding_access_token'),
-- letting PublicQuoteView build /onboard/:id?token=... (Task 5). NOT exposed via
-- public_get_onboarding (still stripped). CREATE OR REPLACE (same signature);
-- body verbatim from 20260604205211 + only the variable, the lookup, and the
-- return field (diff-verified).
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_get_quote_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tok record; v_quote record; v_practice_name text; v_recipient_name text; v_lines jsonb;
  v_onboarding_id uuid;
  v_onboarding_access_token text;
  v_lead record;
  v_app_type text;
  v_first_name text;
  v_last_name text;
  v_preferred text;
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

  -- Resolve recipient_name: preferred_name -> first+last -> company_name
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT NULLIF(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
      INTO v_recipient_name FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(preferred_name), ''),
                    NULLIF(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''))
      INTO v_recipient_name FROM clients WHERE id = v_quote.client_id;
  END IF;

  IF v_recipient_name IS NULL AND v_quote.company_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(c.preferred_name), ''),
                    NULLIF(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''))
      INTO v_recipient_name
    FROM clients c
    WHERE c.company_id = v_quote.company_id
    ORDER BY c.created_at ASC LIMIT 1;

    IF v_recipient_name IS NULL THEN
      SELECT company_name INTO v_recipient_name FROM companies WHERE id = v_quote.company_id;
    END IF;
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

  IF v_onboarding_id IS NOT NULL THEN
    SELECT access_token INTO v_onboarding_access_token
      FROM public.onboarding_applications WHERE id = v_onboarding_id;
  END IF;

  RETURN jsonb_build_object(
    'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'status', v_quote.status,
    'currency', v_quote.currency, 'total_amount', v_quote.total_amount,
    'valid_until', v_quote.valid_until, 'sent_at', v_quote.sent_at,
    'accepted_at', v_quote.accepted_at, 'rejected_at', v_quote.rejected_at,
    'notes', v_quote.notes, 'practice_name', v_practice_name,
    'recipient_name', v_recipient_name, 'lines', v_lines,
    'used', v_tok.used_at IS NOT NULL,
    'onboarding_application_id', v_onboarding_id,
    'onboarding_access_token', v_onboarding_access_token
  );
END;
$function$;
