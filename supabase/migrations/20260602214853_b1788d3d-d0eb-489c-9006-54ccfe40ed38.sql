
-- Housekeeping: drop stale duplicate constraint (NOT VALID, never enforced)
ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS chk_email_queue_status;

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

  -- Resolve recipient
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT email, first_name || ' ' || last_name, first_name
      INTO v_recipient_email, v_recipient_name, v_recipient_first
    FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT email, first_name || ' ' || last_name, first_name
      INTO v_recipient_email, v_recipient_name, v_recipient_first
    FROM clients WHERE id = v_quote.client_id;
  ELSIF v_quote.company_id IS NOT NULL THEN
    SELECT email, company_name, company_name
      INTO v_recipient_email, v_recipient_name, v_recipient_first
    FROM companies WHERE id = v_quote.company_id;
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

  -- Build line-items table
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
    v_freq_label := CASE WHEN v_line.billing_frequency = 'monthly' THEN 'Monthly' ELSE 'One-off' END;
    v_lines_html := v_lines_html
      || '<tr>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;">' || coalesce(v_line.service_name, '') || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || to_char(v_line.quantity, 'FM999,990.##') || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_quote.currency || ' ' || to_char(v_line.unit_price, 'FM999,999,990.00') || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_freq_label || '</td>'
      || '<td style="padding:10px;border-bottom:1px solid #f0f1f3;text-align:right;">' || v_quote.currency || ' ' || to_char(v_line.subtotal, 'FM999,999,990.00') || '</td>'
      || '</tr>';
  END LOOP;
  v_lines_html := v_lines_html || '</tbody></table>';

  -- Issue acceptance token
  INSERT INTO quote_acceptance_tokens (quote_id, organization_id, expires_at)
  VALUES (p_quote_id, v_quote.organization_id, (v_valid_until::timestamptz + interval '1 day'))
  RETURNING token INTO v_token;

  -- Build merge data
  v_merge := jsonb_build_object(
    'recipient_name', COALESCE(v_recipient_first, v_recipient_name, 'there'),
    'practice_name',  COALESCE(v_practice_name, 'your accountant'),
    'quote_number',   v_quote.quote_number,
    'currency',       v_quote.currency,
    'quote_total',    to_char(v_quote.total_amount, 'FM999,999,990.00'),
    'valid_until',    to_char(v_valid_until, 'DD Mon YYYY'),
    'accept_link',    v_base_url || '/q/' || v_token::text,
    'quote_lines_table', v_lines_html
  );

  -- Resolve subject + body from template (or fallback) — always non-null
  IF v_template_content IS NOT NULL THEN
    v_subject   := COALESCE(NULLIF(v_template_content->>'subject', ''),
                            'Your quote from ' || COALESCE(v_practice_name, 'your accountant'));
    v_body_html := COALESCE(NULLIF(v_template_content->>'htmlBody', ''),
                            NULLIF(v_template_content->>'body', ''),
                            '<p>Please find your proposal ' || v_quote.quote_number || '.</p>');
  ELSE
    v_subject   := 'Your quote from ' || COALESCE(v_practice_name, 'your accountant');
    v_body_html := '<p>Please find your proposal ' || v_quote.quote_number
                 || '. Total: ' || v_quote.currency || ' '
                 || to_char(v_quote.total_amount, 'FM999,999,990.00') || '.</p>'
                 || '<p><a href="' || v_base_url || '/q/' || v_token::text || '">View &amp; Accept Proposal</a></p>';
  END IF;

  -- Server-side merge token substitution so the queued row is fully rendered
  FOR v_key, v_val IN SELECT key, value::text FROM jsonb_each_text(v_merge) LOOP
    v_subject   := replace(v_subject,   '{{' || v_key || '}}', COALESCE(v_val, ''));
    v_body_html := replace(v_body_html, '{{' || v_key || '}}', COALESCE(v_val, ''));
  END LOOP;

  IF v_recipient_email IS NOT NULL AND v_recipient_email != '' THEN
    BEGIN
      INSERT INTO email_queue (
        organization_id, to_email, to_name,
        subject, body_html, template_id,
        entity_type, entity_id, merge_data, status
      )
      VALUES (
        v_quote.organization_id,
        v_recipient_email,
        v_recipient_name,
        v_subject,
        v_body_html,
        v_template_id,
        'quote',
        p_quote_id,
        v_merge,
        'pending'
      );
      v_email_queued := true;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to queue quote email: %', SQLERRM;
    END;
  END IF;

  -- Promote quote to "sent" state
  UPDATE quotes
     SET status      = 'sent',
         sent_at     = now(),
         valid_until = v_valid_until,
         updated_at  = now()
   WHERE id = p_quote_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id, metadata)
  VALUES (v_quote.organization_id, 'quote', p_quote_id, 'status_change', v_old_status, 'sent', auth.uid(),
          jsonb_build_object('email_queued', v_email_queued, 'recipient', v_recipient_email, 'template_id', v_template_id, 'practice_name', v_practice_name));

  RETURN jsonb_build_object(
    'quote_id', p_quote_id, 'status', 'sent', 'sent_at', now(),
    'valid_until', v_valid_until, 'email_queued', v_email_queued,
    'recipient_email', v_recipient_email, 'accept_token', v_token
  );
END;
$function$;
