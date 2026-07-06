ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_queue_idempotency_key
  ON public.email_queue (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending_claim
  ON public.email_queue (status, scheduled_at)
  WHERE status = 'pending';