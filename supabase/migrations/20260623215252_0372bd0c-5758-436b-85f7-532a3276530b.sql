-- ============================================================
-- Sprint 1 — Increment 3a / Task 3
-- AML/billing/submit onboarding RPCs gain OPTIONAL access token (validate-if-present)
-- ============================================================
-- public_record_aml_upload / public_skip_billing / public_complete_billing /
-- public_submit_onboarding_for_review: add a trailing p_access_token text DEFAULT
-- NULL. Token supplied => must be valid (else reject); NULL => unchanged (legacy).
-- DROP+CREATE (signature change); bodies verbatim from 20260603112138 /
-- 20260603143837 + the validation block only (diff-verified); fresh GRANTs.
-- Backward-compatible: no caller sends a token until the frontend (Task 5) does.
-- ============================================================

DROP FUNCTION IF EXISTS public.public_record_aml_upload(uuid, text, text, text, integer, text);
CREATE OR REPLACE FUNCTION public.public_record_aml_upload(
  p_application_id uuid,
  p_document_type text,
  p_file_name text,
  p_file_path text,
  p_file_size integer,
  p_mime_type text,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_has_id boolean;
  v_has_poa boolean;
  v_next_status text;
BEGIN
  IF p_document_type NOT IN ('id','proof_of_address','incorporation_cert','other') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;

  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  INSERT INTO public.onboarding_documents (
    organization_id, application_id, document_type, file_name, file_path, file_size, mime_type
  ) VALUES (
    v_app.organization_id, p_application_id, p_document_type, p_file_name, p_file_path, p_file_size, p_mime_type
  );

  v_has_id := v_app.id_document_uploaded OR p_document_type = 'id';
  v_has_poa := v_app.proof_of_address_uploaded OR p_document_type = 'proof_of_address';

  v_next_status := v_app.status;
  IF v_has_id AND v_has_poa AND v_app.status IN ('engagement_pending','aml_pending') THEN
    v_next_status := 'billing_pending';
  END IF;

  UPDATE public.onboarding_applications
     SET id_document_uploaded = v_has_id,
         proof_of_address_uploaded = v_has_poa,
         additional_documents_uploaded = CASE WHEN p_document_type IN ('incorporation_cert','other')
                                              THEN true ELSE additional_documents_uploaded END,
         aml_submitted_at = COALESCE(aml_submitted_at,
                                     CASE WHEN v_has_id AND v_has_poa THEN now() ELSE NULL END),
         status = v_next_status,
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('status', v_next_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_record_aml_upload(uuid, text, text, text, integer, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.public_skip_billing(uuid);
CREATE OR REPLACE FUNCTION public.public_skip_billing(p_application_id uuid, p_access_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;
  UPDATE public.onboarding_applications
     SET billing_status = 'skipped',
         status = CASE WHEN status IN ('billing_pending','aml_pending','engagement_pending')
                       THEN 'portal_pending' ELSE status END,
         updated_at = now()
   WHERE id = p_application_id
     AND status NOT IN ('approved','rejected','cancelled');
  RETURN jsonb_build_object('status','portal_pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_skip_billing(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.public_complete_billing(uuid, text, numeric);
CREATE OR REPLACE FUNCTION public.public_complete_billing(
  p_application_id uuid,
  p_stripe_session_id text,
  p_amount numeric,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;

  UPDATE public.onboarding_applications
     SET billing_status = 'completed',
         billing_amount = COALESCE(p_amount, billing_amount),
         stripe_checkout_session_id = COALESCE(p_stripe_session_id, stripe_checkout_session_id),
         billing_completed_at = now(),
         status = CASE WHEN status IN ('billing_pending','aml_pending','engagement_pending')
                       THEN 'portal_pending' ELSE status END,
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('status','portal_pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_complete_billing(uuid, text, numeric, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.public_submit_onboarding_for_review(uuid, text);
CREATE OR REPLACE FUNCTION public.public_submit_onboarding_for_review(
  p_application_id uuid,
  p_portal_email text,
  p_access_token text DEFAULT NULL
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
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;
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
GRANT EXECUTE ON FUNCTION public.public_submit_onboarding_for_review(uuid, text, text) TO anon, authenticated;
