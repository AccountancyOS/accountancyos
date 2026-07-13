-- Preflight: ensure no duplicate in-flight idempotency keys
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT idempotency_key
    FROM public.filing_submissions
    WHERE idempotency_key IS NOT NULL
      AND status IN ('pending','submitted','accepted')
    GROUP BY idempotency_key
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Preflight failed: % duplicate in-flight idempotency_key(s) exist', dup_count;
  END IF;
END $$;

-- Partial unique index: at most one in-flight (pending/submitted/accepted) submission per idempotency_key.
-- Rejected/error/cancelled retries are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS filing_submissions_idempotency_key_inflight_uniq
  ON public.filing_submissions (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('pending','submitted','accepted');
