ALTER TABLE public.organization_integrations_companies_house
  ADD COLUMN IF NOT EXISTS ch_sync_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ch_sync_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ch_sync_opt_in_by UUID;

COMMENT ON COLUMN public.organization_integrations_companies_house.ch_sync_opt_in IS
  'Per-organisation opt-in to Companies House sync. When false, companies-house-sync function refuses to run for this organisation.';