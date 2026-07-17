CREATE TABLE IF NOT EXISTS public.automation_engine_switches (
  engine     text PRIMARY KEY CHECK (engine IN ('router', 'executor')),
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.automation_engine_switches (engine, enabled) VALUES
  ('router', false),
  ('executor', false)
ON CONFLICT (engine) DO NOTHING;

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

GRANT SELECT ON public.automation_engine_switches TO authenticated;
GRANT ALL ON public.automation_engine_switches TO service_role;

ALTER TABLE public.automation_engine_switches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read automation engine switches" ON public.automation_engine_switches;
CREATE POLICY "authenticated read automation engine switches"
  ON public.automation_engine_switches FOR SELECT TO authenticated
  USING (true);

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