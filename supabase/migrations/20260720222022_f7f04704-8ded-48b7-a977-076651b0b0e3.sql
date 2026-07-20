-- Company profile + person model — schema additions (Phase 2, Task 3)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_as text,
  ADD COLUMN IF NOT EXISTS primary_contact_person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accounts_next_made_up_to date,
  ADD COLUMN IF NOT EXISTS accounts_next_due date;

ALTER TABLE public.company_officers
  ADD COLUMN IF NOT EXISTS is_signatory boolean NOT NULL DEFAULT false;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL;

-- One person per (org, CH officer id). Pre-checked live DB: 0 duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_officer_unique
  ON public.company_persons (organization_id, ch_officer_id)
  WHERE ch_officer_id IS NOT NULL;

-- One active portal_access row per (org, company, user).
CREATE UNIQUE INDEX IF NOT EXISTS portal_access_unique_company_user
  ON public.portal_access (organization_id, company_id, user_id)
  WHERE company_id IS NOT NULL AND user_id IS NOT NULL AND is_active = true;

-- Signatory rules: active officers only, cap 10 per company.
CREATE OR REPLACE FUNCTION public.enforce_signatory_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_signatory THEN
    IF NEW.resigned_at IS NOT NULL THEN
      RAISE EXCEPTION 'A resigned officer cannot be a signatory';
    END IF;
    IF (
      SELECT count(*) FROM public.company_officers
      WHERE company_id = NEW.company_id
        AND is_signatory = true
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
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
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signatory_rules();