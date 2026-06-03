CREATE OR REPLACE FUNCTION public.notify_onboarding_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient_name text;
  v_portal_url text := 'https://client.accountancyos.com';
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    v_recipient_name := COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), ''),
      NEW.company_name,
      'there'
    );

    INSERT INTO email_queue (
      organization_id, to_email, to_name, subject, body_html,
      context, entity_type, entity_id, status
    ) VALUES (
      NEW.organization_id,
      COALESCE(NEW.portal_email, NEW.email),
      v_recipient_name,
      'Welcome - your account is now active',
      '<p>Hi ' || v_recipient_name || ',</p>'
      || '<p>Good news - your onboarding has been reviewed and approved. Your account is now active and you can access your client portal at any time.</p>'
      || '<p><a href="' || v_portal_url || '">Open your client portal</a></p>'
      || '<p>If you have any questions, just reply to this email.</p>',
      'onboarding', 'onboarding', NEW.id, 'pending'
    );

    INSERT INTO notifications (organization_id, user_id, type, title, message, entity_type, entity_id)
    SELECT
      NEW.organization_id, om.user_id,
      'onboarding_approved',
      'Client activated',
      v_recipient_name || ' has been approved and activated.',
      'onboarding', NEW.id
    FROM public.organization_users om
    WHERE om.organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$function$;