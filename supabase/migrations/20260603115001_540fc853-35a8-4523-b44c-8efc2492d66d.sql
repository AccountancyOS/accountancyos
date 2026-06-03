-- Phase 3 completion: queue a client welcome/activation email when an onboarding application is approved.
CREATE OR REPLACE FUNCTION public.notify_onboarding_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_name text;
  v_portal_url text;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    v_recipient_name := COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), ''),
      NEW.company_name,
      'there'
    );
    v_portal_url := COALESCE(
      (SELECT 'https://' || custom_domain FROM organizations WHERE id = NEW.organization_id AND custom_domain IS NOT NULL LIMIT 1),
      'https://portal.accountancyos.com'
    );

    -- Welcome email to client
    INSERT INTO email_queue (
      organization_id, to_email, to_name, subject, body_html,
      entity_type, entity_id, status
    )
    VALUES (
      NEW.organization_id,
      COALESCE(NEW.portal_email, NEW.email),
      v_recipient_name,
      'Welcome - your account is now active',
      '<p>Hi ' || v_recipient_name || ',</p>'
      || '<p>Good news - your onboarding has been reviewed and approved. Your account is now active and you can access your client portal at any time.</p>'
      || '<p><a href="' || v_portal_url || '">Open your client portal</a></p>'
      || '<p>If you have any questions, just reply to this email.</p>',
      'onboarding',
      NEW.id,
      'pending'
    );

    -- Notify all org members
    INSERT INTO notifications (organization_id, user_id, type, title, message, entity_type, entity_id)
    SELECT
      NEW.organization_id,
      om.user_id,
      'onboarding_approved',
      'Client activated',
      v_recipient_name || ' has been approved and activated.',
      'onboarding',
      NEW.id
    FROM organization_members om
    WHERE om.organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_onboarding_approved ON public.onboarding_applications;
CREATE TRIGGER trg_notify_onboarding_approved
AFTER UPDATE OF status ON public.onboarding_applications
FOR EACH ROW
EXECUTE FUNCTION public.notify_onboarding_approved();