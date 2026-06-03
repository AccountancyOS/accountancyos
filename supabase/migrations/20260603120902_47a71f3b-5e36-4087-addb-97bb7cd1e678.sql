
-- Phase 4: Onboarding audit trail, transition guard, and duplicate-prevention helpers

-- 1) Audit events table
CREATE TABLE public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES public.onboarding_applications(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_user_id uuid,
  actor_kind text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_events_app ON public.onboarding_events (application_id, created_at DESC);
CREATE INDEX idx_onboarding_events_org ON public.onboarding_events (organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.onboarding_events TO authenticated;
GRANT ALL ON public.onboarding_events TO service_role;

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_onboarding_events"
ON public.onboarding_events FOR SELECT
TO authenticated
USING (user_has_organization_access(organization_id));

CREATE POLICY "members_insert_onboarding_events"
ON public.onboarding_events FOR INSERT
TO authenticated
WITH CHECK (user_has_organization_access(organization_id));

-- 2) Helper to log an event (SECURITY DEFINER so public RPCs can call it)
CREATE OR REPLACE FUNCTION public.log_onboarding_event(
  p_application_id uuid,
  p_event_type text,
  p_from_status text DEFAULT NULL,
  p_to_status text DEFAULT NULL,
  p_actor_kind text DEFAULT 'system',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_event_id uuid;
BEGIN
  SELECT organization_id INTO v_org
  FROM onboarding_applications WHERE id = p_application_id;

  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO onboarding_events (
    organization_id, application_id, event_type, from_status, to_status,
    actor_user_id, actor_kind, metadata
  ) VALUES (
    v_org, p_application_id, p_event_type, p_from_status, p_to_status,
    auth.uid(), p_actor_kind, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- 3) Status-change auto-audit trigger on onboarding_applications
CREATE OR REPLACE FUNCTION public.tg_onboarding_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO onboarding_events (
      organization_id, application_id, event_type, from_status, to_status,
      actor_user_id, actor_kind, metadata
    ) VALUES (
      NEW.organization_id, NEW.id, 'status_changed',
      OLD.status, NEW.status,
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
      jsonb_build_object('at', now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_status_audit ON public.onboarding_applications;
CREATE TRIGGER trg_onboarding_status_audit
AFTER UPDATE OF status ON public.onboarding_applications
FOR EACH ROW EXECUTE FUNCTION public.tg_onboarding_status_audit();

-- 4) Idempotent client document folder helper
CREATE OR REPLACE FUNCTION public.ensure_client_document_folder(
  p_client_id uuid,
  p_folder_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_id uuid;
  v_org uuid;
BEGIN
  IF p_client_id IS NULL OR p_folder_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Tolerate absence of document_folders table to avoid breaking environments
  IF to_regclass('public.document_folders') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT organization_id INTO v_org FROM clients WHERE id = p_client_id;
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE format(
    'SELECT id FROM public.document_folders
       WHERE client_id = %L AND lower(name) = lower(%L)
       LIMIT 1', p_client_id, p_folder_name
  ) INTO v_folder_id;

  IF v_folder_id IS NOT NULL THEN
    RETURN v_folder_id;
  END IF;

  EXECUTE format(
    'INSERT INTO public.document_folders (organization_id, client_id, name)
       VALUES (%L, %L, %L) RETURNING id',
     v_org, p_client_id, p_folder_name
  ) INTO v_folder_id;

  RETURN v_folder_id;
END;
$$;
