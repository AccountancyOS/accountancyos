-- Phase 3 reliability columns on workflow instances
ALTER TABLE public.automation_workflow_instances
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_retry
  ON public.automation_workflow_instances (next_retry_at)
  WHERE next_retry_at IS NOT NULL AND dead_lettered_at IS NULL;

-- Phase 4 kill switches: per-category enable + org-wide master
CREATE TABLE IF NOT EXISTS public.automation_category_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_category_settings TO authenticated;
GRANT ALL ON public.automation_category_settings TO service_role;

ALTER TABLE public.automation_category_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_category_settings"
  ON public.automation_category_settings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid()));

CREATE POLICY "org_members_upsert_category_settings"
  ON public.automation_category_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid()));

CREATE POLICY "org_members_update_category_settings"
  ON public.automation_category_settings FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid()));

CREATE POLICY "org_members_delete_category_settings"
  ON public.automation_category_settings FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid()));

-- Org-wide master kill switch (organizations table already exists)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS automations_enabled boolean NOT NULL DEFAULT true;

-- Workflow run lifecycle RPCs (parity with chaser runs)
CREATE OR REPLACE FUNCTION public.pause_workflow_instance(p_instance_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.automation_workflow_instances
     SET status = 'PAUSED', paused_at = now(), last_error = COALESCE(p_reason, last_error), updated_at = now()
   WHERE id = p_instance_id
     AND org_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_workflow_instance(p_instance_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.automation_workflow_instances
     SET status = 'QUEUED', paused_at = NULL, next_run_at = COALESCE(next_run_at, now()), updated_at = now()
   WHERE id = p_instance_id
     AND status = 'PAUSED'
     AND org_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workflow_instance(p_instance_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.automation_workflow_instances
     SET status = 'CANCELLED', cancelled_at = now(), last_error = COALESCE(p_reason, last_error), updated_at = now()
   WHERE id = p_instance_id
     AND status NOT IN ('CANCELLED', 'COMPLETED')
     AND org_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.pause_workflow_instance(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.resume_workflow_instance(uuid) FROM public;
REVOKE ALL ON FUNCTION public.cancel_workflow_instance(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pause_workflow_instance(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_workflow_instance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_workflow_instance(uuid, text) TO authenticated;