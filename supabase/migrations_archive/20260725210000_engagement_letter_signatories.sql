-- ============================================================
-- Proposal Phase 2, Task 2a — signatories foundation (ADDITIVE)
-- ------------------------------------------------------------
-- Additive + idempotent. Owner applies via Lovable (release-receipt gated).
--
-- Introduces the model an all-must-sign / any-one-may-sign engagement-letter
-- flow needs, WITHOUT changing any signing RPC, gate, or UI. Nothing here is
-- populated or read yet — Task 2d/2e wire it in.
--
--   * public.engagement_letter_signatories  — one row per required signer of an
--       engagement letter; carries the per-signatory signature evidence.
--   * RLS mirroring public.engagement_letters (org-scoped read; manager-gated
--       insert/update). NB the live engagement_letters has NO token-based read
--       policy — its public sign path runs through SECURITY DEFINER RPCs, not
--       RLS — so there is no public/token policy to mirror here.
--   * public.protect_signatory_signature() — once signed_at is set, the
--       signature fields become immutable (mirrors the live
--       protect_engagement_letter_signatures pattern, over the columns that
--       exist on this table).
--   * public.engagement_letters.signing_rule text NOT NULL DEFAULT 'all'
--       with a guarded CHECK signing_rule IN ('all','any').
--
-- gen_random_uuid() matches the live engagement_letters.id default.
-- ============================================================

-- 1. Signatories table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_letter_signatories (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL,
  engagement_letter_id      uuid        REFERENCES public.engagement_letters(id) ON DELETE CASCADE,
  onboarding_application_id uuid,
  person_id                 uuid,
  contact_id                uuid,
  signer_name               text,
  signer_email              text        NOT NULL,
  signature_token           uuid        DEFAULT gen_random_uuid(),
  signed_at                 timestamptz,
  signature_ip              text,
  signature_user_agent      text,
  required                  boolean     NOT NULL DEFAULT true,
  sign_order                int,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes.
CREATE INDEX IF NOT EXISTS idx_el_signatories_engagement_letter_id
  ON public.engagement_letter_signatories (engagement_letter_id);
CREATE INDEX IF NOT EXISTS idx_el_signatories_signature_token
  ON public.engagement_letter_signatories (signature_token);

-- 2. RLS mirroring public.engagement_letters ---------------------------------
ALTER TABLE public.engagement_letter_signatories ENABLE ROW LEVEL SECURITY;

-- Policies are dropped-then-created so re-applying the migration is idempotent
-- (safe: this table and its policies are introduced by this same migration).
DROP POLICY IF EXISTS "Org members can view engagement letter signatories"
  ON public.engagement_letter_signatories;
CREATE POLICY "Org members can view engagement letter signatories"
  ON public.engagement_letter_signatories
  FOR SELECT
  TO authenticated
  USING (user_has_organization_access(organization_id));

DROP POLICY IF EXISTS "Managers can create engagement letter signatories"
  ON public.engagement_letter_signatories;
CREATE POLICY "Managers can create engagement letter signatories"
  ON public.engagement_letter_signatories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_has_organization_access(organization_id)
    AND user_has_role_at_least(auth.uid(), organization_id, 'manager'::text)
  );

DROP POLICY IF EXISTS "Managers can update engagement letter signatories"
  ON public.engagement_letter_signatories;
CREATE POLICY "Managers can update engagement letter signatories"
  ON public.engagement_letter_signatories
  FOR UPDATE
  TO authenticated
  USING (
    user_has_organization_access(organization_id)
    AND user_has_role_at_least(auth.uid(), organization_id, 'manager'::text)
  );

-- 3. Signed-row immutability trigger -----------------------------------------
-- Mirrors public.protect_engagement_letter_signatures: once signed_at is set,
-- the recorded signature evidence can never be altered. Restricted to the
-- signature-bearing columns that exist on this table.
CREATE OR REPLACE FUNCTION public.protect_signatory_signature()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.signed_at IS NOT NULL AND (
       OLD.signed_at            IS DISTINCT FROM NEW.signed_at OR
       OLD.signer_name          IS DISTINCT FROM NEW.signer_name OR
       OLD.signer_email         IS DISTINCT FROM NEW.signer_email OR
       OLD.signature_ip         IS DISTINCT FROM NEW.signature_ip OR
       OLD.signature_user_agent IS DISTINCT FROM NEW.signature_user_agent
  ) THEN
    RAISE EXCEPTION 'Cannot modify signature fields on a signed signatory';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_signatory_signature
  ON public.engagement_letter_signatories;
CREATE TRIGGER trg_protect_signatory_signature
  BEFORE UPDATE ON public.engagement_letter_signatories
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_signatory_signature();

-- 4. engagement_letters.signing_rule -----------------------------------------
ALTER TABLE public.engagement_letters
  ADD COLUMN IF NOT EXISTS signing_rule text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'engagement_letters_signing_rule_check'
       AND conrelid = 'public.engagement_letters'::regclass
  ) THEN
    ALTER TABLE public.engagement_letters
      ADD CONSTRAINT engagement_letters_signing_rule_check
      CHECK (signing_rule IN ('all', 'any'));
  END IF;
END $$;
