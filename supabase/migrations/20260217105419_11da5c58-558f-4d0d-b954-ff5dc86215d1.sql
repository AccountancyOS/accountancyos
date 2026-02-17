
-- Drop both old check constraints
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS chk_jobs_status;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Migrate existing job status values to new workflow statuses
UPDATE public.jobs SET status = 'blank' WHERE status IN ('not_started', 'on_hold', 'cancelled');
UPDATE public.jobs SET status = 'records_received' WHERE status = 'in_progress';
UPDATE public.jobs SET status = 'client_queries' WHERE status = 'waiting_on_client';
UPDATE public.jobs SET status = 'accountant_review' WHERE status IN ('ready_for_review', 'in_review', 'with_reviewer');
UPDATE public.jobs SET status = 'completed' WHERE status IN ('filed', 'complete');

-- Add new check constraint with workflow statuses
ALTER TABLE public.jobs ADD CONSTRAINT chk_jobs_status CHECK (
  status = ANY (ARRAY[
    'blank', 'records_requested', 'records_received',
    'accountant_queries', 'client_queries',
    'accountant_review', 'client_review',
    'ready_to_file', 'completed'
  ]::text[])
);
