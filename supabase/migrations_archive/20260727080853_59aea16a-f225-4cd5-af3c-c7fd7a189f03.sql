ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS signatory_snapshot jsonb;