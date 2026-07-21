-- 20260720190000_company_profile_person_fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_as text,
  ADD COLUMN IF NOT EXISTS primary_contact_person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accounts_next_made_up_to date,
  ADD COLUMN IF NOT EXISTS accounts_next_due date;

ALTER TABLE public.company_officers
  ADD COLUMN IF NOT EXISTS is_signatory boolean NOT NULL DEFAULT false;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.company_persons(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portal_access_unique_company_user
  ON public.portal_access (organization_id, company_id, user_id)
  WHERE company_id IS NOT NULL AND is_active;

CREATE OR REPLACE FUNCTION public.enforce_signatory_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_signatory THEN
    IF NEW.resigned_at IS NOT NULL THEN
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

CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_officer_uq
  ON public.company_persons (organization_id, ch_officer_id);

CREATE UNIQUE INDEX IF NOT EXISTS company_officers_company_ch_appointment_uq
  ON public.company_officers (company_id, ch_appointment_id);