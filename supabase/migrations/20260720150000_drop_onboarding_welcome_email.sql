-- ============================================================
-- Onboarding completion should send ONE client email, not two
-- ============================================================
-- On approval, two emails went out: (1) the "Welcome - your account is now active" email queued by
-- the notify_onboarding_approved trigger, and (2) the portal-setup invitation (sent via the portal
-- invite flow). The welcome email is redundant — the portal-setup email already tells the client
-- onboarding passed and the final step is to set up their portal.
--
-- This redefines notify_onboarding_approved to drop the email_queue insert while KEEPING the
-- internal "Client activated" staff notification. Reproduced from the latest definition
-- (20260603175309) with only the email block removed (and the now-unused v_portal_url var).
-- Additive/safe: no data change; it only stops queuing one email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_onboarding_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient_name text;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    v_recipient_name := COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), ''),
      NEW.company_name,
      'there'
    );

    -- Removed: the "Welcome - your account is now active" email. Onboarding completion now sends a
    -- single client email — the portal-setup invitation, via the portal invite flow. This trigger
    -- keeps only the internal staff notification below.

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
