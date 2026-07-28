-- =====================================================================================
-- DEF-010: retire the legacy MTD quarterly catalogue entry.
-- =====================================================================================
-- The launch-readiness audit found the quote builder offering
--   'MTD Quarterly Filing — £35.00'  alongside  'MTD Quarterly Submission — £75.00'
-- with no way for an accountant to tell which to sell.
--
-- They are not equivalent. The proposal engine keys on exactly two MTD codes —
-- `mtd_quarter` and `mtd_itsa_final` (MTD_SERVICE_CODES in src/lib/proposal/mtd-periods.ts):
-- a tax year decomposes into four `mtd_quarter` lines plus one `mtd_itsa_final`.
--   * 'MTD Quarterly Filing'    = code `mtd_quarter`   — canonical, created by 20260725140000.
--   * 'MTD Quarterly Submission' = code `mtd_quarterly` — a pre-existing orphan that
--     20260725140000 deliberately left untouched ("The orphaned legacy 'mtd_quarterly'
--     row (canonical_service_code NULL) is left untouched"). Nothing keys on it: its
--     canonical_service_code is NULL and no engine, deadline rule or UI helper matches it.
--
-- Selling the orphan produces a quote line no MTD decomposition recognises — no quarterly
-- periods, no jobs, and a fee the client is charged for work the engine never schedules.
--
-- DEACTIVATED, NOT DELETED. Historic quotes and quote_lines reference services_catalog by
-- id; deleting the row would break their line rendering and any job already materialised
-- from it. `active = false` removes it from the builder while leaving history readable.
--
-- Scoped by `code`, org-agnostic: the row is seeded per organization, so every practice
-- carrying the orphan is reconciled. Idempotent — re-running changes nothing.
--
-- NOT addressed here (needs an owner ruling, see docs/audits/2026-07-28-remediation-plan.md §6):
--   * whether `sa_mtd` should remain quotable for an MTD client. It is NOT a duplicate to
--     retire — it carries canonical_service_code 'self_assessment_mtd_quarterly' which the
--     materialise engine uses, and it doubles as the client type — but offering it beside
--     the four quarters and the final declaration lets one obligation be billed twice.
--   * the three services with default_price 0.00 (LLP accounts production, Sole trader
--     accounts, Trust Registration Service). Zero means "Included" throughout the product
--     (isIncludedLine), so those rows quote as free of charge until priced.
-- =====================================================================================

UPDATE public.services_catalog
   SET active = false,
       updated_at = now()
 WHERE code = 'mtd_quarterly'
   AND active IS DISTINCT FROM false;

-- Leave a trail on the row itself, so the next person to find it knows why it is dormant
-- rather than assuming it was disabled by accident.
COMMENT ON TABLE public.services_catalog IS
  'Sellable services per organization. NOTE: code ''mtd_quarterly'' is a retired legacy '
  'entry (deactivated by 20260728130000, DEF-010) — the canonical MTD codes are '
  '''mtd_quarter'' and ''mtd_itsa_final'', which the proposal engine decomposes a tax '
  'year into. Do not reactivate it.';
