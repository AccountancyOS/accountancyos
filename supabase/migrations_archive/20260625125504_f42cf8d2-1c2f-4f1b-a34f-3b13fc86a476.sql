-- Portal invoice payments: ensure the columns the verify-on-return function writes
-- exist on public.invoices. Idempotent — no-op if already present (paid_at usually
-- exists as DATE; stripe_checkout_session_id is new).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
