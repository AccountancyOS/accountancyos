-- Phase 3: SLA Engine Tables and Practice Settings

-- Create SLA definitions table
CREATE TABLE IF NOT EXISTS public.sla_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sla_type TEXT NOT NULL CHECK (sla_type IN ('client_email', 'in_app_message', 'internal_message', 'job', 'task')),
  job_type TEXT,
  service_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  trigger_status TEXT,
  pause_conditions JSONB DEFAULT '[]'::JSONB,
  stop_conditions JSONB DEFAULT '[]'::JSONB,
  default_duration_hours INTEGER NOT NULL,
  urgent_duration_hours INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create SLA instances table
CREATE TABLE IF NOT EXISTS public.sla_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sla_definition_id UUID REFERENCES public.sla_definitions(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('email', 'message', 'job', 'task', 'conversation')),
  entity_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  paused_at TIMESTAMPTZ,
  paused_total_seconds INTEGER DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  breached BOOLEAN DEFAULT false,
  breached_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'breached')),
  compressed BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add practice settings for SLA configuration
ALTER TABLE public.org_settings 
  ADD COLUMN IF NOT EXISTS business_hours_start TIME DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS business_hours_end TIME DEFAULT '17:30',
  ADD COLUMN IF NOT EXISTS business_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  ADD COLUMN IF NOT EXISTS deadline_buffer_days_vat INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS deadline_buffer_days_sa INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS deadline_buffer_days_ct INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS sla_email_response_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS sla_portal_message_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS sla_internal_message_hours INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS sla_task_default_hours INTEGER DEFAULT 72,
  ADD COLUMN IF NOT EXISTS sla_task_urgent_hours INTEGER DEFAULT 24;

-- Add notification dismissal columns (Phase 6.1)
ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- RLS for sla_definitions
ALTER TABLE public.sla_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org SLA definitions"
  ON public.sla_definitions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage SLA definitions"
  ON public.sla_definitions FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- RLS for sla_instances
ALTER TABLE public.sla_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org SLA instances"
  ON public.sla_instances FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage SLA instances"
  ON public.sla_instances FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users 
      WHERE user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sla_definitions_org ON public.sla_definitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_sla_definitions_type ON public.sla_definitions(sla_type);
CREATE INDEX IF NOT EXISTS idx_sla_instances_org ON public.sla_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_sla_instances_entity ON public.sla_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sla_instances_status ON public.sla_instances(status);
CREATE INDEX IF NOT EXISTS idx_sla_instances_due ON public.sla_instances(due_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sla_instances_breached ON public.sla_instances(organization_id) WHERE breached = true;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_sla_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sla_definitions_timestamp ON public.sla_definitions;
CREATE TRIGGER update_sla_definitions_timestamp
  BEFORE UPDATE ON public.sla_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_sla_definitions_updated_at();