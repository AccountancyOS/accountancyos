-- Increment B: per-person personal data columns (National Insurance number and personal SA UTR)
-- collected during onboarding.

ALTER TABLE public.company_persons
  ADD COLUMN IF NOT EXISTS nino text,
  ADD COLUMN IF NOT EXISTS utr text;
