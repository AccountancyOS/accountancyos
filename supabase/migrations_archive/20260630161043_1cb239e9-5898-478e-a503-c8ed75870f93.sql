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

  IF (p_client_id IS NULL) = (p_company_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of client or company';
  END IF;

  IF NOT public.client_has_portal_access(auth.uid(), p_client_id, p_company_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

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

DROP POLICY IF EXISTS "Portal clients can view their receipt files" ON storage.objects;
CREATE POLICY "Portal clients can view their receipt files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.file_path = storage.objects.name
      AND (
        public.portal_has_perm(r.client_id, r.company_id, 'allow_receipt_upload')
        OR public.portal_can_access_bookkeeping(r.client_id, r.company_id)
      )
  )
);