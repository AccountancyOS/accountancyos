CREATE OR REPLACE FUNCTION public.enqueue_unsubscribe_token(p_org_id uuid, p_email text, p_category text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO email_unsubscribe_tokens(organization_id, email, token, category)
  VALUES (p_org_id, p_email, v_token, p_category);
  RETURN v_token;
END;$$;