
-- 1. Expand notifications.entity_type check to allow onboarding values
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type = ANY (ARRAY['deadline','job','document','message','task','onboarding_application','onboarding','client','company','lead','quote']));

-- 2. Fix auto_verify_aml_on_approval trigger to use 'passed' (valid aml_status value)
CREATE OR REPLACE FUNCTION public.auto_verify_aml_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    NEW.aml_status := 'passed';
    NEW.aml_verified_at := NOW();
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Fix public_submit_onboarding_for_review: valid email_queue status + context, no silent swallow
CREATE OR REPLACE FUNCTION public.public_submit_onboarding_for_review(
  p_application_id uuid,
  p_portal_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_org_name text;
  v_member record;
  v_client_name text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status = 'for_review' THEN
    RETURN jsonb_build_object('status','for_review','already', true);
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'for_review',
         portal_email = COALESCE(p_portal_email, portal_email),
         submitted_for_review_at = now(),
         updated_at = now()
   WHERE id = p_application_id;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_app.organization_id;
  v_client_name := COALESCE(v_app.company_name,
    NULLIF(trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')), ''),
    v_app.email, 'New onboarding');

  -- Notify all org members (owner + staff)
  FOR v_member IN
    SELECT user_id FROM public.organization_users WHERE organization_id = v_app.organization_id
  LOOP
    INSERT INTO public.notifications (
      organization_id, user_id, type, title, message, entity_type, entity_id
    ) VALUES (
      v_app.organization_id, v_member.user_id, 'onboarding_for_review',
      'New onboarding ready for review',
      v_client_name || ' has completed onboarding and is ready for review.',
      'onboarding_application', p_application_id
    );
  END LOOP;

  -- Internal email summary to owners
  INSERT INTO public.email_queue (
    organization_id, to_email, to_name, subject, body_html, status, context, entity_type, entity_id
  )
  SELECT v_app.organization_id,
         u.email,
         COALESCE(u.raw_user_meta_data->>'full_name', u.email),
         'Onboarding ready for review: ' || v_client_name,
         '<p>' || v_client_name || ' has completed the onboarding wizard.</p>' ||
         '<p>Please review in AccountancyOS.</p>',
         'pending', 'onboarding', 'onboarding_application', p_application_id
    FROM public.organization_users om
    JOIN auth.users u ON u.id = om.user_id
   WHERE om.organization_id = v_app.organization_id
     AND om.role = 'owner'
     AND u.email IS NOT NULL;

  RETURN jsonb_build_object('status','for_review','already', false);
END;
$function$;

-- 4. Set context on the approved-welcome email for consistency
CREATE OR REPLACE FUNCTION public.notify_onboarding_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient_name text;
  v_portal_url text;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') <> 'approved' THEN
    v_recipient_name := COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), ''),
      NEW.company_name,
      'there'
    );
    v_portal_url := COALESCE(
      (SELECT 'https://' || custom_domain FROM organizations WHERE id = NEW.organization_id AND custom_domain IS NOT NULL LIMIT 1),
      'https://portal.accountancyos.com'
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
