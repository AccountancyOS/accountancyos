-- ============================================================
-- Sprint 1 — Increment 2
-- Engagement-letter lifecycle schema (additive) + tamper-trigger fix
-- ============================================================
-- Scope: engagement_letters only. Adds lifecycle/signer/version/linkage
-- columns and repairs the broken immutability trigger. No changes to
-- quote acceptance, activation, services, jobs, deadlines or RPC bodies.
-- All changes are additive and safe for existing data (new columns are
-- nullable or defaulted; no drops; no rewrites of existing rows beyond a
-- one-time status backfill derived from existing timestamps).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Additive lifecycle columns on engagement_letters
-- ------------------------------------------------------------
ALTER TABLE public.engagement_letters
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS signed_by    uuid NULL,
  ADD COLUMN IF NOT EXISTS signer_name  text NULL,
  ADD COLUMN IF NOT EXISTS signer_email text NULL,
  ADD COLUMN IF NOT EXISTS version       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_id    uuid NULL REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS company_id   uuid NULL REFERENCES public.companies(id);

-- Allowed status values (draft -> sent -> signed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engagement_letters_status_check'
  ) THEN
    ALTER TABLE public.engagement_letters
      ADD CONSTRAINT engagement_letters_status_check
      CHECK (status IN ('draft', 'sent', 'signed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_engagement_letters_status
  ON public.engagement_letters (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_engagement_letters_client_company
  ON public.engagement_letters (client_id, company_id);

-- ------------------------------------------------------------
-- 2. Fix the broken tamper-protection trigger
--    Old function referenced OLD.status / OLD.signature_data, neither of
--    which exist on engagement_letters, so EVERY UPDATE raised
--    'record "old" has no field "status"'. Re-key immutability off the
--    real signed_at column and existing/added signature columns.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_engagement_letter_signatures()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Once an engagement letter has been signed, its signature/legal fields
  -- are immutable. Non-signature fields (e.g. status, viewed_at) may change.
  IF OLD.signed_at IS NOT NULL AND (
       OLD.signed_at            IS DISTINCT FROM NEW.signed_at OR
       OLD.signature_ip         IS DISTINCT FROM NEW.signature_ip OR
       OLD.signature_user_agent IS DISTINCT FROM NEW.signature_user_agent OR
       OLD.signed_by            IS DISTINCT FROM NEW.signed_by OR
       OLD.signer_name          IS DISTINCT FROM NEW.signer_name OR
       OLD.signer_email         IS DISTINCT FROM NEW.signer_email OR
       OLD.document_content     IS DISTINCT FROM NEW.document_content
  ) THEN
    RAISE EXCEPTION 'Cannot modify signature fields on a signed engagement letter';
  END IF;
  RETURN NEW;
END;
$$;

-- The existing BEFORE UPDATE trigger (protect_engagement_signatures) is
-- rebound to the corrected function automatically by CREATE OR REPLACE.

-- ------------------------------------------------------------
-- 3. One-time backfill of status from existing timestamps
--    (changes only the new status column; trigger above permits it)
-- ------------------------------------------------------------
UPDATE public.engagement_letters
   SET status = 'signed'
 WHERE signed_at IS NOT NULL
   AND status IS DISTINCT FROM 'signed';

UPDATE public.engagement_letters
   SET status = 'sent'
 WHERE signed_at IS NULL
   AND sent_at IS NOT NULL
   AND status = 'draft';
