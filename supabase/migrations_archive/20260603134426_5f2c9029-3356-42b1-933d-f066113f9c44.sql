-- Self-heal: if accepted quote has no onboarding application, create one and return its id
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