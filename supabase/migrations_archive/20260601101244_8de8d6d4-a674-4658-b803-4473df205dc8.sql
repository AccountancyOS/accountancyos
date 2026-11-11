
-- Phase 2 chaser extension: support non-job subjects (leads, quotes, engagement letters, KYC subjects, HMRC auth)

-- 1. Add subject columns to runs
ALTER TABLE public.automation_chaser_runs
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_id uuid;

-- 2. Allow job_id to be NULL when subject_type is set
ALTER TABLE public.automation_chaser_runs
  ALTER COLUMN job_id DROP NOT NULL;

-- 3. Integrity: exactly one of (job_id, subject_id) must be populated
ALTER TABLE public.automation_chaser_runs
  DROP CONSTRAINT IF EXISTS chk_chaser_run_target;
ALTER TABLE public.automation_chaser_runs
  ADD CONSTRAINT chk_chaser_run_target
  CHECK (
    (job_id IS NOT NULL AND subject_id IS NULL AND subject_type IS NULL)
    OR (job_id IS NULL AND subject_id IS NOT NULL AND subject_type IS NOT NULL)
  );

-- 4. Subject type whitelist
ALTER TABLE public.automation_chaser_runs
  DROP CONSTRAINT IF EXISTS chk_chaser_run_subject_type;
ALTER TABLE public.automation_chaser_runs
  ADD CONSTRAINT chk_chaser_run_subject_type
  CHECK (
    subject_type IS NULL
    OR subject_type IN ('lead','quote','engagement_letter','kyc_subject','hmrc_auth')
  );

-- 5. Unique constraint for subject-based runs
CREATE UNIQUE INDEX IF NOT EXISTS uq_chaser_run_subject_policy
  ON public.automation_chaser_runs (subject_type, subject_id, policy_id)
  WHERE subject_id IS NOT NULL;

-- 6. Index for tick lookups
CREATE INDEX IF NOT EXISTS idx_chaser_runs_subject
  ON public.automation_chaser_runs (subject_type, subject_id)
  WHERE subject_id IS NOT NULL;

-- 7. Mirror columns on messages for consistent audit
ALTER TABLE public.automation_chaser_messages
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_id uuid;

ALTER TABLE public.automation_chaser_messages
  ALTER COLUMN job_id DROP NOT NULL;
