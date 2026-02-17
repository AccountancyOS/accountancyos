
-- Phase 3: Filing SSOT Draft + Snapshots + Locking + Audit
-- =========================================================

-- 1. Extend filings table with SSOT draft + version tracking + locking
ALTER TABLE public.filings
  ADD COLUMN IF NOT EXISTS draft_schedule_data_json JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_snapshot_id UUID REFERENCES public.filing_model_snapshots(id),
  ADD COLUMN IF NOT EXISTS current_version INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID;

-- 2. Migrate existing filing_data into draft_schedule_data_json for rows that have data
UPDATE public.filings
SET draft_schedule_data_json = filing_data
WHERE filing_data IS NOT NULL 
  AND filing_data != '{}'::jsonb
  AND (draft_schedule_data_json IS NULL OR draft_schedule_data_json = '{}'::jsonb);

-- 3. Extend filing_model_snapshots with version tracking, filing linkage, TB/COA snapshots
ALTER TABLE public.filing_model_snapshots
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lock_reason TEXT,
  ADD COLUMN IF NOT EXISTS filing_id UUID REFERENCES public.filings(id),
  ADD COLUMN IF NOT EXISTS tb_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS coa_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS computed_outputs JSONB,
  ADD COLUMN IF NOT EXISTS pdf_artifact_id UUID,
  ADD COLUMN IF NOT EXISTS submission_artifact_id UUID;

-- 4. Update filings status constraint to include new statuses
-- First drop existing check constraint if it exists
DO $$
BEGIN
  -- Try to drop the constraint; ignore if it doesn't exist
  BEGIN
    ALTER TABLE public.filings DROP CONSTRAINT IF EXISTS filings_status_check;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    ALTER TABLE public.filings DROP CONSTRAINT IF EXISTS chk_filing_status;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

-- Add expanded status check
ALTER TABLE public.filings ADD CONSTRAINT chk_filing_status CHECK (
  status IN (
    'not_started', 'draft', 'in_progress', 
    'ready_for_review', 'sent_to_client', 'client_changes_requested',
    'awaiting_approval', 'approved', 'ready_to_file',
    'submitted', 'accepted', 'rejected', 'filed'
  )
);

-- 5. Create index for filing_model_snapshots by filing_id for version history queries
CREATE INDEX IF NOT EXISTS idx_filing_model_snapshots_filing_id 
  ON public.filing_model_snapshots(filing_id);

CREATE INDEX IF NOT EXISTS idx_filing_model_snapshots_version 
  ON public.filing_model_snapshots(filing_id, version DESC);

-- 6. Create backfill migration: link existing snapshots to filings
UPDATE public.filing_model_snapshots fms
SET filing_id = f.id, version = 1
FROM public.filings f
WHERE f.model_snapshot_id = fms.id
  AND fms.filing_id IS NULL;

-- 7. RLS policies for new columns are already covered by existing filings + filing_model_snapshots policies
-- (they use organization_id-based access which covers all columns)
