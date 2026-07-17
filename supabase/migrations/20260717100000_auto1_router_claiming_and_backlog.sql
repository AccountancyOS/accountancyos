-- ============================================================
-- AUTO-1 increment 2: automation_events claiming, dead-letter, and one-time backlog skip
-- ============================================================
-- Prepares process-automation-events (the router) for scheduling. Unlike the workflow-instances
-- table, automation_events HOLDS LIVE DATA — 27 unprocessed rows dating back to 2026-06-02
-- (verified live 2026-07-17), unprocessed only because the router was never scheduled.
--
-- THREE problems this addresses:
--
-- 1. GO-LIVE BURST. The router selects processed_at IS NULL. The moment increment 3 puts it on a
--    cron it would process all 27 at once — spawning workflows and firing trigger contracts
--    (routeTriggerContractEvent), some of which send client-facing email, for onboardings and
--    quote-acceptances up to six weeks old. Owner decision (2026-07-17): mark the pre-existing
--    backlog as SKIPPED so the scheduled router only acts on events created after go-live. The
--    rows stay for audit but never trigger actions.
--
-- 2. NO CLAIMING. Two overlapping runs both select the same NULL-processed_at events and route
--    them twice. can_execute_automation guards *rule* executions, but routeTriggerContractEvent
--    (the workflow spawner) has no such guard, so it would double-spawn. Add claimed_at + the same
--    claim/reclaim idiom as workflow-tick (inc 1) and the email-queue worker (Fix 10).
--
-- 3. NO VISIBLE FAILED STATE. The router's outer catch pushes to an errors array and moves on,
--    leaving processed_at NULL — so a poisoned event is re-selected and retried on EVERY run
--    forever, invisibly. Add attempts/last_error/failed_at: after MAX_EVENT_ATTEMPTS (5) the event
--    is stamped failed_at (a visible dead-letter) and excluded from selection.
--
-- Additive/safe: new nullable columns, no drops of data. Idempotent.
-- ============================================================

-- 1. Claiming + failure-tracking columns.
ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS failed_at  timestamptz;

-- 2. One-time backlog skip. Every event UNPROCESSED AT APPLY TIME is stamped processed_at=now()
-- with an auditable metadata marker, so the scheduled router (increment 3) never sees it. This is a
-- one-shot snapshot: events created AFTER this migration keep processed_at NULL and are processed
-- normally (they are recent by the time the cron runs). Nothing is deleted — the marker records
-- that these were skipped at activation, not genuinely processed.
UPDATE public.automation_events
SET processed_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('automation_backlog_skipped_at', now())
WHERE processed_at IS NULL;

-- 3. Selection index: unprocessed, not-yet-dead-lettered, claim-aware. Mirrors the router's live
-- query (processed_at IS NULL AND failed_at IS NULL, ordered by created_at). Replaces the plain
-- unprocessed index's role for the scheduled path.
CREATE INDEX IF NOT EXISTS idx_automation_events_claimable
  ON public.automation_events (created_at)
  WHERE processed_at IS NULL AND failed_at IS NULL;
