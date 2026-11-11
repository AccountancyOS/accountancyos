ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_signature text;

COMMENT ON COLUMN public.profiles.email_signature IS
  'The staff member''s personal email signature, in plain text or simple HTML. NULL or '
  'empty means no personal signature — consumers must render nothing rather than failing '
  '(DEF-013). Practice branding and the legal footer are organisation-level settings and '
  'do not live here.';