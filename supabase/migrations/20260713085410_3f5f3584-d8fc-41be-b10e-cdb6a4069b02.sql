-- ============================================================
-- Filing Stage D (CT600): enforce "no submission without an approved snapshot" (FIL-1)
-- ============================================================
-- CT600 Stages A-C now exist (snapshot population, accountant approval linking model_snapshot_id,
-- real hmrc-ct-submit which itself gates on the approval via validate_submission_integrity). Add
-- the DB-level backstop so the gate cannot be bypassed by a DIRECT write to filings (e.g. a
-- manual markFilingAsFiled or a raw UPDATE): a CT600 filing may only transition INTO a terminal
-- filed state if it carries an approved model snapshot (model_snapshot_id).
--
-- Scope is deliberately narrow (rule: don't gate flows whose snapshot/approval callers don't
-- exist yet):
--   * ONLY CT600 filing types. Companies House, SA, accounts, VAT etc. are untouched — each gets
--     its own gate once its A-C are wired (VAT already has its own trigger).
--   * ONLY on the transition INTO a terminal state (submitted/filed/accepted). Existing terminal
--     rows and every non-terminal edit are unaffected — no retroactive break of CT600s filed
--     under the old manual flow. hmrc-ct-submit's intermediate 'submitting' status is not
--     terminal, so its normal submit path (which sets model_snapshot_id at approval, before
--     submitting) passes.
--
-- Preflight: transition-only, so no historical CT600 rows are touched -> no data reconciliation
-- required before applying.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_ct600_filing_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_terminal text[] := ARRAY['submitted','filed','accepted'];
BEGIN
  IF NEW.filing_type IN ('CT600','ct600','corporation_tax','CT600_HMRC','CT600_XML')
     AND NEW.status = ANY(v_terminal)
     AND COALESCE(OLD.status, '') <> ALL(v_terminal)
     AND NEW.model_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'A CT600 cannot be marked submitted/filed without an approved filing snapshot. Approve it for filing first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ct600_filing_gate ON public.filings;
CREATE TRIGGER trg_enforce_ct600_filing_gate
  BEFORE UPDATE ON public.filings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ct600_filing_gate();
