
-- 1. Capture quote creator
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.quotes_set_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_set_created_by_trg ON public.quotes;
CREATE TRIGGER quotes_set_created_by_trg
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_set_created_by();

-- 2. lifecycle_send_quote: resolve creator mailbox and stamp the queue row
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

  -- Resolve sender mailbox: prefer the creator's own connected mailbox
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
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || to_char(coalesce(v_line.quantity, 0), 'FM999,990.##') || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_currency || ' ' || to_char(coalesce(v_unit_display, 0), 'FM999,999,990.00') || v_unit_suffix || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_freq_label || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_currency || ' ' || to_char(coalesce(v_subtotal_display, 0), 'FM999,999,990.00') || v_subtotal_suffix || '</td>'
      || '</tr>';
  END LOOP;

  v_lines_html := v_lines_html || '</tbody></table>';

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
      'quote', v_quote.id, 'quote_send',
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
