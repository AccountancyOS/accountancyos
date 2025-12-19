-- Fix: Use _hash_token helper instead of extensions.digest directly
-- This removes the schema dependency

CREATE OR REPLACE FUNCTION public.create_questionnaire_public_link(
  p_instance_id UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID := auth.uid();
  v_token TEXT;
  v_hash TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.questionnaire_instances
  WHERE id = p_instance_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Questionnaire not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = v_user_id
      AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Generate secure random token (48 hex chars = 24 bytes)
  v_token := encode(gen_random_bytes(24), 'hex');
  -- Use the helper function for hashing
  v_hash := public._hash_token(v_token);

  -- Revoke any existing non-revoked links for this instance
  UPDATE public.questionnaire_public_links
  SET revoked_at = now()
  WHERE questionnaire_instance_id = p_instance_id
    AND revoked_at IS NULL;

  INSERT INTO public.questionnaire_public_links(questionnaire_instance_id, token_hash, expires_at)
  VALUES (p_instance_id, v_hash, p_expires_at);

  -- Update instance status to 'sent' if it was draft
  UPDATE public.questionnaire_instances
  SET status = 'sent'
  WHERE id = p_instance_id AND status = 'draft';

  -- Return raw token ONCE to caller to build URL; never store raw token
  RETURN jsonb_build_object(
    'instance_id', p_instance_id,
    'token', v_token,
    'expires_at', p_expires_at
  );
END;
$$;