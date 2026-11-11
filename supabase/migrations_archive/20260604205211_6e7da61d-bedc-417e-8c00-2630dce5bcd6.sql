
-- 1. lifecycle_send_quote: prefer personal name over company name
CREATE OR REPLACE FUNCTION public.lifecycle_send_quote(p_quote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote               record;
  v_line_count          integer;
  v_recipient_email     text;
  v_recipient_name      text;
  v_recipient_first     text;
  v_preferred           text;
  v_first               text;
  v_last                text;
  v_old_status          text;
  v_email_queued        boolean := false;
  v_practice_name       text;
  v_template_id         uuid;
  v_template_content    jsonb;
  v_token               uuid;
  v_valid_until         date;
  v_lines_html          text := '';
  v_line                record;
  v_freq_label          text;
  v_unit_display        numeric;
  v_subtotal_display    numeric;
  v_unit_suffix         text;
  v_subtotal_suffix     text;
  v_total_now           numeric := 0;
  v_total_monthly       numeric := 0;
  v_base_url            text := 'https://app.accountancyos.com';
  v_subject             text;
  v_body_html           text;
  v_merge               jsonb;
  v_key                 text;
  v_val                 text;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found: %', p_quote_id; END IF;
  IF NOT user_has_organization_access(v_quote.organization_id) THEN RAISE EXCEPTION 'Access denied to organization'; END IF;
  IF v_quote.status != 'draft' THEN RAISE EXCEPTION 'Quote cannot be sent. Current status: %. Only draft quotes can be sent.', v_quote.status; END IF;

  SELECT COUNT(*) INTO v_line_count FROM quote_lines WHERE quote_id = p_quote_id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'Quote has no line items. Add services before sending.'; END IF;

  v_old_status := v_quote.status;
  v_valid_until := COALESCE(v_quote.valid_until, (now() + interval '30 days')::date);

  -- Resolve recipient: prefer personal name (preferred_name then first+last) over company name
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT email, first_name, last_name
      INTO v_recipient_email, v_first, v_last
    FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT email, preferred_name, first_name, last_name
      INTO v_recipient_email, v_preferred, v_first, v_last
    FROM clients WHERE id = v_quote.client_id;
  END IF;

  -- If no email yet (company-only quote), look up linked client/director via company
  IF v_recipient_email IS NULL AND v_quote.company_id IS NOT NULL THEN
    SELECT c.email, c.preferred_name, c.first_name, c.last_name
      INTO v_recipient_email, v_preferred, v_first, v_last
    FROM clients c
    WHERE c.company_id = v_quote.company_id
      AND c.email IS NOT NULL
    ORDER BY c.created_at ASC
    LIMIT 1;

    IF v_recipient_email IS NULL THEN
      SELECT email INTO v_recipient_email FROM companies WHERE id = v_quote.company_id;
    END IF;
  END IF;

  v_recipient_first := COALESCE(NULLIF(trim(v_preferred), ''), NULLIF(trim(v_first), ''));
  v_recipient_name  := COALESCE(
    NULLIF(trim(v_preferred), ''),
    NULLIF(trim(coalesce(v_first,'') || ' ' || coalesce(v_last,'')), '')
  );

  -- Last-resort fallback to company name
  IF v_recipient_name IS NULL AND v_quote.company_id IS NOT NULL THEN
    SELECT company_name INTO v_recipient_name FROM companies WHERE id = v_quote.company_id;
    v_recipient_first := COALESCE(v_recipient_first, v_recipient_name);
  END IF;

  -- Practice name
  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_practice_name
  FROM organizations o
  LEFT JOIN organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_quote.organization_id;

  -- Pick org-scoped template first, fall back to system template
  SELECT id, content INTO v_template_id, v_template_content
  FROM templates
  WHERE type = 'email' AND service = 'quote_proposal' AND status = 'active'
    AND organization_id = v_quote.organization_id
  ORDER BY updated_at DESC LIMIT 1;
  IF v_template_id IS NULL THEN
    SELECT id, content INTO v_template_id, v_template_content
    FROM templates
    WHERE type = 'email' AND service = 'quote_proposal' AND status = 'active'
      AND organization_id IS NULL
    ORDER BY updated_at DESC LIMIT 1;
  END IF;

  v_lines_html :=
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px;">'
    || '<thead><tr style="background:#f4f5f7;text-align:left;">'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;">Service</th>'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Qty</th>'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Unit</th>'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Frequency</th>'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Subtotal</th>'
    || '</tr></thead><tbody>';

  FOR v_line IN
    SELECT ql.quantity, ql.unit_price, ql.subtotal, ql.billing_frequency,
           COALESCE(NULLIF(ql.description_override, ''), sc.name) AS service_name
    FROM quote_lines ql
    JOIN services_catalog sc ON sc.id = ql.service_id
    WHERE ql.quote_id = p_quote_id
    ORDER BY ql.line_order, ql.created_at
  LOOP
    IF v_line.billing_frequency = 'monthly' THEN
      v_freq_label      := 'Monthly';
      v_unit_display    := round(v_line.unit_price / 12.0, 2);
      v_subtotal_display := round(v_line.subtotal / 12.0, 2);
      v_unit_suffix     := ' /mo';
      v_subtotal_suffix := ' /mo';
      v_total_monthly   := v_total_monthly + v_subtotal_display;
    ELSE
      v_freq_label      := 'One-off';
      v_unit_display    := v_line.unit_price;
      v_subtotal_display := v_line.subtotal;
      v_unit_suffix     := '';
      v_subtotal_suffix := '';
      v_total_now       := v_total_now + v_line.subtotal;
    END IF;

    v_lines_html := v_lines_html
      || '<tr>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;">' || coalesce(v_line.service_name, '') || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || coalesce(v_line.quantity::text, '') || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || COALESCE(v_quote.currency,'GBP') || ' ' || coalesce(v_unit_display::text,'') || v_unit_suffix || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_freq_label || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || COALESCE(v_quote.currency,'GBP') || ' ' || coalesce(v_subtotal_display::text,'') || v_subtotal_suffix || '</td>'
      || '</tr>';
  END LOOP;

  v_lines_html := v_lines_html || '</tbody></table>';

  -- Token
  v_token := gen_random_uuid();
  INSERT INTO quote_acceptance_tokens(token, quote_id, expires_at)
  VALUES (v_token, p_quote_id, now() + interval '30 days');

  -- Build merge fields
  v_merge := jsonb_build_object(
    'recipient_name', v_recipient_name,
    'recipient_first_name', v_recipient_first,
    'practice_name', v_practice_name,
    'quote_number', v_quote.quote_number,
    'currency', COALESCE(v_quote.currency,'GBP'),
    'total_now', v_total_now::text,
    'total_monthly', v_total_monthly::text,
    'total_amount', COALESCE(v_quote.total_amount,0)::text,
    'valid_until', to_char(v_valid_until, 'DD Mon YYYY'),
    'accept_url', v_base_url || '/q/' || v_token::text,
    'lines_html', v_lines_html
  );

  IF v_template_content IS NOT NULL THEN
    v_subject   := COALESCE(v_template_content->>'subject', 'Proposal from ' || v_practice_name);
    v_body_html := COALESCE(v_template_content->>'body_html', v_template_content->>'body', '');
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_merge) LOOP
      v_subject   := replace(v_subject, '{{' || v_key || '}}', COALESCE(v_val,''));
      v_body_html := replace(v_body_html, '{{' || v_key || '}}', COALESCE(v_val,''));
    END LOOP;
  ELSE
    v_subject := 'Proposal ' || v_quote.quote_number || ' from ' || v_practice_name;
    v_body_html :=
      '<p>Dear ' || COALESCE(v_recipient_first, v_recipient_name, 'Client') || ',</p>' ||
      '<p>Please find your proposal below.</p>' ||
      v_lines_html ||
      '<p><a href="' || (v_base_url || '/q/' || v_token::text) || '">Review and accept your proposal</a></p>' ||
      '<p>Kind regards,<br/>' || v_practice_name || '</p>';
  END IF;

  IF v_recipient_email IS NOT NULL THEN
    INSERT INTO email_queue (
      organization_id, client_id, company_id, lead_id, quote_id,
      to_email, to_name, subject, body_html, status, scheduled_for, created_at
    ) VALUES (
      v_quote.organization_id, v_quote.client_id, v_quote.company_id, v_quote.lead_id, v_quote.id,
      v_recipient_email, v_recipient_name, v_subject, v_body_html, 'queued', now(), now()
    );
    v_email_queued := true;
  END IF;

  UPDATE quotes
     SET status = 'sent',
         sent_at = COALESCE(sent_at, now()),
         valid_until = v_valid_until,
         updated_at = now()
   WHERE id = p_quote_id;

  RETURN jsonb_build_object(
    'quote_id', p_quote_id,
    'status', 'sent',
    'email_queued', v_email_queued,
    'recipient_email', v_recipient_email,
    'recipient_name', v_recipient_name
  );
END;
$function$;

-- 2. public_get_quote_by_token: prefer personal name in recipient_name
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

-- 3. public_sign_engagement_letter: prefer personal name in letter body
CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter(p_application_id uuid, p_signature_data jsonb)
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

-- 4. public_preview_engagement_letter: prefer personal name in preview
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
  v_preferred text;
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
