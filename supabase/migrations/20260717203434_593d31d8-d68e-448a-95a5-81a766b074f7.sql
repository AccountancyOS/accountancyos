ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS failed_at  timestamptz;

UPDATE public.automation_events
SET processed_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('automation_backlog_skipped_at', now())
WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_automation_events_claimable
  ON public.automation_events (created_at)
  WHERE processed_at IS NULL AND failed_at IS NULL;