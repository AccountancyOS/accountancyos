
-- 1. Make invite tokens URL-safe (base64url, no padding)
CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  RETURN translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/', '-_'
  );
END;
$$;

-- 2. Regenerate Churchills London Ltd's portal invite token with the new URL-safe format
DO $$
DECLARE
  v_new_token text;
  v_url text;
BEGIN
  v_new_token := public.generate_invite_token();
  v_url := 'https://client.accountancyos.com/auth/portal-invite?token=' || v_new_token;

  UPDATE public.portal_access
  SET invite_token = v_new_token,
      invite_expires_at = now() + interval '14 days',
      status = 'invited',
      updated_at = now()
  WHERE id = '58c67301-6299-46a8-a0e7-993030e863a2';

  -- 3. Re-enqueue the welcome email with the new link
  INSERT INTO public.email_queue (
    organization_id, to_email, subject, body_html,
    merge_data, status, entity_type, entity_id, scheduled_at
  ) VALUES (
    'a857a12c-a125-41de-bb45-9eb556d5b467',
    'leon5440@hotmail.com',
    'Welcome to your Blue Tick accountant client portal',
    '<p>You have been invited to access your secure client portal.</p>'
    || '<p>Click the link below to get started:</p>'
    || '<p><a href="' || v_url || '">Access your portal</a></p>',
    jsonb_build_object(
      'client_name', 'Churchills London Ltd',
      'firm_name', 'Blue Tick accountant',
      'portal_url', v_url
    ),
    'pending',
    'portal_access',
    '58c67301-6299-46a8-a0e7-993030e863a2',
    now()
  );
END $$;
