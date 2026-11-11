-- Proposal Phase 1 — Task 6b-1: MTD-quarter + MTD-final deadlines (System A) +
-- the MTD Quarterly Filing catalog service.
--
-- Two additive, idempotent changes:
--   1. Extend the WORKING System A deadline engine (public.calculate_deadline) with two
--      new per-period filing types the proposal now creates one job per period for:
--        - 'mtd_quarter'      → fixed statutory MTD-ITSA quarterly update date
--                               (7 Aug / 7 Nov / 7 Feb / 7 May — the 7th of the month after
--                               each standard 5th-ending quarter-end).
--        - 'mtd_itsa_final'   → 31 January following the tax year (same as self_assessment).
--      Every other arm is reproduced byte-for-byte from the live body. No other behaviour
--      changes. Nothing routes into System B; this stays entirely inside System A.
--   2. Add a per-org 'mtd_quarter' service (MTD Quarterly Filing), one row per org that has
--      the sa_mtd service, mirroring Task 6a's per-org INSERT ... SELECT FROM sa_mtd.
--
-- RPC-replacement discipline: this CREATE OR REPLACE is based on the live body of
-- public.calculate_deadline (latest definition in git: 20251125193826, the search_path-
-- hardened SECURITY DEFINER form). All pre-existing arms are preserved verbatim; only the
-- two additive arms and the header comment are new.

-- 1. Extend System A (calculate_deadline) with the two new per-period arms.
CREATE OR REPLACE FUNCTION public.calculate_deadline(
  filing_type TEXT,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- System A (calculate_deadline) is THE active deadline engine; System B
-- (lifecycle_generate_deadlines_for_job + canonical_deadline_rules) is dormant/reference —
-- do not route jobs into B without the dedicated engine-consolidation effort.
DECLARE
  result_date DATE;
  ard DATE;
  made_up_date DATE;
  quarter_end DATE;
BEGIN
  CASE filing_type
    WHEN 'companies_house_accounts' THEN
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '9 months';

    WHEN 'companies_house_confirmation' THEN
      made_up_date := (metadata->>'made_up_date')::DATE;
      IF made_up_date IS NULL THEN
        made_up_date := period_end;
      END IF;
      result_date := made_up_date + INTERVAL '12 months';

    WHEN 'corporation_tax_filing' THEN
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '12 months';

    WHEN 'corporation_tax_payment' THEN
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '9 months' + INTERVAL '1 day';

    WHEN 'self_assessment' THEN
      result_date := DATE_TRUNC('year', period_end)::DATE + INTERVAL '1 year' + INTERVAL '1 month' - INTERVAL '1 day';
      IF EXTRACT(MONTH FROM period_end) < 4 THEN
        result_date := result_date - INTERVAL '1 year';
      END IF;

    WHEN 'mtd_quarter' THEN
      -- MTD-ITSA quarterly update: fixed statutory date = the 7th of the month AFTER the
      -- standard 5th-ending quarter-end (5 Jul→7 Aug, 5 Oct→7 Nov, 5 Jan→7 Feb, 5 Apr→7 May).
      -- Standard 5th-ending quarters only; the calendar-quarter election is out of scope for v1.
      result_date := (DATE_TRUNC('month', period_end) + INTERVAL '1 month' + INTERVAL '6 days')::DATE;

    WHEN 'mtd_itsa_final' THEN
      -- MTD-ITSA final declaration: 31 January following the tax year (mirrors self_assessment;
      -- a tax year ending 5 Apr 2026 → 31 Jan 2027).
      result_date := make_date(EXTRACT(YEAR FROM period_end)::int + 1, 1, 31);

    WHEN 'vat_return' THEN
      quarter_end := period_end;
      result_date := quarter_end + INTERVAL '1 month' + INTERVAL '7 days';

    WHEN 'payroll_fps' THEN
      result_date := period_end;

    WHEN 'payroll_eps' THEN
      result_date := DATE_TRUNC('month', period_end)::DATE + INTERVAL '1 month' + INTERVAL '18 days';

    ELSE
      result_date := period_end + INTERVAL '1 month';
  END CASE;

  RETURN result_date;
END;
$$;

-- 2. MTD Quarterly Filing service — org-scoped, one row per practice that has sa_mtd.
--    Mirrors Task 6a (20260725130000): per-org INSERT ... SELECT from that org's own sa_mtd,
--    copying its NOT-NULL columns (billing_model, default_price, is_bookkeeping_related,
--    is_recurring) and overriding entity_scope to 'individual'. canonical_service_code is NULL
--    (sa_mtd already owns 'self_assessment_mtd_quarterly' and it is per-org-unique; System A
--    doesn't use canonical_service_code). Idempotent via NOT EXISTS on (organization_id, code).
--    The orphaned legacy 'mtd_quarterly' row (canonical_service_code NULL) is left untouched.
INSERT INTO public.services_catalog (
  organization_id,
  code,
  name,
  description,
  billing_model,
  default_price,
  is_bookkeeping_related,
  active,
  is_recurring,
  entity_scope,
  canonical_service_code
)
SELECT
  sc.organization_id,
  'mtd_quarter',
  'MTD Quarterly Filing',
  'MTD for ITSA quarterly update (one per standard 5th-ending quarter)',
  sc.billing_model,
  sc.default_price,
  sc.is_bookkeeping_related,
  true,
  sc.is_recurring,
  'individual',
  NULL   -- canonical_service_code: intentionally NULL. sa_mtd already holds
         -- 'self_assessment_mtd_quarterly' and services_catalog_org_canonical_code_uniq
         -- makes it per-org-unique (reusing it → 23505). System A (calculate_deadline)
         -- keys on service_type, not canonical_service_code, so this is unused this
         -- release; matches the legacy orphan 'mtd_quarterly' (also NULL). A proper
         -- distinct canonical concept is assigned in the future System-B consolidation.
FROM public.services_catalog sc
WHERE sc.code = 'sa_mtd'
  AND NOT EXISTS (
    SELECT 1
    FROM public.services_catalog existing
    WHERE existing.organization_id = sc.organization_id
      AND existing.code = 'mtd_quarter'
  );
