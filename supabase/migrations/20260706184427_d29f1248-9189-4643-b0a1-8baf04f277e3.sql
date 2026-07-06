ALTER TABLE public.engagement_letters
  ADD COLUMN IF NOT EXISTS signature_name text;

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

  IF v_letter.signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_signed', true, 'signed_at', v_letter.signed_at);
  END IF;

  UPDATE public.engagement_letters
     SET signed_at = now(),
         signature_name = COALESCE(signature_name, NULLIF(trim(p_signature_data->>'full_name'), '')),
         signature_user_agent = COALESCE(signature_user_agent, p_signature_data->>'user_agent'),
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = v_letter.id;

  RETURN jsonb_build_object('success', true, 'signed_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.public_sign_engagement_letter_by_token(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_sign_engagement_letter_by_token(text, jsonb) TO anon, authenticated;