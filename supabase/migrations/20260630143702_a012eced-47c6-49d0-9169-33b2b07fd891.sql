-- ============================================================
-- Portal messaging fix — create the missing portal_send_message RPC
-- ============================================================
-- The portal (sendPortalMessage) calls public.portal_send_message, which was never
-- created, so every client message threw "function does not exist". This adds it:
-- authorises the caller via client_has_portal_access, resolves the org from the entity,
-- and inserts a client_messages row with the valid vocabulary (sender_type 'client',
-- visibility 'client_visible'). Returns the new message id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_send_message(
  p_client_id uuid,
  p_company_id uuid,
  p_body text,
  p_subject text DEFAULT NULL,
  p_parent_message_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_id  uuid;
BEGIN
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  -- client_messages requires exactly one of client_id / company_id.
  IF (p_client_id IS NULL) = (p_company_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of client or company';
  END IF;

  -- Authorise: the caller must have portal access to this entity.
  IF NOT public.client_has_portal_access(auth.uid(), p_client_id, p_company_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- Resolve the organisation from the entity (portal users don't pass it).
  IF p_client_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.companies WHERE id = p_company_id;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Entity not found';
  END IF;

  INSERT INTO public.client_messages (
    organization_id, client_id, company_id, sender_id, sender_type,
    message_type, visibility, content, subject, parent_message_id
  ) VALUES (
    v_org, p_client_id, p_company_id, auth.uid(), 'client',
    'message', 'client_visible', btrim(p_body), p_subject, p_parent_message_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_send_message(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_send_message(uuid, uuid, text, text, uuid) TO authenticated;
