-- ============================================================
-- FUN-3 / Audit Fix: make the emailed engagement-letter signing link actually sign
-- ============================================================
-- send-engagement-letter emails a link to /engagement/{signature_token}, but that page only
-- rendered the letter read-only — there was no way to sign, and the existing sign RPC
-- (public_sign_engagement_letter) keys on the onboarding application_id + access_token, which
-- the standalone email link does not carry. So a client clicking the emailed "sign" link could
-- never sign.
--
-- This adds a token-gated sign RPC: the caller presents the letter's UNIQUE signature_token
-- (the unguessable secret from the emailed link) and a signature payload; the RPC marks that
-- specific letter signed (mirroring the fields public_sign_engagement_letter sets: signed_at,
-- signature_ip, signature_user_agent). It is idempotent (already-signed returns success) and
-- rejects unknown/expired tokens.
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_sign_engagement_letter_by_token(
  p_signature_token text,
  p_signature_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_letter record;
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

  -- Idempotent: signing again is a no-op success.
  IF v_letter.signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_signed', true, 'signed_at', v_letter.signed_at);
  END IF;

  UPDATE public.engagement_letters
     SET signed_at = now(),
         signature_ip = COALESCE(signature_ip, p_signature_data->>'ip'),
         signature_user_agent = COALESCE(signature_user_agent, p_signature_data->>'user_agent'),
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = v_letter.id;

  RETURN jsonb_build_object('success', true, 'signed_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.public_sign_engagement_letter_by_token(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_sign_engagement_letter_by_token(text, jsonb) TO anon, authenticated;
