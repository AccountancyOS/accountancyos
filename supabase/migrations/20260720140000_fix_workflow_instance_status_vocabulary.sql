-- ============================================================
-- Corrective: standardise automation_workflow_instances.status on the UPPERCASE 7-value vocabulary
-- ============================================================
-- Fixes a defect introduced by 20260717090000 (AUTO-1 increment 1). That migration normalised the
-- status column to LOWERCASE and added a CHECK of ('queued','running','waiting','completed','failed').
-- That was wrong on two counts:
--   (a) WRONG DIRECTION. The system's dominant vocabulary is UPPERCASE. The RPCs
--       pause/resume/cancel_workflow_instance (20260602092427) write 'PAUSED' / 'QUEUED' /
--       'CANCELLED'; the router (process-automation-events) inserts 'QUEUED'; the original column
--       default was 'QUEUED' and the original tick index predicate was ('QUEUED','RUNNING'). Only
--       the executor (workflow-tick) wrote lowercase — it was the lone outlier, and normalising
--       toward it was backwards.
--   (b) INCOMPLETE SET. The lowercase CHECK omitted PAUSED and CANCELLED entirely, so once applied
--       it rejects every pause/cancel (and the uppercase spawn/resume) with a constraint violation
--       — the same class of break as the leads.status bug.
--
-- This standardises on UPPERCASE with the full 7-value set. The executor (workflow-tick) is switched
-- to UPPERCASE in the same commit so it reads/writes the canonical values. The router and the three
-- RPCs already use UPPERCASE and need no change.
--
-- Idempotent and order-safe: 20260717090000 (July 17) always applies before this (July 20), so this
-- runs last and wins regardless of whether 20260717090000 reached live (apply-gap). Converges to
-- UPPERCASE from lowercase, uppercase, or mixed data.
-- ============================================================

-- 1. Normalise any existing rows to uppercase (undoes 20260717090000's lowercasing / any drift).
UPDATE public.automation_workflow_instances
SET status = upper(status)
WHERE status <> upper(status);

-- Preflight: fail loudly if any value falls outside the canonical set rather than on a cryptic
-- constraint error.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.automation_workflow_instances
  WHERE status NOT IN ('QUEUED','RUNNING','WAITING','PAUSED','CANCELLED','COMPLETED','FAILED');
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Cannot set status CHECK: % automation_workflow_instances row(s) hold a status outside (QUEUED,RUNNING,WAITING,PAUSED,CANCELLED,COMPLETED,FAILED). Reconcile them first.', v_bad;
  END IF;
END $$;

-- 2. Replace the incomplete lowercase CHECK from 20260717090000 with the full uppercase set.
ALTER TABLE public.automation_workflow_instances
  DROP CONSTRAINT IF EXISTS automation_workflow_instances_status_check;
ALTER TABLE public.automation_workflow_instances
  ADD CONSTRAINT automation_workflow_instances_status_check
  CHECK (status IN ('QUEUED','RUNNING','WAITING','PAUSED','CANCELLED','COMPLETED','FAILED'));

-- 3. Default back to 'QUEUED' (matches the router insert and the original column default).
ALTER TABLE public.automation_workflow_instances
  ALTER COLUMN status SET DEFAULT 'QUEUED';

-- 4. Recreate the tick index against the uppercase predicate (20260717090000 built it lowercase).
DROP INDEX IF EXISTS public.idx_workflow_instances_tick;
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tick
  ON public.automation_workflow_instances (status, next_run_at)
  WHERE status IN ('QUEUED','RUNNING');
