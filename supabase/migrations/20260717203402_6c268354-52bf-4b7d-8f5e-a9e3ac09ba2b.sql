DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.automation_workflow_instances
  WHERE lower(status) NOT IN ('queued', 'running', 'waiting', 'completed', 'failed');

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Cannot add status CHECK: % automation_workflow_instances row(s) hold a status outside (queued,running,waiting,completed,failed). Reconcile them first.', v_bad;
  END IF;
END $$;

UPDATE public.automation_workflow_instances
SET status = lower(status)
WHERE status <> lower(status);

ALTER TABLE public.automation_workflow_instances
  ALTER COLUMN status SET DEFAULT 'queued';

ALTER TABLE public.automation_workflow_instances
  DROP CONSTRAINT IF EXISTS automation_workflow_instances_status_check;
ALTER TABLE public.automation_workflow_instances
  ADD CONSTRAINT automation_workflow_instances_status_check
  CHECK (status IN ('queued', 'running', 'waiting', 'completed', 'failed'));

ALTER TABLE public.automation_workflow_instances
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

DROP INDEX IF EXISTS public.idx_workflow_instances_tick;
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tick
  ON public.automation_workflow_instances (status, next_run_at)
  WHERE status IN ('queued', 'running');