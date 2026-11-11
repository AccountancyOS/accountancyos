-- =====================================================================================
-- DEF-013: a staff email signature belongs to the person, on public.profiles.
-- =====================================================================================
-- /settings/my-profile read and wrote `organization_users.email_signature`. That column
-- does not exist, so every load returned SQLSTATE 42703 and every save failed. The staff
-- member could set a signature, be told it saved, and have nothing stored — and
-- engagement letters and system emails went out unsigned with no indication why.
--
-- Owner ruling, 2026-07-28: the signature lives on `profiles.email_signature`. The staff
-- member owns their personal signature; practice branding and the legal footer stay as
-- organisation-level settings. That also makes it correct by construction that one person
-- has ONE signature rather than a different one per practice membership — which is what
-- an organization_users column would have implied, and which contradicts the launch ruling
-- that one identity belongs to one practice.
--
-- NULL means "no personal signature" and must never break sending: every consumer treats
-- it as an empty string. Nothing is backfilled — there is no prior value anywhere to
-- migrate, because the column the app wrote to never existed.
--
-- Additive: one nullable column. No existing column, constraint, policy or trigger is
-- altered, and profiles' existing RLS continues to govern who may read and write it.
-- =====================================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_signature text;

COMMENT ON COLUMN public.profiles.email_signature IS
  'The staff member''s personal email signature, in plain text or simple HTML. NULL or '
  'empty means no personal signature — consumers must render nothing rather than failing '
  '(DEF-013). Practice branding and the legal footer are organisation-level settings and '
  'do not live here.';
