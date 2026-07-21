-- Increment A (client-data-collection design): company address source-of-truth reconciliation.
--
-- Problem: `companies` has two unreconciled address representations. The legacy flat columns
-- (address_line_1/address_line_2/city/postcode/country) are what CompanyDetail.tsx historically
-- displayed as "Registered Address", but companies-house-sync (supabase/functions/
-- companies-house-sync/index.ts) never writes them -- it stages registered-office changes to
-- `companies_house_diff_staging` for accept/reject, and on accept writes the CH-shaped jsonb
-- `registered_office_address` column instead. So the legacy columns go stale/blank while the
-- jsonb column is the one actually kept in sync with Companies House.
--
-- This migration is additive and idempotent:
--   1. Backfills `registered_office_address` from the legacy flat columns, but ONLY where the
--      jsonb is currently NULL/empty and at least one legacy column has data -- so an org that
--      never had a CH sync run still gets its previously-entered address surfaced, and no row
--      that already has CH-synced jsonb data is touched (CH stays authoritative post-backfill).
--      The jsonb keys match the shape companies-house-sync writes into ch_company_profile /
--      registered_office_address: address_line_1, address_line_2, locality, postal_code, country.
--   2. Adds `registered_office_dispute_note` (nullable text) to back the "flag a correction"
--      affordance -- a firm user can record that they believe the CH-sourced registered office is
--      wrong, without being able to overwrite the CH-sourced value itself (the register of record
--      is only corrected by filing a change at Companies House).
--
-- No data loss: the legacy flat columns are left in place (not dropped) so no historical value is
-- destroyed; the UI (CompanyDetail.tsx / CompanyProfilePanel.tsx) is updated separately to stop
-- reading them for the registered-office display.

-- =====================================================
-- 1. Backfill registered_office_address (jsonb) from legacy flat columns
-- =====================================================
UPDATE public.companies
SET registered_office_address = jsonb_strip_nulls(
  jsonb_build_object(
    'address_line_1', address_line_1,
    'address_line_2', address_line_2,
    'locality', city,
    'postal_code', postcode,
    'country', country
  )
)
WHERE (registered_office_address IS NULL OR registered_office_address = '{}'::jsonb)
  AND (
    coalesce(address_line_1, '') <> ''
    OR coalesce(address_line_2, '') <> ''
    OR coalesce(city, '') <> ''
    OR coalesce(postcode, '') <> ''
    OR coalesce(country, '') <> ''
  );

-- =====================================================
-- 2. Flag-to-correct note for the CH-authoritative registered office
-- =====================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS registered_office_dispute_note text;

COMMENT ON COLUMN public.companies.registered_office_dispute_note IS
  'Firm-recorded note flagging a suspected discrepancy in the Companies-House-sourced registered_office_address. Informational only -- does not change registered_office_address itself; the register of record is corrected by filing a change at Companies House.';
