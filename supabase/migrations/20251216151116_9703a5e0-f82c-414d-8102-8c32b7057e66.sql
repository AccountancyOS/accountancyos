-- Add missing HMRC CT600 polling columns to filings table
ALTER TABLE public.filings 
ADD COLUMN IF NOT EXISTS poll_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hmrc_correlation_id TEXT;

-- Add index for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_filings_hmrc_polling 
ON public.filings (status, hmrc_correlation_id) 
WHERE filing_type = 'CT600' AND status IN ('submitted', 'polling');