-- Add mapping provenance columns to filing_model_snapshots
-- These store deterministic SHA-256 hashes for snapshot integrity verification on lock
ALTER TABLE public.filing_model_snapshots
  ADD COLUMN IF NOT EXISTS tb_snapshot_ref TEXT,
  ADD COLUMN IF NOT EXISTS coa_mapping_ref TEXT,
  ADD COLUMN IF NOT EXISTS mapping_rules_version TEXT;

COMMENT ON COLUMN public.filing_model_snapshots.tb_snapshot_ref IS 'SHA-256 hash of the trial balance snapshot captured at lock time';
COMMENT ON COLUMN public.filing_model_snapshots.coa_mapping_ref IS 'SHA-256 hash of the COA tax mapping state captured at lock time';
COMMENT ON COLUMN public.filing_model_snapshots.mapping_rules_version IS 'Deterministic SHA-256 hash of the TB-to-FRS105 mapping rules used at lock time';