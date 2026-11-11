
-- 1. Seed system "Quote Proposal" template
INSERT INTO public.templates (
  id, organization_id, name, description, type, service, status, content
)
VALUES (
  '00000000-0000-0000-0000-000000000a01'::uuid,
  NULL,
  'Quote Proposal',
  'Default proposal email sent to leads/clients when a quote is issued. Customise by duplicating into your organisation.',
  'email',
  'quote_proposal',
  'active',
  jsonb_build_object(
    'category', 'Quotes',
    'subject', 'Your quote from {{practice_name}}',
    'htmlBody',
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px;">'
    || '<p style="font-size:15px;">Dear {{recipient_name}},</p>'
    || '<p style="font-size:15px;line-height:1.5;">Thank you for considering {{practice_name}}. Please find your proposal below, covering the services we have discussed.</p>'
    || '<h2 style="font-size:18px;margin:24px 0 8px;">Proposal {{quote_number}}</h2>'
    || '<p style="font-size:13px;color:#555;margin:0 0 16px;">Valid until {{valid_until}}</p>'
    || '{{quote_lines_table}}'
    || '<p style="font-size:15px;margin:24px 0 8px;"><strong>Total: {{currency}} {{quote_total}}</strong></p>'
    || '<div style="margin:32px 0;text-align:center;">'
    || '<a href="{{accept_link}}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;">View &amp; Accept Proposal</a>'
    || '</div>'
    || '<p style="font-size:14px;line-height:1.5;">If you have any questions please reply to this email.</p>'
    || '<p style="font-size:14px;margin-top:24px;">Kind regards,<br/>{{practice_name}}</p>'
    || '</div>',
    'body', E'Dear {{recipient_name}},\n\nThank you for considering {{practice_name}}. Please find your proposal {{quote_number}} below.\n\nTotal: {{currency}} {{quote_total}}\nValid until: {{valid_until}}\n\nView and accept your proposal here: {{accept_link}}\n\nKind regards,\n{{practice_name}}'
  )
)
ON CONFLICT (id) DO NOTHING;

-- 2. quote_acceptance_tokens
CREATE TABLE IF NOT EXISTS public.quote_acceptance_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_acceptance_tokens_quote_id ON public.quote_acceptance_tokens(quote_id);

GRANT SELECT ON public.quote_acceptance_tokens TO anon;
GRANT SELECT ON public.quote_acceptance_tokens TO authenticated;
GRANT ALL ON public.quote_acceptance_tokens TO service_role;

ALTER TABLE public.quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone with the token can read live tokens" ON public.quote_acceptance_tokens;
CREATE POLICY "Anyone with the token can read live tokens"
  ON public.quote_acceptance_tokens
  FOR SELECT
  TO anon, authenticated
  USING (used_at IS NULL AND expires_at > now());

-- 3. lifecycle_send_quote rewrite
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
  v_token               uuid;
  v_valid_until         date;
  v_lines_html          text := '';
  v_line                record;
  v_freq_label          text;
  v_base_url            text := 'https://app.accountancyos.com';
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quote not found: %', p_quote_id; END IF;
  IF NOT user_has_organization_access(v_quote.organization_id) THEN RAISE EXCEPTION 'Access denied to organization'; END IF;
  IF v_quote.status != 'draft' THEN RAISE EXCEPTION 'Quote cannot be sent. Current status: %. Only draft quotes can be sent.', v_quote.status; END IF;

  SELECT COUNT(*) INTO v_line_count FROM quote_lines WHERE quote_id = p_quote_id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'Quote has no line items. Add services before sending.'; END IF;

  v_old_status := v_quote.status;
  v_valid_until := COALESCE(v_quote.valid_until, (now() + interval '30 days')::date);

  UPDATE quotes SET status = 'sent', sent_at = now(), valid_until = v_valid_until WHERE id = p_quote_id;

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

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_practice_name
  FROM organizations o
  LEFT JOIN organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_quote.organization_id;

  SELECT id INTO v_template_id
  FROM templates
  WHERE type = 'email' AND service = 'quote_proposal' AND status = 'active'
    AND organization_id = v_quote.organization_id
  ORDER BY updated_at DESC LIMIT 1;
  IF v_template_id IS NULL THEN
    SELECT id INTO v_template_id
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
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Unit Price</th>'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Frequency</th>'
    || '<th style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">Line Total</th>'
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

  INSERT INTO quote_acceptance_tokens (quote_id, organization_id, expires_at)
  VALUES (p_quote_id, v_quote.organization_id, (v_valid_until::timestamptz + interval '1 day'))
  RETURNING token INTO v_token;

  IF v_recipient_email IS NOT NULL AND v_recipient_email != '' THEN
    INSERT INTO email_queue (
      organization_id, to_email, to_name,
      subject, body_html, template_id,
      entity_type, entity_id, merge_data, status
    )
    VALUES (
      v_quote.organization_id,
      v_recipient_email,
      v_recipient_name,
      CASE WHEN v_template_id IS NULL THEN 'Your quote from ' || v_practice_name ELSE NULL END,
      CASE WHEN v_template_id IS NULL
           THEN '<p>Please find your proposal ' || v_quote.quote_number || ' attached. Total: ' || v_quote.currency || ' ' || to_char(v_quote.total_amount, 'FM999,999,990.00') || '.</p><p><a href="' || v_base_url || '/q/' || v_token::text || '">View &amp; Accept Proposal</a></p>'
           ELSE NULL END,
      v_template_id,
      'quote',
      p_quote_id,
      jsonb_build_object(
        'recipient_name', COALESCE(v_recipient_first, v_recipient_name, 'there'),
        'practice_name', v_practice_name,
        'quote_number', v_quote.quote_number,
        'currency', v_quote.currency,
        'quote_total', to_char(v_quote.total_amount, 'FM999,999,990.00'),
        'valid_until', to_char(v_valid_until, 'DD Mon YYYY'),
        'accept_link', v_base_url || '/q/' || v_token::text,
        'quote_lines_table', v_lines_html
      ),
      'pending'
    );
    v_email_queued := true;
  END IF;

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

-- 4. Public token RPCs
CREATE OR REPLACE FUNCTION public.public_get_quote_by_token(p_token uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tok record; v_quote record; v_practice_name text; v_recipient_name text; v_lines jsonb;
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

  RETURN jsonb_build_object(
    'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'status', v_quote.status,
    'currency', v_quote.currency, 'total_amount', v_quote.total_amount,
    'valid_until', v_quote.valid_until, 'sent_at', v_quote.sent_at,
    'accepted_at', v_quote.accepted_at, 'rejected_at', v_quote.rejected_at,
    'notes', v_quote.notes, 'practice_name', v_practice_name,
    'recipient_name', v_recipient_name, 'lines', v_lines,
    'used', v_tok.used_at IS NOT NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_get_quote_by_token(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_accept_quote_by_token(p_token uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tok record; v_quote record; v_old_status text;
BEGIN
  SELECT * INTO v_tok FROM quote_acceptance_tokens WHERE token = p_token;
  IF v_tok.token IS NULL THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('error', 'already_used'); END IF;
  IF v_tok.expires_at <= now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_tok.quote_id FOR UPDATE;
  IF v_quote.status NOT IN ('draft', 'sent') THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'status', v_quote.status);
  END IF;
  v_old_status := v_quote.status;

  UPDATE quotes SET status='accepted', accepted_at=now(), sent_at=COALESCE(sent_at, now()) WHERE id = v_quote.id;
  UPDATE quote_acceptance_tokens SET used_at=now() WHERE token = p_token;

  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE leads SET pipeline_stage='won', converted_at=now() WHERE id = v_quote.lead_id;
  END IF;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id, metadata)
  VALUES (v_quote.organization_id, 'quote', v_quote.id, 'status_change', v_old_status, 'accepted', NULL,
          jsonb_build_object('source','public_token'));

  RETURN jsonb_build_object('success', true, 'quote_id', v_quote.id, 'status', 'accepted');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_accept_quote_by_token(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_reject_quote_by_token(p_token uuid, p_reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tok record; v_quote record; v_old_status text;
BEGIN
  SELECT * INTO v_tok FROM quote_acceptance_tokens WHERE token = p_token;
  IF v_tok.token IS NULL THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('error', 'already_used'); END IF;
  IF v_tok.expires_at <= now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_tok.quote_id FOR UPDATE;
  IF v_quote.status NOT IN ('draft','sent') THEN
    RETURN jsonb_build_object('error','invalid_status','status', v_quote.status);
  END IF;
  v_old_status := v_quote.status;

  UPDATE quotes SET status='rejected', rejected_at=now(),
                   rejection_reason=COALESCE(p_reason,'Declined by client')
  WHERE id = v_quote.id;
  UPDATE quote_acceptance_tokens SET used_at=now() WHERE token = p_token;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, old_value, new_value, user_id, metadata)
  VALUES (v_quote.organization_id, 'quote', v_quote.id, 'status_change', v_old_status, 'rejected', NULL,
          jsonb_build_object('source','public_token','reason', p_reason));

  RETURN jsonb_build_object('success', true, 'quote_id', v_quote.id, 'status','rejected');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_reject_quote_by_token(uuid, text) TO anon, authenticated;
