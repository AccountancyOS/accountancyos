-- Phase 2: company-profile + person-model schema fields, signatory rules,
-- and the org-scoped unique indexes that make Companies House officer
-- promotion (companies-house-sync edge function) actually work at runtime.
-- Idempotent / additive only.

-- =====================================================
-- 1. Company profile fields
-- =====================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_as text,
  ADD COLUMN IF NOT EXISTS primary_contact_person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accounts_next_made_up_to date,
  ADD COLUMN IF NOT EXISTS accounts_next_due date;

-- =====================================================
-- 2. Signatory flag on company_officers
-- =====================================================
ALTER TABLE public.company_officers
  ADD COLUMN IF NOT EXISTS is_signatory boolean NOT NULL DEFAULT false;

-- =====================================================
-- 3. Person link on contacts
-- =====================================================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL;

-- =====================================================
-- 4. portal_access: prevent duplicate active company-scoped access grants
-- (mirrors the existing portal_access_unique_client_user pattern from
-- 20260603122435; columns verified against the table's CREATE TABLE in
-- 20251126012734 + the is_active column added in 20251129003403).
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS portal_access_unique_company_user
  ON public.portal_access (organization_id, company_id, user_id)
  WHERE company_id IS NOT NULL AND is_active;

-- =====================================================
-- 5. Signatory rules trigger on company_officers
--    - a resigned officer can never be marked as a signatory
--    - at most 10 active signatories per company
-- =====================================================
CREATE OR REPLACE FUNCTION public.enforce_signatory_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_signatory THEN
    IF NEW.resigned_at IS NOT NULL THEN
      -- A resigned officer cannot be a signatory. Auto-demote instead of
      -- raising, so a Companies House resync that records a resignation via
      -- ON CONFLICT DO UPDATE (which preserves the existing is_signatory)
      -- is not rejected and does not abort the officer-promotion statement.
      NEW.is_signatory := false;
    ELSIF (
      SELECT count(*) FROM public.company_officers
      WHERE company_id = NEW.company_id AND is_signatory AND id <> NEW.id
    ) >= 10 THEN
      RAISE EXCEPTION 'A company can have at most 10 signatories';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signatory_rules ON public.company_officers;
CREATE TRIGGER trg_enforce_signatory_rules
BEFORE INSERT OR UPDATE ON public.company_officers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_signatory_rules();

-- =====================================================
-- 6. Org-scoped unique indexes for Companies House officer promotion
--    (companies-house-sync edge function upserts on these composite keys;
--    single-column global-unique would let one org's CH sync collide with
--    another org's row for the same real-world company — a cross-tenant
--    leak — so these are scoped to organization_id / company_id).
-- =====================================================
-- Non-partial so supabase-js/PostgREST onConflict can infer them; NULLs are
-- distinct in unique indexes so rows with a NULL CH id never collide.
CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_officer_uq
  ON public.company_persons (organization_id, ch_officer_id);

CREATE UNIQUE INDEX IF NOT EXISTS company_officers_company_ch_appointment_uq
  ON public.company_officers (company_id, ch_appointment_id);
