DO $$
DECLARE
  v_app uuid := '6bb5670c-cfb9-4dbb-912e-e491f0d916ee';
  v_job uuid := '67ead073-4693-46ec-a56e-a35ac28082e5';
BEGIN
  DELETE FROM public.engagement_letters WHERE onboarding_application_id = v_app;
  DELETE FROM public.onboarding_documents WHERE application_id = v_app;
  DELETE FROM public.onboarding_events WHERE application_id = v_app;
  DELETE FROM public.onboarding_applications WHERE id = v_app;
  DELETE FROM public.jobs WHERE id = v_job;
END $$;