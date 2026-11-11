
-- Phase 8A: Automation Engine - Executions & Events Tables
-- =========================================================

-- 1. Create automation_executions table for logging all automation runs
CREATE TABLE public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  triggered_by_entity TEXT NOT NULL, -- 'job', 'deadline', 'client', 'filing', 'onboarding'
  triggered_by_id UUID NOT NULL,
  execution_hash TEXT, -- for idempotency: {rule_id}:{entity_id}:{event_timestamp}
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  error_message TEXT,
  action_result JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for idempotency - prevents double-firing
CREATE UNIQUE INDEX automation_executions_hash_idx 
  ON public.automation_executions(automation_rule_id, execution_hash) 
  WHERE execution_hash IS NOT NULL;

-- Index for querying by organization and status
CREATE INDEX automation_executions_org_status_idx 
  ON public.automation_executions(organization_id, status);

-- Index for querying by rule
CREATE INDEX automation_executions_rule_idx 
  ON public.automation_executions(automation_rule_id);

-- Enable RLS
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "org_users_can_view_executions" 
  ON public.automation_executions 
  FOR SELECT 
  USING (user_has_organization_access(organization_id));

CREATE POLICY "org_users_can_insert_executions" 
  ON public.automation_executions 
  FOR INSERT 
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "org_users_can_update_executions" 
  ON public.automation_executions 
  FOR UPDATE 
  USING (user_has_organization_access(organization_id));

-- 2. Create automation_events table for event queue
CREATE TABLE public.automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'job_status_change', 'deadline_approaching', 'client_onboarded', 'filing_status_change'
  entity_type TEXT NOT NULL, -- 'job', 'deadline', 'client', 'filing', 'onboarding'
  entity_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}', -- additional context
  processed_at TIMESTAMPTZ,
  processed_by_execution_id UUID REFERENCES public.automation_executions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for finding unprocessed events efficiently
CREATE INDEX automation_events_unprocessed_idx 
  ON public.automation_events(organization_id, event_type, created_at) 
  WHERE processed_at IS NULL;

-- Index for querying by entity
CREATE INDEX automation_events_entity_idx 
  ON public.automation_events(entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "org_users_can_view_events" 
  ON public.automation_events 
  FOR SELECT 
  USING (user_has_organization_access(organization_id));

CREATE POLICY "org_users_can_insert_events" 
  ON public.automation_events 
  FOR INSERT 
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "org_users_can_update_events" 
  ON public.automation_events 
  FOR UPDATE 
  USING (user_has_organization_access(organization_id));

-- 3. Add trigger_conditions column to automation_rules if not exists
-- (checking existing schema - automation_rules already has trigger_config which serves this purpose)

-- 4. Create helper function for emitting automation events
CREATE OR REPLACE FUNCTION public.emit_automation_event(
  p_organization_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.automation_events (
    organization_id,
    event_type,
    entity_type,
    entity_id,
    old_value,
    new_value,
    metadata
  ) VALUES (
    p_organization_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_old_value,
    p_new_value,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- 5. Create function to check idempotency before execution
CREATE OR REPLACE FUNCTION public.can_execute_automation(
  p_rule_id UUID,
  p_execution_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if execution with this hash already exists
  RETURN NOT EXISTS (
    SELECT 1 
    FROM public.automation_executions 
    WHERE automation_rule_id = p_rule_id 
      AND execution_hash = p_execution_hash
  );
END;
$$;

-- 6. Create function to record automation execution
CREATE OR REPLACE FUNCTION public.record_automation_execution(
  p_organization_id UUID,
  p_rule_id UUID,
  p_triggered_by_entity TEXT,
  p_triggered_by_id UUID,
  p_execution_hash TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_action_result JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execution_id UUID;
BEGIN
  INSERT INTO public.automation_executions (
    organization_id,
    automation_rule_id,
    triggered_by_entity,
    triggered_by_id,
    execution_hash,
    status,
    error_message,
    action_result,
    executed_at
  ) VALUES (
    p_organization_id,
    p_rule_id,
    p_triggered_by_entity,
    p_triggered_by_id,
    p_execution_hash,
    p_status,
    p_error_message,
    p_action_result,
    CASE WHEN p_status IN ('success', 'failed') THEN now() ELSE NULL END
  )
  ON CONFLICT (automation_rule_id, execution_hash) 
  WHERE execution_hash IS NOT NULL
  DO UPDATE SET
    status = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    action_result = EXCLUDED.action_result,
    executed_at = CASE WHEN EXCLUDED.status IN ('success', 'failed') THEN now() ELSE automation_executions.executed_at END
  RETURNING id INTO v_execution_id;
  
  RETURN v_execution_id;
END;
$$;
