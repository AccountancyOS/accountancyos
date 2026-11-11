REVOKE ALL ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) TO service_role;