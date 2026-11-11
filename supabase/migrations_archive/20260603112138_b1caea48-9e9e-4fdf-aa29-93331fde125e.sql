
-- ============================================================
-- Phase 2: Client Onboarding Wizard backend
-- ============================================================

-- 1. Extra columns to track billing + submission
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending'
    CHECK (billing_status IN ('pending','skipped','completed','not_required')),
  ADD COLUMN IF NOT EXISTS billing_amount numeric,
  ADD COLUMN IF NOT EXISTS billing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_email text;

-- 2. Anon storage policies for onboarding documents
-- Path layout: {organization_id}/onboarding/{application_id}/{filename}
CREATE OR REPLACE FUNCTION public.is_active_onboarding_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_org uuid;
  v_app uuid;
  v_status text;
BEGIN
  v_parts := string_to_array(p_name, '/');
  IF array_length(v_parts,1) < 4 THEN RETURN false; END IF;
  IF v_parts[2] <> 'onboarding' THEN RETURN false; END IF;
  BEGIN
    v_org := v_parts[1]::uuid;
    v_app := v_parts[3]::uuid;
  EXCEPTION WHEN others THEN RETURN false; END;
  SELECT status INTO v_status
    FROM public.onboarding_applications
   WHERE id = v_app AND organization_id = v_org;
  IF v_status IS NULL THEN RETURN false; END IF;
  RETURN v_status NOT IN ('approved','rejected','cancelled');
END;
$$;

DROP POLICY IF EXISTS "Public can upload onboarding documents" ON storage.objects;
CREATE POLICY "Public can upload onboarding documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'onboarding-documents' AND public.is_active_onboarding_path(name));

DROP POLICY IF EXISTS "Public can read own onboarding documents" ON storage.objects;
CREATE POLICY "Public can read own onboarding documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'onboarding-documents' AND public.is_active_onboarding_path(name));

-- 3. Public RPC: load the application bundle
CREATE OR REPLACE FUNCTION public.public_get_onboarding(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_app record;
  v_org record;
  v_quote record;
  v_docs jsonb;
  v_engagement record;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Onboarding application not found' USING ERRCODE='P0002'; END IF;

  SELECT id, name, logo_url INTO v_org FROM public.organizations WHERE id = v_app.organization_id;
  SELECT id, quote_number, accepted_snapshot, currency
    INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'document_type', document_type, 'file_name', file_name,
    'file_path', file_path, 'created_at', created_at
  ) ORDER BY created_at), '[]'::jsonb) INTO v_docs
    FROM public.onboarding_documents WHERE application_id = p_application_id;

  SELECT id, signed_at, sent_at INTO v_engagement
    FROM public.engagement_letters
   WHERE onboarding_application_id = p_application_id
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'application', to_jsonb(v_app),
    'organization', to_jsonb(v_org),
    'quote', to_jsonb(v_quote),
    'documents', v_docs,
    'engagement_letter', to_jsonb(v_engagement)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_get_onboarding(uuid) TO anon, authenticated;

-- 4. Public RPC: sign engagement letter (auto-generates content from snapshot)
CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter(
  p_application_id uuid,
  p_signature_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_quote record;
  v_org_name text;
  v_content text;
  v_letter_id uuid;
  v_lines text := '';
  v_line jsonb;
  v_client_name text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Onboarding is closed';
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_app.organization_id;
  SELECT accepted_snapshot, currency INTO v_quote FROM public.quotes WHERE id = v_app.quote_id;

  v_client_name := COALESCE(v_app.company_name,
    trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')));

  IF v_quote.accepted_snapshot IS NOT NULL THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote.accepted_snapshot->'lines') LOOP
      v_lines := v_lines || '<li>' || (v_line->>'service_name') ||
        ' — ' || COALESCE(v_quote.currency,'GBP') || ' ' || (v_line->>'subtotal') ||
        ' (' || COALESCE(v_line->>'billing_frequency','annual') || ')</li>';
    END LOOP;
  END IF;

  v_content := '<h1>Engagement Letter</h1>' ||
    '<p>Between <strong>' || v_org_name || '</strong> ("the Firm") and <strong>' ||
    v_client_name || '</strong> ("the Client").</p>' ||
    '<h2>Scope of Services</h2><ul>' || v_lines || '</ul>' ||
    '<h2>Fees</h2><p>Total commercial terms as per accepted proposal dated ' ||
    to_char((v_quote.accepted_snapshot->>'accepted_at')::timestamptz, 'DD Mon YYYY') || '.</p>' ||
    '<h2>Acceptance</h2><p>By signing below the Client confirms acceptance of the terms above.</p>';

  -- Upsert engagement letter
  SELECT id INTO v_letter_id FROM public.engagement_letters
   WHERE onboarding_application_id = p_application_id ORDER BY created_at DESC LIMIT 1;

  IF v_letter_id IS NULL THEN
    INSERT INTO public.engagement_letters (
      organization_id, onboarding_application_id, document_content,
      sent_at, signed_at, signature_ip, signature_user_agent
    ) VALUES (
      v_app.organization_id, p_application_id, v_content,
      now(), now(),
      p_signature_data->>'ip', p_signature_data->>'user_agent'
    ) RETURNING id INTO v_letter_id;
  ELSE
    UPDATE public.engagement_letters
       SET document_content = v_content,
           signed_at = now(),
           sent_at = COALESCE(sent_at, now()),
           signature_ip = COALESCE(signature_ip, p_signature_data->>'ip'),
           signature_user_agent = COALESCE(signature_user_agent, p_signature_data->>'user_agent'),
           updated_at = now()
     WHERE id = v_letter_id;
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'aml_pending',
         contracts_signed_at = now(),
         contracts_sent_at = COALESCE(contracts_sent_at, now()),
         signature_data = p_signature_data,
         updated_at = now()
   WHERE id = p_application_id;

  RETURN jsonb_build_object('engagement_letter_id', v_letter_id, 'status','aml_pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_sign_engagement_letter(uuid, jsonb) TO anon, authenticated;

-- 5. Public RPC: record an AML upload
CREATE OR REPLACE FUNCTION public.public_record_aml_upload(
  p_application_id uuid,
  p_document_type text,
  p_file_name text,
  p_file_path text,
  p_file_size integer,
  p_mime_type text
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

GRANT EXECUTE ON FUNCTION public.public_record_aml_upload(uuid, text, text, text, integer, text) TO anon, authenticated;

-- 6. Public RPC: billing complete / skip
CREATE OR REPLACE FUNCTION public.public_complete_billing(
  p_application_id uuid,
  p_stripe_session_id text,
  p_amount numeric
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

GRANT EXECUTE ON FUNCTION public.public_complete_billing(uuid, text, numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_skip_billing(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

GRANT EXECUTE ON FUNCTION public.public_skip_billing(uuid) TO anon, authenticated;

-- 7. Public RPC: final submission → for_review
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
  v_owner record;
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
  FOR v_owner IN
    SELECT user_id FROM public.organization_members WHERE organization_id = v_app.organization_id
  LOOP
    INSERT INTO public.notifications (
      organization_id, user_id, type, title, message, entity_type, entity_id
    ) VALUES (
      v_app.organization_id, v_owner.user_id, 'onboarding_for_review',
      'New onboarding ready for review',
      v_client_name || ' has completed onboarding and is ready for review.',
      'onboarding_application', p_application_id
    );
  END LOOP;

  -- Internal email summary (best-effort)
  BEGIN
    INSERT INTO public.email_queue (
      organization_id, to_email, to_name, subject, body_html, status, entity_type, entity_id, context
    )
    SELECT v_app.organization_id, om_email.email, om_email.full_name,
           'Onboarding ready for review: ' || v_client_name,
           '<p>' || v_client_name || ' has completed the onboarding wizard.</p>' ||
           '<p>Please review in AccountancyOS.</p>',
           'queued', 'onboarding_application', p_application_id,
           jsonb_build_object('source','onboarding_submission')
      FROM (
        SELECT p.email, p.full_name
          FROM public.organization_members om
          JOIN public.profiles p ON p.id = om.user_id
         WHERE om.organization_id = v_app.organization_id AND om.role = 'owner'
      ) om_email
     WHERE om_email.email IS NOT NULL;
  EXCEPTION WHEN others THEN
    -- Don't block submission on email failures
    NULL;
  END;

  RETURN jsonb_build_object('status','for_review');
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_submit_onboarding_for_review(uuid, text) TO anon, authenticated;
