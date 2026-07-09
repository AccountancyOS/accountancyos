-- ============================================================
-- Filing Stage D (VAT): enforce "no submission without an approved snapshot" (FIL-1)
-- ============================================================
-- Now that VAT snapshot population (A), accountant approval (B) and real transport (C) exist,
-- add the structural backstop so the gate cannot be bypassed by a direct write: a VAT return may
-- only transition INTO a submitted state if it carries an approved model snapshot
-- (model_snapshot_id + filing_approved_at). This is the DB-level enforcement of FIL-1 for VAT.
--
-- Fail-SAFE by construction:
--   * Fires ONLY on the transition into submitted (status -> 'submitted', or submitted_at first
--     set). Existing already-submitted rows and every other edit are untouched — so legacy VAT
--     returns submitted under the old flow are NOT retroactively broken.
--   * The Stage-C submit path sets model_snapshot_id at approval (Stage B) BEFORE submitting, so
--     legitimate submissions pass; only an approval-less status flip is blocked.
--   * NOT enforcing hmrc_receipt here (the application layer stamps 'submitted' only on a real
--     success response) to avoid over-constraining any server-side path.
--
-- Preflight: this does not touch existing rows (transition-only), so no reconciliation of
-- historical data is required. Reconciliation confirmed 0 problematic live job/handoff data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_vat_filing_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.status = 'submitted' AND COALESCE(OLD.status, '') <> 'submitted')
     OR (NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL) THEN
    IF NEW.model_snapshot_id IS NULL OR NEW.filing_approved_at IS NULL THEN
      RAISE EXCEPTION 'A VAT return cannot be submitted without an approved filing snapshot. Approve it for filing first.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vat_filing_gate ON public.vat_returns;
CREATE TRIGGER trg_enforce_vat_filing_gate
  BEFORE UPDATE ON public.vat_returns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vat_filing_gate();
