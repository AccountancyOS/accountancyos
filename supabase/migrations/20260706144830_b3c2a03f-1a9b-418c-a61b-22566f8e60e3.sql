-- ============================================================
-- FUN-4 / Audit Fix 10: email-queue idempotency + atomic claim (additive)
-- ============================================================
-- Two producer-side / worker-side gaps caused duplicate client emails:
--   (1) No producer set an idempotency_key and there was no uniqueness backstop, so a
--       double-click / retry queued the same email twice.
--   (2) The worker's email_queue drain SELECTs status='pending' rows but never *claims* them
--       before sending, so two overlapping cron runs (every ~5s) both send the same row.
--
-- This migration is purely additive and changes NO lifecycle/job/deadline behaviour:
--   * claimed_at: lets the worker atomically claim a row (UPDATE ... WHERE status='pending'
--     AND claim-free RETURNING) instead of changing the status CHECK constraint. A stale
--     claim (worker crashed mid-send) is reclaimable after a timeout.
--   * a PARTIAL unique index on idempotency_key (only where non-null) so duplicate keyed rows
--     cannot be created. Existing rows have a NULL key and are unaffected; unkeyed producers
--     keep working exactly as before (NULLs never conflict).
-- ============================================================

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Backstop: at most one queue row per idempotent event. Producers set a deterministic key and
-- insert with ON CONFLICT DO NOTHING; genuinely distinct events (separate scheduled chasers,
-- deliberate resends) use distinct keys and are never blocked. A plain unique index treats
-- NULLs as distinct, so the many existing/unkeyed rows (idempotency_key IS NULL) are unaffected
-- while non-null keys are unique. (Full — not partial — so it is a valid ON CONFLICT target.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_queue_idempotency_key
  ON public.email_queue (idempotency_key);

-- Helps the claim scan skip already-claimed rows efficiently.
CREATE INDEX IF NOT EXISTS idx_email_queue_pending_claim
  ON public.email_queue (status, scheduled_at)
  WHERE status = 'pending';
