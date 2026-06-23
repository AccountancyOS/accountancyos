-- ============================================================
-- Sprint 1 — Increment 3a / Task 5b
-- lifecycle_send_back_onboarding: carry the access token in the resume link
-- ============================================================
-- The emailed "Resume onboarding" link pointed at /onboard/<id> with no token,
-- so a client resuming via email would lose token protection. Append
-- ?token=<access_token>. Body reproduced verbatim from 20260622172622 with only
-- the resume-link line changed. v_app already loads the application row (and its
-- access_token). CREATE OR REPLACE (same signature).
-- ============================================================

CREATE OR REPLACE FUNCTION public.lifecycle_send_back_onboarding(
  p_application_id uuid,
  p_step text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding application % not found', p_application_id;
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'needs_client_action',
         updated_at = now()
   WHERE id = p_application_id;

  IF v_app.email IS NOT NULL AND v_app.email <> '' THEN
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
      '<p>Please continue here: <a href="' || COALESCE(current_setting('app.public_url', true), '') || '/onboard/' || p_application_id || '?token=' || COALESCE(v_app.access_token, '') || '">Resume onboarding</a></p>',
      'onboarding_application',
      p_application_id,
      'onboarding',
      'pending'
    );
  END IF;

  RETURN jsonb_build_object('status', 'needs_client_action');
END;
$$;
