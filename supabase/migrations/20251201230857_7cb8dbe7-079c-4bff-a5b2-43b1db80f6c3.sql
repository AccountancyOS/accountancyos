-- Fix lifecycle_send_quote to properly fetch recipient email from related tables
CREATE OR REPLACE FUNCTION public.lifecycle_send_quote(p_quote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote record;
  v_line_count integer;
  v_recipient_email text;
  v_recipient_name text;
  v_lead record;
  v_old_status text;
  v_email_queued boolean := false;
BEGIN
  -- Fetch quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;

  -- Verify caller has access to organization
  IF NOT user_has_organization_access(v_quote.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  -- Validate quote status (can only send draft quotes)
  IF v_quote.status != 'draft' THEN
    RAISE EXCEPTION 'Quote cannot be sent. Current status: %. Only draft quotes can be sent.', v_quote.status;
  END IF;

  -- Validate quote has at least 1 line
  SELECT COUNT(*) INTO v_line_count FROM quote_lines WHERE quote_id = p_quote_id;
  
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Quote has no line items. Add services before sending.';
  END IF;

  v_old_status := v_quote.status;

  -- Update quote
  UPDATE quotes 
  SET 
    status = 'sent',
    sent_at = now(),
    valid_until = COALESCE(valid_until, now() + interval '30 days')
  WHERE id = p_quote_id;

  -- Determine recipient email from related entities
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT email, COALESCE(first_name || ' ' || last_name, company_name) 
    INTO v_recipient_email, v_recipient_name
    FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT email, first_name || ' ' || last_name 
    INTO v_recipient_email, v_recipient_name
    FROM clients WHERE id = v_quote.client_id;
  ELSIF v_quote.company_id IS NOT NULL THEN
    SELECT email, company_name 
    INTO v_recipient_email, v_recipient_name
    FROM companies WHERE id = v_quote.company_id;
  END IF;

  -- Queue quote email if recipient available
  IF v_recipient_email IS NOT NULL AND v_recipient_email != '' THEN
    INSERT INTO email_queue (
      organization_id,
      to_email,
      to_name,
      subject,
      body_html,
      entity_type,
      entity_id,
      merge_data,
      status
    )
    VALUES (
      v_quote.organization_id,
      v_recipient_email,
      v_recipient_name,
      'Your quote from ' || (SELECT name FROM organizations WHERE id = v_quote.organization_id),
      '<p>Thank you for your interest. Please find your quote attached.</p><p>This quote is valid until ' || to_char(COALESCE(v_quote.valid_until, now() + interval '30 days'), 'DD/MM/YYYY') || '.</p>',
      'quote',
      p_quote_id,
      jsonb_build_object(
        'quote_id', p_quote_id,
        'recipient_name', v_recipient_name,
        'valid_until', COALESCE(v_quote.valid_until, now() + interval '30 days')
      ),
      'pending'
    );

    v_email_queued := true;
  END IF;

  -- Write audit log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    old_value,
    new_value,
    user_id,
    metadata
  )
  VALUES (
    v_quote.organization_id,
    'quote',
    p_quote_id,
    'status_change',
    v_old_status,
    'sent',
    auth.uid(),
    jsonb_build_object('email_queued', v_email_queued, 'recipient', v_recipient_email)
  );

  -- Return result
  RETURN jsonb_build_object(
    'quote_id', p_quote_id,
    'status', 'sent',
    'sent_at', now(),
    'valid_until', COALESCE(v_quote.valid_until, now() + interval '30 days'),
    'email_queued', v_email_queued,
    'recipient_email', v_recipient_email
  );
END;
$function$;