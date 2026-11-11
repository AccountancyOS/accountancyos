-- CT600 submission gate trigger: block transition into submitted/filed/accepted
-- for CT600 filings unless an approved model snapshot is attached.
CREATE OR REPLACE FUNCTION public.enforce_ct600_approval_before_filed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  terminal_new boolean;
  terminal_old boolean;
  is_ct600 boolean;
  has_active_approval boolean;
BEGIN
  terminal_new := NEW.status IN ('submitted', 'filed', 'accepted');
  terminal_old := COALESCE(OLD.status, '') IN ('submitted', 'filed', 'accepted');

  -- Only enforce on a fresh transition INTO a terminal status.
  IF NOT terminal_new OR terminal_old THEN
    RETURN NEW;
  END IF;

  is_ct600 := lower(COALESCE(NEW.filing_type, '')) IN ('ct600', 'corporation_tax');
  IF NOT is_ct600 THEN
    RETURN NEW;
  END IF;

  IF NEW.model_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'CT600 filing % cannot be marked % without an approved model snapshot',
      NEW.id, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.filing_approvals fa
    WHERE fa.filing_id = NEW.id
      AND fa.model_snapshot_id = NEW.model_snapshot_id
      AND COALESCE(fa.revoked_at, NULL) IS NULL
  ) INTO has_active_approval;

  IF NOT has_active_approval THEN
    RAISE EXCEPTION 'CT600 filing % cannot be marked % without an active accountant approval of the attached snapshot',
      NEW.id, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ct600_approval_before_filed ON public.filings;
CREATE TRIGGER trg_enforce_ct600_approval_before_filed
BEFORE UPDATE OF status ON public.filings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ct600_approval_before_filed();