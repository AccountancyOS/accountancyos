-- 1. Drop the existing CHECK constraint so we can backfill freely
ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_context_check;

-- 2. Backfill existing rows to the new vocabulary
UPDATE public.email_queue SET context = 'job'     WHERE context IN ('chase', 'filing');
UPDATE public.email_queue SET context = 'general' WHERE context IN ('ad-hoc', 'portal');

-- 3. Add the new CHECK constraint
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_context_check
  CHECK (context = ANY (ARRAY['quote','onboarding','engagement','job','invoice','system','general']));

-- 4. Fix lifecycle_send_back_onboarding to use a valid context ('onboarding')
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
      '<p>Please continue here: <a href="' || COALESCE(current_setting('app.public_url', true), '') || '/onboard/' || p_application_id || '">Resume onboarding</a></p>',
      'onboarding_application',
      p_application_id,
      'onboarding',
      'pending'
    );
  END IF;

  RETURN jsonb_build_object('status', 'needs_client_action');
END;
$$;

-- 5. Fix trigger_records_request to use a valid context ('job')
CREATE OR REPLACE FUNCTION public.trigger_records_request(
  p_job_id uuid,
  p_questionnaire_template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_questionnaire_instance_id uuid;
  v_access_token text;
  v_client_email text;
  v_client_name text;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;

  SELECT COALESCE(c.email, co.email),
         COALESCE(TRIM(c.first_name || ' ' || c.last_name), co.company_name)
    INTO v_client_email, v_client_name
    FROM public.jobs j
    LEFT JOIN public.clients   c  ON c.id  = j.client_id
    LEFT JOIN public.companies co ON co.id = j.company_id
   WHERE j.id = p_job_id;

  IF v_client_email IS NULL OR v_client_email = '' THEN
    RAISE EXCEPTION 'No client email on job %', p_job_id;
  END IF;

  v_access_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.questionnaire_instances (
    organization_id, template_id, job_id, client_id, company_id,
    status, access_token, expires_at
  ) VALUES (
    v_job.organization_id, p_questionnaire_template_id, p_job_id, v_job.client_id, v_job.company_id,
    'sent', v_access_token, now() + interval '30 days'
  ) RETURNING id INTO v_questionnaire_instance_id;

  INSERT INTO public.email_queue (
    organization_id,
    to_email,
    to_name,
    subject,
    body_html,
    status,
    entity_type,
    entity_id,
    job_id,
    client_id,
    company_id,
    context,
    merge_data
  ) VALUES (
    v_job.organization_id,
    v_client_email,
    v_client_name,
    'Information Request: ' || v_job.name,
    '<p>Dear ' || v_client_name || ',</p>' ||
    '<p>We need some information from you to complete your ' || v_job.name || '.</p>' ||
    '<p>Please click the link below to provide the required information:</p>' ||
    '<p><a href="{{questionnaire_url}}">Complete Information Request</a></p>' ||
    '<p>This link will expire in 30 days.</p>',
    'pending',
    'questionnaire',
    v_questionnaire_instance_id,
    p_job_id,
    v_job.client_id,
    v_job.company_id,
    'job',
    jsonb_build_object(
      'questionnaire_url', '{{BASE_URL}}/questionnaire/' || v_access_token,
      'job_name', v_job.name,
      'client_name', v_client_name
    )
  );

  RETURN jsonb_build_object('status', 'sent', 'questionnaire_instance_id', v_questionnaire_instance_id);
END;
$$;