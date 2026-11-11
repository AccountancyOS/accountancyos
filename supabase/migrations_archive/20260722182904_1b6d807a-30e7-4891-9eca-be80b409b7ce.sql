-- Forward-only repair migration — live-vs-git schema reconciliation
-- Receipt: docs/releases/pending/2026-07-22-schema-apply-gap-repair.json

-- C1. onboarding_applications.status default realignment
ALTER TABLE public.onboarding_applications
  ALTER COLUMN status SET DEFAULT 'in_progress';

-- B1. engagement_letters lifecycle increment
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

UPDATE public.engagement_letters
   SET status = 'signed'
 WHERE signed_at IS NOT NULL AND status IS DISTINCT FROM 'signed';

UPDATE public.engagement_letters
   SET status = 'sent'
 WHERE signed_at IS NULL AND sent_at IS NOT NULL AND status = 'draft';

-- B2. invoices — portal Stripe payment verify-on-return columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at                    date,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- B3. templates — quote-send columns
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS category  text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- D1. bank_transactions.updated_at — enforce NOT NULL
ALTER TABLE public.bank_transactions
  ALTER COLUMN updated_at SET NOT NULL;
