
-- ============================================================================
-- Phase 1: Automation Library Database Tables
-- 8 new tables + message_templates extensions + RLS + indexes
--
-- DOMAIN ROUTING NOTE (restriction 7): Legacy automation_rules coexists.
-- When the workflow engine handles a domain, the legacy process-automation-events
-- edge function must NOT also fire for that domain. Routing logic is in Phase 3.
-- ============================================================================

-- 1. automation_trigger_contracts (GLOBAL, LOCKED)
CREATE TABLE public.automation_trigger_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  payload_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_trigger_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read trigger contracts"
  ON public.automation_trigger_contracts FOR SELECT
  TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies = service-role only write

-- 2. automation_library_sets (GLOBAL, LOCKED)
CREATE TABLE public.automation_library_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  version text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_library_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read library sets"
  ON public.automation_library_sets FOR SELECT
  TO authenticated USING (true);

-- 3. automation_workflow_templates (org_id NULL = global/seeded)
CREATE TABLE public.automation_workflow_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_set_id uuid REFERENCES public.automation_library_sets(id) ON DELETE SET NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  service_type text,
  applies_to_client_types text[] DEFAULT '{}',
  default_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_workflow_templates ENABLE ROW LEVEL SECURITY;
-- Global templates (org_id IS NULL) readable by all authenticated
CREATE POLICY "Authenticated users can read global workflow templates"
  ON public.automation_workflow_templates FOR SELECT
  TO authenticated USING (
    org_id IS NULL
    OR org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE for global templates (service-role only)
-- Org-scoped templates managed by org members (future feature)

-- 4. automation_workflow_steps
CREATE TABLE public.automation_workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.automation_workflow_templates(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  step_type text NOT NULL, -- validated at app layer: CREATE_JOB, CREATE_DEADLINE, SEND_EMAIL, etc.
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_blocking boolean NOT NULL DEFAULT false,
  is_optional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read workflow steps"
  ON public.automation_workflow_steps FOR SELECT
  TO authenticated USING (
    template_id IN (
      SELECT id FROM public.automation_workflow_templates
      WHERE org_id IS NULL
        OR org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
    )
  );
CREATE INDEX idx_workflow_steps_template_order ON public.automation_workflow_steps (template_id, step_order);

-- 5. automation_workflow_trigger_map (GLOBAL, LOCKED)
CREATE TABLE public.automation_workflow_trigger_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_template_id uuid NOT NULL REFERENCES public.automation_workflow_templates(id) ON DELETE CASCADE,
  trigger_contract_id uuid NOT NULL REFERENCES public.automation_trigger_contracts(id) ON DELETE CASCADE,
  filter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_workflow_trigger_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read trigger map"
  ON public.automation_workflow_trigger_map FOR SELECT
  TO authenticated USING (true);

-- 6. automation_workflow_instances (PER-ORG)
CREATE TABLE public.automation_workflow_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES public.automation_workflow_templates(id) ON DELETE CASCADE,
  service_id uuid,
  period_key text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  current_step_id uuid REFERENCES public.automation_workflow_steps(id) ON DELETE SET NULL,
  next_run_at timestamptz,
  waiting_for_event_key text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggering_event_key text NOT NULL,
  triggering_event_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_workflow_instances ENABLE ROW LEVEL SECURITY;

-- Strict unique constraint using COALESCE sentinel for nullable columns (restriction 4, 19)
CREATE UNIQUE INDEX idx_workflow_instances_unique
  ON public.automation_workflow_instances (
    org_id,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'),
    template_id,
    period_key,
    COALESCE(service_id, '00000000-0000-0000-0000-000000000000')
  );

-- Orchestrator tick query index
CREATE INDEX idx_workflow_instances_tick
  ON public.automation_workflow_instances (status, next_run_at)
  WHERE status IN ('QUEUED', 'RUNNING');

-- Event advancement lookup index
CREATE INDEX idx_workflow_instances_waiting
  ON public.automation_workflow_instances (waiting_for_event_key)
  WHERE waiting_for_event_key IS NOT NULL;

-- RLS: org members only
CREATE POLICY "Org members can read workflow instances"
  ON public.automation_workflow_instances FOR SELECT
  TO authenticated USING (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can insert workflow instances"
  ON public.automation_workflow_instances FOR INSERT
  TO authenticated WITH CHECK (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can update workflow instances"
  ON public.automation_workflow_instances FOR UPDATE
  TO authenticated USING (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );

-- 7. automation_workflow_events (IMMUTABLE AUDIT LOG)
CREATE TABLE public.automation_workflow_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.automation_workflow_instances(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.automation_workflow_steps(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_workflow_events ENABLE ROW LEVEL SECURITY;
-- INSERT only, no UPDATE/DELETE (restriction 15)
CREATE POLICY "Org members can read workflow events"
  ON public.automation_workflow_events FOR SELECT
  TO authenticated USING (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can insert workflow events"
  ON public.automation_workflow_events FOR INSERT
  TO authenticated WITH CHECK (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
-- Explicitly NO UPDATE or DELETE policies

-- 8. automation_org_overrides (PER-ORG DIFFS ONLY)
-- Contains ONLY: enabled, timing, messages, channels, assignments, optional step toggles
-- Does NOT contain: trigger_type, trigger_config, trigger_map (restriction 2)
CREATE TABLE public.automation_org_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.automation_workflow_templates(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  timing_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_template_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignment_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  optional_step_toggles jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, template_id)
);
ALTER TABLE public.automation_org_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read org overrides"
  ON public.automation_org_overrides FOR SELECT
  TO authenticated USING (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can insert org overrides"
  ON public.automation_org_overrides FOR INSERT
  TO authenticated WITH CHECK (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can update org overrides"
  ON public.automation_org_overrides FOR UPDATE
  TO authenticated USING (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );
CREATE POLICY "Org members can delete org overrides"
  ON public.automation_org_overrides FOR DELETE
  TO authenticated USING (
    org_id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- Extensions to message_templates
-- ============================================================================
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variables_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL;

-- ============================================================================
-- Updated_at triggers for new tables
-- ============================================================================
CREATE TRIGGER update_automation_trigger_contracts_updated_at
  BEFORE UPDATE ON public.automation_trigger_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_library_sets_updated_at
  BEFORE UPDATE ON public.automation_library_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_workflow_templates_updated_at
  BEFORE UPDATE ON public.automation_workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_workflow_steps_updated_at
  BEFORE UPDATE ON public.automation_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_workflow_instances_updated_at
  BEFORE UPDATE ON public.automation_workflow_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_org_overrides_updated_at
  BEFORE UPDATE ON public.automation_org_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
