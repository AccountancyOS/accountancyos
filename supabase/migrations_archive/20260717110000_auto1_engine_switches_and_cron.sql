-- ============================================================
-- AUTO-1 increment 3: schedule both automation engines behind per-engine kill-switches
-- ============================================================
-- Increments 1 (workflow-tick) and 2 (process-automation-events) hardened both engines: shared
-- vocabulary, claiming, kill-switch (executor), dead-letter (router), and the live event backlog
-- was skipped. This schedules them.
--
-- SAFETY MODEL (owner decision 2026-07-17): applying this migration is INERT. The cron jobs are
-- created, but each engine also checks a PER-ENGINE global switch inside the function and no-ops
-- when disabled. The switches below are seeded DISABLED, so nothing runs until each is deliberately
-- turned on:
--   UPDATE public.automation_engine_switches SET enabled = true WHERE engine = 'router';
--   UPDATE public.automation_engine_switches SET enabled = true WHERE engine = 'executor';
-- Gate-inside-the-function (not gate-at-the-schedule) was chosen so a mid-incident kill is one
-- UPDATE with instant effect and no re-scheduling. This is independent of the per-ORG
-- organizations.automations_enabled switch: this stops an entire engine across all orgs.
--
-- Idempotent: unschedule-first (so re-apply, or a job the Lovable dashboard created out-of-git,
-- does not double-schedule) and the table/seed use IF NOT EXISTS / ON CONFLICT DO NOTHING so a
-- re-apply never resets a switch an operator has since turned on.
-- ============================================================

-- 1. Per-engine kill-switch table.
CREATE TABLE IF NOT EXISTS public.automation_engine_switches (
  engine     text PRIMARY KEY CHECK (engine IN ('router', 'executor')),
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seeded DISABLED. ON CONFLICT DO NOTHING so re-applying never flips an engine an operator enabled.
INSERT INTO public.automation_engine_switches (engine, enabled) VALUES
  ('router', false),
  ('executor', false)
ON CONFLICT (engine) DO NOTHING;

-- Read-only helper the edge functions call. SECURITY DEFINER so the service-role worker reads the
-- switch regardless of RLS; fail-closed by construction (COALESCE to false if the row is missing).
CREATE OR REPLACE FUNCTION public.automation_engine_enabled(_engine text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.automation_engine_switches WHERE engine = _engine),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.automation_engine_enabled(text) FROM public, anon;

-- RLS: only org staff may read the switches from the app; the functions use the service role.
ALTER TABLE public.automation_engine_switches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read automation engine switches" ON public.automation_engine_switches;
CREATE POLICY "authenticated read automation engine switches"
  ON public.automation_engine_switches FOR SELECT TO authenticated
  USING (true);

-- 2. Schedule both engines. Cadence: the router drains events every 5 minutes; the executor
-- advances due workflow steps every 5 minutes. Both send the service-role bearer the functions
-- require (FUN-2 gating), same net.http_post pattern as the live chaser crons (20260706211705).
DO $$ BEGIN PERFORM cron.unschedule('process-automation-events'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('workflow-tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'process-automation-events',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-automation-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'workflow-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/workflow-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
