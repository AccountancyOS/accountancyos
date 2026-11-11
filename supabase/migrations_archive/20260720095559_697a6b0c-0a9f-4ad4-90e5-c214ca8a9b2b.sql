CREATE OR REPLACE FUNCTION public.claim_email_queue_row(
  p_email_id uuid,
  p_stale_before timestamptz
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  to_email text,
  to_name text,
  subject text,
  body_html text,
  body_text text,
  mailbox_id uuid,
  provider text,
  created_by uuid,
  attachments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_queue q
     SET claimed_at = now(),
         updated_at = now()
   WHERE q.id = p_email_id
     AND q.status = 'pending'
     AND (q.claimed_at IS NULL OR q.claimed_at < p_stale_before)
  RETURNING
     q.id,
     q.organization_id,
     q.to_email,
     q.to_name,
     q.subject,
     q.body_html,
     q.body_text,
     q.mailbox_id,
     q.provider,
     q.created_by,
     q.attachments;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) TO service_role;