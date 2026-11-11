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
  v_currency            text;
  v_accept_url          text;
  v_mailbox_id          uuid;
  v_mailbox_provider    text;
  v_mailbox_from        text;
  v_creator             uuid;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found: %', p_quote_id; END IF;
  IF NOT user_has_organization_access(v_quote.organization_id) THEN RAISE EXCEPTION 'Access denied to organization'; END IF;
  IF v_quote.status != 'draft' THEN RAISE EXCEPTION 'Quote cannot be sent. Current status: %. Only draft quotes can be sent.', v_quote.status; END IF;

  SELECT COUNT(*) INTO v_line_count FROM quote_lines WHERE quote_id = p_quote_id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'Quote has no line items. Add services before sending.'; END IF;

  v_valid_until := COALESCE(v_quote.valid_until, (now() + interval '30 days')::date);
  v_currency := COALESCE(v_quote.currency, 'GBP');
  v_creator := COALESCE(v_quote.created_by, auth.uid());

  IF v_quote.lead_id IS NOT NULL THEN
    SELECT email, first_name, last_name
      INTO v_recipient_email, v_first, v_last
    FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT email, preferred_name, first_name, last_name
      INTO v_recipient_email, v_preferred, v_first, v_last
    FROM clients WHERE id = v_quote.client_id;
  END IF;

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

  IF v_recipient_name IS NULL AND v_quote.company_id IS NOT NULL THEN
    SELECT company_name INTO v_recipient_name FROM companies WHERE id = v_quote.company_id;
    v_recipient_first := COALESCE(v_recipient_first, v_recipient_name);
  END IF;

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_practice_name
  FROM organizations o
  LEFT JOIN organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_quote.organization_id;

  IF v_creator IS NOT NULL THEN
    SELECT id, provider, email_address
      INTO v_mailbox_id, v_mailbox_provider, v_mailbox_from
    FROM connected_mailboxes
    WHERE organization_id = v_quote.organization_id
      AND user_id = v_creator
      AND status = 'active'
      AND COALESCE(sync_enabled, true) = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_mailbox_id IS NULL THEN
    SELECT id, provider, email_address
      INTO v_mailbox_id, v_mailbox_provider, v_mailbox_from
    FROM connected_mailboxes
    WHERE organization_id = v_quote.organization_id
      AND status = 'active'
      AND COALESCE(sync_enabled, true) = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  SELECT id, content INTO v_template_id, v_template_content
  FROM templates
  WHERE organization_id = v_quote.organization_id
    AND type = 'email'
    AND (
          COALESCE(tags, '[]'::jsonb) ? 'quote'
       OR name ILIKE '%quote%'
       OR name ILIKE '%proposal%'
        )
    AND COALESCE(status, 'active') = 'active'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  FOR v_line IN
    SELECT ql.*, sc.name AS service_name
    FROM quote_lines ql
    LEFT JOIN services_catalog sc ON sc.id = ql.service_id
    WHERE ql.quote_id = p_quote_id
    ORDER BY ql.line_order
  LOOP
    IF v_line.billing_frequency = 'monthly' THEN
      v_freq_label := 'Monthly';
      v_unit_display := ROUND(COALESCE(v_line.unit_price,0) / 12.0, 2);
      v_subtotal_display := ROUND(v_unit_display * COALESCE(v_line.quantity,1), 2);
      v_unit_suffix := '/mo';
      v_subtotal_suffix := '/mo';
      v_total_monthly := v_total_monthly + v_subtotal_display;
    ELSE
      v_freq_label := 'Bill Now';
      v_unit_display := COALESCE(v_line.unit_price, 0);
      v_subtotal_display := COALESCE(v_line.subtotal, v_unit_display * COALESCE(v_line.quantity,1));
      v_unit_suffix := '';
      v_subtotal_suffix := '';
      v_total_now := v_total_now + v_subtotal_display;
    END IF;

    v_lines_html := v_lines_html ||
      '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' || COALESCE(v_line.service_name, 'Service') ||
      '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' || COALESCE(v_line.quantity,1) ||
      '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' || v_currency || ' ' || to_char(v_unit_display, 'FM999,999,990.00') || v_unit_suffix ||
      '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' || v_currency || ' ' || to_char(v_subtotal_display, 'FM999,999,990.00') || v_subtotal_suffix ||
      '</td></tr>';
  END LOOP;

  v_lines_html :=
    '<table style="border-collapse:collapse;width:100%;margin:12px 0">' ||
    '<thead><tr>' ||
    '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ccc">Service</th>' ||
    '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ccc">Qty</th>' ||
    '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ccc">Unit</th>' ||
    '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ccc">Subtotal</th>' ||
    '</tr></thead><tbody>' || v_lines_html || '</tbody></table>';

  v_token := gen_random_uuid();
  INSERT INTO quote_acceptance_tokens(token, quote_id, organization_id, expires_at)
  VALUES (v_token, p_quote_id, v_quote.organization_id, now() + interval '30 days');

  v_accept_url := v_base_url || '/q/' || v_token::text;

  v_merge := jsonb_build_object(
    'recipient_name', v_recipient_name,
    'recipient_first_name', v_recipient_first,
    'practice_name', v_practice_name,
    'quote_number', v_quote.quote_number,
    'currency', v_currency,
    'total_now', to_char(v_total_now, 'FM999,999,990.00'),
    'total_monthly', to_char(v_total_monthly, 'FM999,999,990.00'),
    'total_amount', to_char(COALESCE(v_quote.total_amount, 0), 'FM999,999,990.00'),
    'valid_until', to_char(v_valid_until, 'DD Mon YYYY'),
    'accept_url', v_accept_url,
    'lines_html', v_lines_html,
    'quote_total_now', to_char(v_total_now, 'FM999,999,990.00'),
    'quote_total_monthly', to_char(v_total_monthly, 'FM999,999,990.00'),
    'quote_total', to_char(COALESCE(v_quote.total_amount, 0), 'FM999,999,990.00'),
    'accept_link', v_accept_url,
    'quote_lines_table', v_lines_html
  );

  IF v_template_content IS NOT NULL THEN
    v_subject   := COALESCE(v_template_content->>'subject', 'Proposal from ' || v_practice_name);
    v_body_html := COALESCE(
      NULLIF(v_template_content->>'htmlBody', ''),
      NULLIF(v_template_content->>'body_html', ''),
      NULLIF(v_template_content->>'body', ''),
      ''
    );
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
      '<p><strong>Payable Now:</strong> ' || v_currency || ' ' || to_char(v_total_now, 'FM999,999,990.00') || '<br/>' ||
      '<strong>Payable Monthly:</strong> ' || v_currency || ' ' || to_char(v_total_monthly, 'FM999,999,990.00') || '</p>' ||
      '<p><a href="' || v_accept_url || '">Review and accept your proposal</a></p>' ||
      '<p>Kind regards,<br/>' || v_practice_name || '</p>';
  END IF;

  IF v_body_html !~ '<[a-zA-Z]' THEN
    v_body_html := replace(v_body_html, E'\n', '<br/>');
  END IF;

  IF v_recipient_email IS NOT NULL THEN
    INSERT INTO email_queue (
      organization_id, client_id, company_id,
      entity_type, entity_id, context,
      to_email, to_name, subject, body_html,
      mailbox_id, provider, created_by, queued_by,
      status, scheduled_at, created_at
    ) VALUES (
      v_quote.organization_id, v_quote.client_id, v_quote.company_id,
      'quote', v_quote.id, 'quote',
      v_recipient_email, v_recipient_name, v_subject, v_body_html,
      v_mailbox_id, v_mailbox_provider, v_creator, auth.uid(),
      'pending', now(), now()
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
    'recipient_name', v_recipient_name,
    'sender_mailbox', v_mailbox_from,
    'sender_provider', v_mailbox_provider
  );
END;
$function$;