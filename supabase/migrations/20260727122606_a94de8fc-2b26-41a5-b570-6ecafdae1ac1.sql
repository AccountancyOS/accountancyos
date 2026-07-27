-- =====================================================================================
-- Proposal Phase 2 T2d-2 — the per-signatory signing protocol.
-- =====================================================================================

-- (A) Public read for the signing page --------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_get_engagement_letter_for_signing(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uuid     uuid;
  v_sig      public.engagement_letter_signatories%ROWTYPE;
  v_letter   public.engagement_letters%ROWTYPE;
  v_org_name text;
  v_progress jsonb;
  v_expired  boolean;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN jsonb_build_object('found', false, 'error', 'Missing signing token');
  END IF;

  -- A signatory token is a uuid; a letter token is free text. A non-uuid string simply
  -- means "this can only be a letter token".
  BEGIN
    v_uuid := trim(p_token)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_uuid := NULL;
  END;

  IF v_uuid IS NOT NULL THEN
    SELECT * INTO v_sig
      FROM public.engagement_letter_signatories
     WHERE signature_token = v_uuid;
  END IF;

  IF v_sig.id IS NOT NULL THEN
    SELECT * INTO v_letter FROM public.engagement_letters WHERE id = v_sig.engagement_letter_id;
  ELSE
    SELECT * INTO v_letter FROM public.engagement_letters WHERE signature_token = trim(p_token);
  END IF;

  IF v_letter.id IS NULL THEN
    RETURN jsonb_build_object('found', false,
      'error', 'This engagement letter link is invalid or has expired.');
  END IF;

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_org_name
    FROM public.organizations o
    LEFT JOIN public.organization_branding ob ON ob.organization_id = o.id
   WHERE o.id = v_letter.organization_id;

  v_progress := public.el_signature_progress(v_letter.id);
  v_expired  := (v_letter.token_expires_at IS NOT NULL AND v_letter.token_expires_at < now());

  RETURN jsonb_build_object(
    'found', true,
    'firm_name', COALESCE(v_org_name, 'Your Accountant'),
    'letter', jsonb_build_object(
      'id',             v_letter.id,
      'document_content', v_letter.document_content,
      'status',         v_letter.status,
      'signing_rule',   COALESCE(v_letter.signing_rule, 'all'),
      'signed_at',      v_letter.signed_at,
      'expired',        v_expired
    ),
    'signer', CASE WHEN v_sig.id IS NULL THEN NULL ELSE jsonb_build_object(
      'kind',         'signatory',
      'signatory_id', v_sig.id,
      'name',         v_sig.signer_name,
      'email',        v_sig.signer_email,
      'required',     v_sig.required,
      'signed_at',    v_sig.signed_at
    ) END,
    'progress', v_progress,
    'requires_personal_link', (
      v_sig.id IS NULL AND COALESCE((v_progress->>'has_signatories')::boolean, false)
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.public_get_engagement_letter_for_signing(text) IS
  'Public (anon) read for the engagement-letter signing page. Resolves a per-signatory '
  'token or the letter-level token. Exists because engagement_letters has RLS with no '
  'anon SELECT policy — the page must never query that table directly.';

-- (B) Per-signatory signature ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter_as_signatory(
  p_token          text,
  p_signature_data jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uuid       uuid;
  v_sig        public.engagement_letter_signatories%ROWTYPE;
  v_letter     public.engagement_letters%ROWTYPE;
  v_app        public.onboarding_applications%ROWTYPE;
  v_name       text;
  v_progress   jsonb;
  v_satisfied  boolean;
  v_status     text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing signing token');
  END IF;

  BEGIN
    v_uuid := trim(p_token)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This signing link is not valid.');
  END;

  -- Lock signatory then letter then application — always in that order, so two
  -- signatories of the same letter signing at the same moment serialise instead of
  -- deadlocking.
  SELECT * INTO v_sig
    FROM public.engagement_letter_signatories
   WHERE signature_token = v_uuid
   FOR UPDATE;

  IF v_sig.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This signing link is not valid.');
  END IF;

  SELECT * INTO v_letter
    FROM public.engagement_letters
   WHERE id = v_sig.engagement_letter_id
   FOR UPDATE;

  IF v_letter.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This signing link is not valid.');
  END IF;

  -- Idempotent: re-opening the emailed link and signing again is a no-op success, never
  -- a second signature.
  IF v_sig.signed_at IS NOT NULL THEN
    v_progress := public.el_signature_progress(v_letter.id);
    RETURN jsonb_build_object(
      'success', true, 'already_signed', true, 'signed_at', v_sig.signed_at,
      'all_signed', COALESCE((v_progress->>'satisfied')::boolean, false),
      'progress', v_progress, 'letter_status', v_letter.status
    );
  END IF;

  IF v_letter.token_expires_at IS NOT NULL AND v_letter.token_expires_at < now() THEN
    RETURN jsonb_build_object('success', false,
      'error', 'This signing link has expired. Please ask your accountant to resend it.');
  END IF;

  SELECT * INTO v_app
    FROM public.onboarding_applications
   WHERE id = COALESCE(v_sig.onboarding_application_id, v_letter.onboarding_application_id)
   FOR UPDATE;

  IF v_app.id IS NOT NULL AND v_app.status IN ('approved','rejected','cancelled') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'This engagement is no longer open for signature. Please contact your accountant.');
  END IF;

  v_name := COALESCE(NULLIF(trim(p_signature_data->>'full_name'), ''), v_sig.signer_name);

  UPDATE public.engagement_letter_signatories
     SET signed_at            = now(),
         signer_name          = v_name,
         signature_ip         = p_signature_data->>'ip',
         signature_user_agent = p_signature_data->>'user_agent'
   WHERE id = v_sig.id;

  -- The rule lives in ONE place (T2d-1) — the same function the activation gate calls.
  v_progress  := public.el_signature_progress(v_letter.id);
  v_satisfied := COALESCE((v_progress->>'satisfied')::boolean, false);

  IF v_satisfied THEN
    UPDATE public.engagement_letters
       SET signed_at            = COALESCE(signed_at, now()),
           status               = 'signed',
           signature_name       = COALESCE(signature_name, v_name),
           signature_ip         = COALESCE(signature_ip, p_signature_data->>'ip'),
           signature_user_agent = COALESCE(signature_user_agent, p_signature_data->>'user_agent'),
           viewed_at            = COALESCE(viewed_at, now()),
           updated_at           = now()
     WHERE id = v_letter.id;

    -- The application-side write the emailed-link path has always been missing.
    IF v_app.id IS NOT NULL THEN
      UPDATE public.onboarding_applications
         SET contracts_signed_at = COALESCE(contracts_signed_at, now()),
             contracts_sent_at   = COALESCE(contracts_sent_at, now()),
             signature_data      = COALESCE(signature_data, p_signature_data),
             status = CASE
               WHEN status IN ('draft','in_progress','engagement_pending') THEN 'aml_pending'
               ELSE status
             END,
             updated_at = now()
       WHERE id = v_app.id;
    END IF;
  ELSE
    UPDATE public.engagement_letters
       SET status     = CASE WHEN status = 'signed' THEN 'signed' ELSE 'partially_signed' END,
           viewed_at  = COALESCE(viewed_at, now()),
           updated_at = now()
     WHERE id = v_letter.id;
  END IF;

  SELECT status INTO v_status FROM public.engagement_letters WHERE id = v_letter.id;

  RETURN jsonb_build_object(
    'success', true, 'signed_at', now(), 'all_signed', v_satisfied,
    'progress', v_progress, 'letter_status', v_status
  );
END;
$function$;

COMMENT ON FUNCTION public.public_sign_engagement_letter_as_signatory(text, jsonb) IS
  'Records ONE signatory''s signature from their own emailed link, then evaluates the '
  'signing rule via el_signature_progress: letter status becomes partially_signed until '
  'the rule is satisfied, then signed + onboarding contracts_signed_at. Idempotent.';

-- (C) Re-issue the legacy letter-level sign path -----------------------------------------
CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter_by_token(
  p_signature_token text,
  p_signature_data  jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_letter   record;
  v_progress jsonb;
BEGIN
  IF p_signature_token IS NULL OR length(trim(p_signature_token)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing signing token');
  END IF;

  SELECT * INTO v_letter
    FROM public.engagement_letters
   WHERE signature_token = p_signature_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This signing link is not valid.');
  END IF;

  IF v_letter.token_expires_at IS NOT NULL AND v_letter.token_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This signing link has expired. Please ask your accountant to resend it.');
  END IF;

  IF v_letter.signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_signed', true, 'signed_at', v_letter.signed_at);
  END IF;

  -- T2d-2 (1): per-signatory letters must be signed through each signatory's own link.
  v_progress := public.el_signature_progress(v_letter.id);
  IF COALESCE((v_progress->>'has_signatories')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'requires_personal_link', true,
      'error', 'This engagement letter is signed by each signatory using the personal link emailed to them. Please use your own link, or ask your accountant to resend it.');
  END IF;

  UPDATE public.engagement_letters
     SET signed_at = now(),
         signature_name = COALESCE(signature_name, NULLIF(trim(p_signature_data->>'full_name'), '')),
         signature_user_agent = COALESCE(signature_user_agent, p_signature_data->>'user_agent'),
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = v_letter.id;

  -- T2d-2 (2): the application-side write this path always omitted.
  UPDATE public.engagement_letters
     SET status = 'signed', updated_at = now()
   WHERE id = v_letter.id;

  UPDATE public.onboarding_applications
     SET contracts_signed_at = COALESCE(contracts_signed_at, now()),
         contracts_sent_at   = COALESCE(contracts_sent_at, now()),
         signature_data      = COALESCE(signature_data, p_signature_data),
         status = CASE
           WHEN status IN ('draft','in_progress','engagement_pending') THEN 'aml_pending'
           ELSE status
         END,
         updated_at = now()
   WHERE id = v_letter.onboarding_application_id
     AND status NOT IN ('approved','rejected','cancelled');

  RETURN jsonb_build_object('success', true, 'signed_at', now());
END;
$function$;

-- Grants: same surface as the existing public signing/onboarding RPCs.
GRANT EXECUTE ON FUNCTION public.public_get_engagement_letter_for_signing(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_sign_engagement_letter_as_signatory(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_sign_engagement_letter_by_token(text, jsonb) TO anon, authenticated;