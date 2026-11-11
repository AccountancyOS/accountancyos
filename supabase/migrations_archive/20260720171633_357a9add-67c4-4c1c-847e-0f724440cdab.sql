-- 20260720140000_fix_workflow_instance_status_vocabulary
UPDATE public.automation_workflow_instances
SET status = upper(status)
WHERE status <> upper(status);

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.automation_workflow_instances
  WHERE status NOT IN ('QUEUED','RUNNING','WAITING','PAUSED','CANCELLED','COMPLETED','FAILED');
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Cannot set status CHECK: % automation_workflow_instances row(s) hold a status outside the canonical set. Reconcile them first.', v_bad;
  END IF;
END $$;

ALTER TABLE public.automation_workflow_instances
  DROP CONSTRAINT IF EXISTS automation_workflow_instances_status_check;
ALTER TABLE public.automation_workflow_instances
  ADD CONSTRAINT automation_workflow_instances_status_check
  CHECK (status IN ('QUEUED','RUNNING','WAITING','PAUSED','CANCELLED','COMPLETED','FAILED'));

ALTER TABLE public.automation_workflow_instances
  ALTER COLUMN status SET DEFAULT 'QUEUED';

DROP INDEX IF EXISTS public.idx_workflow_instances_tick;
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tick
  ON public.automation_workflow_instances (status, next_run_at)
  WHERE status IN ('QUEUED','RUNNING');