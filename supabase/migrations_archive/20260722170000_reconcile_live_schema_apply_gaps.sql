-- ============================================================
-- Forward-only repair migration — live-vs-git schema reconciliation
-- ============================================================
-- Per the Database migration release contract: historical migration files are
-- NEVER edited or re-run. This new, forward-only migration re-establishes the
-- intended objects for every genuine apply-gap found by reconciling the live
-- catalog (MCP db_schema, 225 tables / 3748 columns, pulled 2026-07-22) against
-- the git migrations. Each gap below was additionally confirmed live via MCP
-- (missing columns error on select; bank_transactions has zero NULL updated_at).
-- All statements are idempotent and additive.
--
-- Gaps repaired (source intent → live state was):
--   C1  onboarding_applications.status DEFAULT  (20260620155406:23)  live still 'pending' (CHECK-invalid) → 'in_progress'
--   B1  engagement_letters 7 cols + CHECK + 2 indexes + trigger fn  (20260617113129)  entire increment absent live
--   B2  invoices.paid_at, .stripe_checkout_session_id  (20260625125504:5-6)  absent
--   B3  templates.category, .is_active(+default true)  (20260623103629:18-19)  absent
--   D1  bank_transactions.updated_at SET NOT NULL  (20260630220036:4)  live nullable (ADD COLUMN IF NOT EXISTS no-op'd)
-- Receipt: docs/releases/pending/2026-07-22-schema-apply-gap-repair.json

-- ------------------------------------------------------------
-- C1. onboarding_applications.status default realignment
--     Column still defaults to 'pending', which 20260603105927 removed from the
--     status CHECK — so any INSERT omitting status is rejected. Realign to the
--     intended 'in_progress' (20260620155406 never took effect live).
-- ------------------------------------------------------------
ALTER TABLE public.onboarding_applications
  ALTER COLUMN status SET DEFAULT 'in_progress';

-- ------------------------------------------------------------
-- B1. engagement_letters lifecycle increment (re-declares 20260617113129 intent)
--     Columns AND the companion CHECK / indexes / corrected tamper trigger, because
--     a partial apply (function replaced but columns absent, or vice-versa) is the
--     dangerous state and the inventory cannot see the non-table objects. If the
--     old trigger function is still live it references OLD.status (now re-added),
--     but the corrected function below re-keys immutability off signed_at.
-- ------------------------------------------------------------
ALTER TABLE public.engagement_letters
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS signed_by    uuid NULL,
  ADD COLUMN IF NOT EXISTS signer_name  text NULL,
  ADD COLUMN IF NOT EXISTS signer_email text NULL,
  ADD COLUMN IF NOT EXISTS version      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_id    uuid NULL REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS company_id   uuid NULL REFERENCES public.companies(id);

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

-- Corrected immutability trigger (latest effective definition, from 20260617113129).
CREATE OR REPLACE FUNCTION public.protect_engagement_letter_signatures()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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

-- One-time status backfill from existing timestamps (idempotent).
UPDATE public.engagement_letters
   SET status = 'signed'
 WHERE signed_at IS NOT NULL AND status IS DISTINCT FROM 'signed';

UPDATE public.engagement_letters
   SET status = 'sent'
 WHERE signed_at IS NULL AND sent_at IS NOT NULL AND status = 'draft';

-- ------------------------------------------------------------
-- B2. invoices — portal Stripe payment verify-on-return columns
-- ------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at                    date,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- ------------------------------------------------------------
-- B3. templates — quote-send columns (lifecycle_send_quote reads these)
-- ------------------------------------------------------------
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS category  text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ------------------------------------------------------------
-- D1. bank_transactions.updated_at — enforce NOT NULL (verified 0 NULL rows live)
-- ------------------------------------------------------------
ALTER TABLE public.bank_transactions
  ALTER COLUMN updated_at SET NOT NULL;
