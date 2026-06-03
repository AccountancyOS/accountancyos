CREATE OR REPLACE FUNCTION public.public_submit_onboarding_for_review(
  p_application_id uuid,
  p_portal_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')));

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

  -- Internal email summary to owners (best-effort)
  BEGIN
    INSERT INTO public.email_queue (
      organization_id, to_email, to_name, subject, body_html, status, entity_type, entity_id, context
    )
    SELECT v_app.organization_id,
           u.email,
           COALESCE(u.raw_user_meta_data->>'full_name', u.email),
           'Onboarding ready for review: ' || v_client_name,
           '<p>' || v_client_name || ' has completed the onboarding wizard.</p>' ||
           '<p>Please review in AccountancyOS.</p>',
           'queued', 'onboarding_application', p_application_id,
           jsonb_build_object('source','onboarding_submission')
      FROM public.organization_users om
      JOIN auth.users u ON u.id = om.user_id
     WHERE om.organization_id = v_app.organization_id
       AND om.role = 'owner'
       AND u.email IS NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN jsonb_build_object('status','for_review');
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_submit_onboarding_for_review(uuid, text) TO anon, authenticated;