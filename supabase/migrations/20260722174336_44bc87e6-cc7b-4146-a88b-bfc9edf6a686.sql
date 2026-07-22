CREATE OR REPLACE FUNCTION public.gen_onboarding_access_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS access_token            text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;

UPDATE public.onboarding_applications
   SET access_token = public.gen_onboarding_access_token()
 WHERE access_token IS NULL;

UPDATE public.onboarding_applications
   SET access_token_expires_at = now() + interval '90 days'
 WHERE access_token_expires_at IS NULL;

ALTER TABLE public.onboarding_applications
  ALTER COLUMN access_token SET DEFAULT public.gen_onboarding_access_token(),
  ALTER COLUMN access_token SET NOT NULL;

ALTER TABLE public.onboarding_applications
  ALTER COLUMN access_token_expires_at SET DEFAULT (now() + interval '90 days');

CREATE OR REPLACE FUNCTION public.ensure_onboarding_access_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.access_token IS NULL THEN
    NEW.access_token := public.gen_onboarding_access_token();
  END IF;
  IF NEW.access_token_expires_at IS NULL THEN
    NEW.access_token_expires_at := now() + interval '90 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_onboarding_access_token ON public.onboarding_applications;
CREATE TRIGGER trg_ensure_onboarding_access_token
  BEFORE INSERT ON public.onboarding_applications
  FOR EACH ROW EXECUTE FUNCTION public.ensure_onboarding_access_token();

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_applications_access_token_key
  ON public.onboarding_applications (access_token);