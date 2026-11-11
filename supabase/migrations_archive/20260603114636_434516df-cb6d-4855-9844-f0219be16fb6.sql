
-- Phase 3: Accountant-side review automation

-- 1. Trigger to notify org members when application enters "for_review"
CREATE OR REPLACE FUNCTION public.notify_onboarding_for_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_label TEXT;
BEGIN
  IF NEW.status = 'for_review' AND (OLD.status IS DISTINCT FROM 'for_review') THEN
    v_label := COALESCE(
      NEW.company_name,
      NULLIF(TRIM(COALESCE(NEW.first_name,'') || ' ' || COALESCE(NEW.last_name,'')), ''),
      NEW.email,
      'New onboarding'
    );

    FOR v_member IN
      SELECT user_id FROM public.organization_members
      WHERE organization_id = NEW.organization_id
    LOOP
      INSERT INTO public.notifications (
        organization_id, user_id, type, title, message, entity_type, entity_id, payload
      ) VALUES (
        NEW.organization_id,
        v_member.user_id,
        'onboarding_for_review',
        'Onboarding ready for review',
        v_label || ' has completed onboarding and is ready for your review.',
        'onboarding_application',
        NEW.id,
        jsonb_build_object('application_id', NEW.id, 'recipient', v_label)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_onboarding_for_review ON public.onboarding_applications;
CREATE TRIGGER trg_notify_onboarding_for_review
AFTER UPDATE OF status ON public.onboarding_applications
FOR EACH ROW
EXECUTE FUNCTION public.notify_onboarding_for_review();

-- 2. Add review feedback column for "send back to client" reason
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS review_feedback TEXT,
  ADD COLUMN IF NOT EXISTS sent_back_at TIMESTAMPTZ;

-- 3. RPC for accountant to send application back to client
CREATE OR REPLACE FUNCTION public.lifecycle_send_back_onboarding(
  p_application_id UUID,
  p_step TEXT,
  p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications
  WHERE id = p_application_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT public.user_has_organization_access(v_app.organization_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_new_status := CASE p_step
    WHEN 'engagement' THEN 'engagement_pending'
    WHEN 'aml' THEN 'aml_pending'
    WHEN 'billing' THEN 'billing_pending'
    WHEN 'portal' THEN 'portal_pending'
    ELSE 'needs_client_action'
  END;

  UPDATE public.onboarding_applications
  SET status = v_new_status,
      review_feedback = p_reason,
      sent_back_at = now(),
      updated_at = now()
  WHERE id = p_application_id;

  -- Queue email to client
  IF v_app.email IS NOT NULL THEN
    INSERT INTO public.email_queue (
      organization_id, to_email, to_name, subject, body_html,
      entity_type, entity_id, context, status
    ) VALUES (
      v_app.organization_id,
      v_app.email,
      COALESCE(v_app.company_name, TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,''))),
      'Action required to complete your onboarding',
      '<p>Hello,</p><p>Your accountant has reviewed your onboarding and needs you to revisit the <strong>' || p_step || '</strong> step.</p>' ||
      CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN '<p><em>' || p_reason || '</em></p>' ELSE '' END ||
      '<p>Please continue here: <a href="' || COALESCE(current_setting('app.public_url', true), '') || '/onboard/' || p_application_id || '">Resume onboarding</a></p>',
      'onboarding_application',
      p_application_id,
      'onboarding_send_back',
      'queued'
    );
  END IF;

  RETURN jsonb_build_object('status', v_new_status, 'sent_back_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.lifecycle_send_back_onboarding(UUID, TEXT, TEXT) TO authenticated;
