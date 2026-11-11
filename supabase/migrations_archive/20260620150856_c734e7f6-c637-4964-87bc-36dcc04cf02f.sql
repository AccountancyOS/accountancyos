-- ============================================================
-- Vocabulary-drift hardening — resolve filings.status double-constraint
-- ============================================================
-- public.filings.status carried TWO enforced CHECK constraints:
--
--   * chk_filing_status  (20260217133510) — canonical. 13 values that match the
--     `FilingStatus` TS union (src/lib/filing-service.ts) and the filing UI:
--       not_started, draft, in_progress, ready_for_review, sent_to_client,
--       client_changes_requested, awaiting_approval, approved, ready_to_file,
--       submitted, accepted, rejected, filed
--
--   * chk_filings_status (20251218231226) — STALE, a different 15-value
--     generation. It was added `NOT VALID`, but NOT VALID only skips the check
--     for pre-existing rows; it is STILL enforced on every INSERT/UPDATE.
--
-- Because both are enforced, the writeable set was their intersection —
-- only {draft, approved, submitted, accepted, filed, rejected}. So legitimate
-- app writes (awaiting_approval, ready_to_file, in_progress, ready_for_review,
-- sent_to_client, client_changes_requested, not_started) were silently rejected
-- by chk_filings_status the moment any filing existed.
--
-- Fix: drop the stale constraint, keep the canonical one.
-- Safe: dropping a CHECK constraint cannot invalidate existing rows; it only
-- widens the accepted set back to the vocabulary the app already uses. No data
-- is modified.
-- ============================================================

ALTER TABLE public.filings DROP CONSTRAINT IF EXISTS chk_filings_status;

-- Defensive: ensure the canonical constraint exists (idempotent; it is normally
-- already present from 20260217133510). Guarded so re-running is harmless.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_filing_status'
  ) THEN
    ALTER TABLE public.filings ADD CONSTRAINT chk_filing_status CHECK (
      status IN (
        'not_started', 'draft', 'in_progress',
        'ready_for_review', 'sent_to_client', 'client_changes_requested',
        'awaiting_approval', 'approved', 'ready_to_file',
        'submitted', 'accepted', 'rejected', 'filed'
      )
    );
  END IF;
END $$;
