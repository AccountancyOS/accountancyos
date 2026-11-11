-- Phase 1: Audit Log & Permission Infrastructure
-- ================================================

-- 1.1 Extend audit_log table with additional columns
ALTER TABLE audit_log 
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS before_state JSONB,
  ADD COLUMN IF NOT EXISTS after_state JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 1.2 Create org_settings table for configurable defaults
CREATE TABLE IF NOT EXISTS org_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Automation settings
  automation_rule_management_mode TEXT DEFAULT 'owner_admin_manager' CHECK (automation_rule_management_mode IN ('owner_admin_only', 'owner_admin_manager')),
  automation_max_actions_per_rule_hour INTEGER DEFAULT 25,
  automation_max_actions_per_rule_day INTEGER DEFAULT 150,
  automation_max_actions_org_hour INTEGER DEFAULT 250,
  automation_max_actions_org_day INTEGER DEFAULT 1500,
  -- Invoice settings
  invoice_number_prefix TEXT DEFAULT 'INV-',
  invoice_number_next INTEGER DEFAULT 1,
  invoice_number_padding INTEGER DEFAULT 6,
  -- Bill settings
  bill_number_prefix TEXT DEFAULT 'BILL-',
  bill_number_next INTEGER DEFAULT 1,
  bill_number_padding INTEGER DEFAULT 6,
  -- Email settings
  shared_mailbox_enabled BOOLEAN DEFAULT false,
  email_default_mode TEXT DEFAULT 'draft_by_default' CHECK (email_default_mode IN ('draft_by_default', 'send_by_default')),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on org_settings
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for org_settings
CREATE POLICY "org_settings_select_org" ON org_settings
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "org_settings_insert_owner_admin" ON org_settings
  FOR INSERT WITH CHECK (
    user_in_organization(auth.uid(), organization_id)
    AND user_has_role_at_least(auth.uid(), organization_id, 'admin')
  );

CREATE POLICY "org_settings_update_owner_admin" ON org_settings
  FOR UPDATE USING (
    user_in_organization(auth.uid(), organization_id)
    AND user_has_role_at_least(auth.uid(), organization_id, 'admin')
  );

-- 1.3 Create automation_rate_limits table for safety tracking
CREATE TABLE IF NOT EXISTS automation_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('hour', 'day')),
  action_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, automation_rule_id, window_start, window_type)
);

-- Enable RLS
ALTER TABLE automation_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_rate_limits_select_org" ON automation_rate_limits
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

-- 1.4 Create user_saved_views table for Jobs page saved views
CREATE TABLE IF NOT EXISTS user_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('jobs', 'deadlines', 'clients', 'invoices', 'bills', 'emails')),
  filters JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_saved_views_select_own" ON user_saved_views
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_saved_views_insert_own" ON user_saved_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_saved_views_update_own" ON user_saved_views
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_saved_views_delete_own" ON user_saved_views
  FOR DELETE USING (auth.uid() = user_id);

-- 1.5 Helper function to write audit logs (used by all safe RPCs)
CREATE OR REPLACE FUNCTION write_audit_log(
  p_org_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_field_name TEXT DEFAULT NULL,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Get user's role in org
  SELECT role INTO v_user_role
  FROM organization_users
  WHERE user_id = v_user_id AND organization_id = p_org_id;
  
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    field_name,
    old_value,
    new_value,
    user_id,
    actor_role,
    before_state,
    after_state,
    metadata
  ) VALUES (
    p_org_id,
    p_entity_type,
    p_entity_id,
    p_action,
    p_field_name,
    p_old_value,
    p_new_value,
    v_user_id,
    v_user_role,
    p_before_state,
    p_after_state,
    p_metadata
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- 1.6 Permission check functions for new capabilities
CREATE OR REPLACE FUNCTION can_issue_invoices(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

CREATE OR REPLACE FUNCTION can_void_unpaid_invoices(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

CREATE OR REPLACE FUNCTION can_void_paid_invoices(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_has_role_at_least(_user_id, _org_id, 'admin')
$$;

CREATE OR REPLACE FUNCTION can_override_invoice_lock(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_has_role_at_least(_user_id, _org_id, 'admin')
$$;

CREATE OR REPLACE FUNCTION can_manage_automation_rules_check(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
BEGIN
  -- Get org setting
  SELECT automation_rule_management_mode INTO v_mode
  FROM org_settings
  WHERE organization_id = _org_id;
  
  -- Default to owner_admin_manager if no setting
  IF v_mode IS NULL THEN
    v_mode := 'owner_admin_manager';
  END IF;
  
  IF v_mode = 'owner_admin_only' THEN
    RETURN user_has_role_at_least(_user_id, _org_id, 'admin');
  ELSE
    RETURN user_has_role_at_least(_user_id, _org_id, 'manager');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION can_access_shared_mailbox(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT shared_mailbox_enabled INTO v_enabled
  FROM org_settings
  WHERE organization_id = _org_id;
  
  IF v_enabled IS NOT TRUE THEN
    RETURN FALSE;
  END IF;
  
  -- Staff+ can access shared mailbox when enabled
  RETURN user_has_role_at_least(_user_id, _org_id, 'staff');
END;
$$;

-- 1.7 Function to ensure org_settings exists (creates default if missing)
CREATE OR REPLACE FUNCTION ensure_org_settings(_org_id UUID)
RETURNS org_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings org_settings;
BEGIN
  SELECT * INTO v_settings FROM org_settings WHERE organization_id = _org_id;
  
  IF v_settings.organization_id IS NULL THEN
    INSERT INTO org_settings (organization_id)
    VALUES (_org_id)
    RETURNING * INTO v_settings;
  END IF;
  
  RETURN v_settings;
END;
$$;

-- 1.8 Trigger to auto-create org_settings when organization is created
CREATE OR REPLACE FUNCTION create_org_settings_on_org_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO org_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_org_settings ON organizations;
CREATE TRIGGER trigger_create_org_settings
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION create_org_settings_on_org_create();