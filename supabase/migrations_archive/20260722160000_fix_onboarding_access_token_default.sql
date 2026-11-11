-- Fix: onboarding_applications.access_token is NULL on live rows (incl. newly
-- created ones), so public_get_quote_by_token returns a null onboarding_access_token,
-- the client is navigated to a tokenless /onboard/:id, and the (now strict)
-- lifecycle_require_onboarding_token guard raises "Invalid or missing onboarding
-- access token" — blocking every client from onboarding after accepting a quote.
--
-- Root cause: migration 20260617114623 (which adds the token, its DEFAULT, NOT NULL,
-- and a backfill) never took full effect on the live DB — the column exists but has
-- no DEFAULT, so lazily-created onboarding rows get access_token = NULL. Live evidence:
-- an onboarding_applications row created 2026-07-22 17:21 had access_token IS NULL and
-- access_token_expires_at IS NULL.
--
-- This migration re-establishes the invariant idempotently: ensure the generator
-- exists, backfill every row still missing a token/expiry, then (re)assert the
-- DEFAULT + NOT NULL so all future rows always carry a token. Additive and safe to
-- run even where parts already exist.

-- 1. Token generator (idempotent; exact mirror of 20260617114623).
CREATE OR REPLACE FUNCTION public.gen_onboarding_access_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- 2. Columns (no-op if present).
ALTER TABLE public.onboarding_applications
  ADD COLUMN IF NOT EXISTS access_token            text,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;

-- 3. Backfill any row still missing a token/expiry (unique secret per row; the
--    volatile generator is evaluated per row). Unblocks in-flight onboardings.
UPDATE public.onboarding_applications
   SET access_token = public.gen_onboarding_access_token()
 WHERE access_token IS NULL;

UPDATE public.onboarding_applications
   SET access_token_expires_at = now() + interval '90 days'
 WHERE access_token_expires_at IS NULL;

-- 4. (Re)assert the invariants so every future insert gets a token by default.
ALTER TABLE public.onboarding_applications
  ALTER COLUMN access_token SET DEFAULT public.gen_onboarding_access_token(),
  ALTER COLUMN access_token SET NOT NULL;

ALTER TABLE public.onboarding_applications
  ALTER COLUMN access_token_expires_at SET DEFAULT (now() + interval '90 days');

-- 5. Belt-and-braces: a BEFORE INSERT trigger that guarantees a token even if the
--    column DEFAULT is ever lost again (it silently was — a column DEFAULT can be
--    dropped by a later column redefinition, a trigger is harder to lose). This is
--    the durable safety net for the invariant, not a replacement for the default.
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

-- 6. Uniqueness (no-op if present).
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_applications_access_token_key
  ON public.onboarding_applications (access_token);
