UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL
  AND id IN (SELECT user_id FROM public.portal_access WHERE user_id IS NOT NULL);