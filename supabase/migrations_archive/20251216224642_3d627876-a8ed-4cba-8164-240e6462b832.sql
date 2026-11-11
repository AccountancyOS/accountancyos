-- Add UTR column to companies table for CT600 submissions
-- Format-only constraint (10 digits), no checksum validation at DB level

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS utr TEXT;

-- Add format-only constraint (10 digit numeric)
ALTER TABLE public.companies
DROP CONSTRAINT IF EXISTS chk_companies_utr_format;

ALTER TABLE public.companies
ADD CONSTRAINT chk_companies_utr_format 
CHECK (utr IS NULL OR utr ~ '^[0-9]{10}$');

-- Partial index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_companies_utr ON public.companies(utr) WHERE utr IS NOT NULL;

COMMENT ON COLUMN public.companies.utr IS 'Unique Taxpayer Reference (10 digits) for HMRC Corporation Tax submissions';