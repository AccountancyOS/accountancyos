-- ============================================================
-- AUTO-1 increment 1: workflow instance claiming + a shared status vocabulary
-- ============================================================
-- Groundwork for scheduling the automation executor (workflow-tick). Two problems, both of which
-- would make scheduling either useless or harmful:
--
-- 1. THE ENGINES DO NOT SHARE A VOCABULARY. process-automation-events (the router) creates
--    instances with status 'QUEUED' (matching this table's default and the tick index predicate
--    below). workflow-tick (the executor) selects status = 'running' — lowercase. NOTHING anywhere
--    transitions 'QUEUED' -> 'running': the only write of 'running' is in the executor's *resume*
--    branch, which only fires for instances already 'waiting'. So today the router would spawn
--    instances that the executor ignores forever, silently. Scheduling both engines as-is would
--    produce a cron bill and no automation.
--
--    Canonical vocabulary is now LOWERCASE: queued | running | waiting | completed | failed.
--    Chosen on evidence, not taste: the executor already reads and writes lowercase throughout
--    (running, waiting, completed x4, failed x2); only the router's INSERT, this column default and
--    the tick index predicate were uppercase. 3 places to change instead of ~8.
--    'queued' means "ready to run, not yet started" — which next_run_at already encodes — so the
--    executor now selects status IN ('queued','running') and no QUEUED->running transition step is
--    needed.
--
-- 2. NO DRIFT GUARD. The column has never had a CHECK constraint, which is why this drift survived
--    unnoticed. Added below, so the next mismatch fails loudly at write time instead of silently
--    doing nothing for months.
--
-- Also adds claimed_at: workflow-tick had NO claiming, so two overlapping runs would select the
-- same instances and execute the same step twice — duplicate client emails, duplicate job
-- assignments. Same claim/reclaim idiom as the email-queue worker (Fix 10, 20260706144830): one
-- reclaim convention in this codebase, not two.
--
-- SAFE: the live table currently holds ZERO rows (verified 2026-07-17), so there is no backfill and
-- no data risk — this is the cheapest this fix will ever be. The normalise + preflight below are
-- defensive in case that changes before apply.
-- Idempotent: safe to re-run.
-- ============================================================

-- Preflight: the CHECK below would fail on any row outside the canonical set. Fail with a clear
-- message rather than a cryptic constraint violation.
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

-- 1. Normalise existing values to the canonical case (no-op at zero rows).
UPDATE public.automation_workflow_instances
SET status = lower(status)
WHERE status <> lower(status);

-- 2. Default: 'QUEUED' -> 'queued', so rows inserted without an explicit status are canonical.
ALTER TABLE public.automation_workflow_instances
  ALTER COLUMN status SET DEFAULT 'queued';

-- 3. Drift guard.
ALTER TABLE public.automation_workflow_instances
  DROP CONSTRAINT IF EXISTS automation_workflow_instances_status_check;
ALTER TABLE public.automation_workflow_instances
  ADD CONSTRAINT automation_workflow_instances_status_check
  CHECK (status IN ('queued', 'running', 'waiting', 'completed', 'failed'));

-- 4. Retry-safe claiming. NULL = unclaimed; a claim older than the worker's stale window (10 min)
-- may be taken over, so an instance is never stranded by a run that died mid-step.
ALTER TABLE public.automation_workflow_instances
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- 5. Recreate the tick index against the canonical vocabulary. The existing predicate is
-- WHERE status IN ('QUEUED','RUNNING') (20260217112409:139-141) — uppercase, so the executor's
-- lowercase query never used it, and after this migration it would match no rows at all.
-- NOTE: idx_workflow_instances_unique (20260217112409:128-136) has NO status predicate, so the
-- router's 23505 "already spawned for this period_key" idempotency guard is case-independent and is
-- deliberately left untouched.
DROP INDEX IF EXISTS public.idx_workflow_instances_tick;
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tick
  ON public.automation_workflow_instances (status, next_run_at)
  WHERE status IN ('queued', 'running');
