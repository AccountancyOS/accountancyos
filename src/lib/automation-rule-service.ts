import { supabase } from "@/integrations/supabase/client";

export interface CreateAutomationRuleResult {
  success: boolean;
  rule_id?: string;
  error?: string;
}

export interface UpdateAutomationRuleResult {
  success: boolean;
  rule_id?: string;
  error?: string;
}

export interface ToggleAutomationRuleResult {
  success: boolean;
  rule_id?: string;
  is_active?: boolean;
  error?: string;
}

export interface DeleteAutomationRuleResult {
  success: boolean;
  rule_id?: string;
  error?: string;
}

export interface AutomationRuleInput {
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  isActive?: boolean;
  emailMode?: string;
}

export async function createAutomationRuleSafe(
  organizationId: string,
  input: AutomationRuleInput
): Promise<CreateAutomationRuleResult> {
  const { data, error } = await supabase.rpc('create_automation_rule_safe', {
    p_organization_id: organizationId,
    p_name: input.name,
    p_trigger_type: input.triggerType,
    p_trigger_config: input.triggerConfig as unknown as Record<string, never>,
    p_action_type: input.actionType,
    p_action_config: input.actionConfig as unknown as Record<string, never>,
    p_is_active: input.isActive ?? true,
    p_email_mode: input.emailMode || 'draft'
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as CreateAutomationRuleResult;
}

export async function updateAutomationRuleSafe(
  ruleId: string,
  input: Partial<AutomationRuleInput>
): Promise<UpdateAutomationRuleResult> {
  const { data, error } = await supabase.rpc('update_automation_rule_safe', {
    p_rule_id: ruleId,
    p_name: input.name || null,
    p_trigger_type: input.triggerType || null,
    p_trigger_config: input.triggerConfig ? input.triggerConfig as unknown as Record<string, never> : null,
    p_action_type: input.actionType || null,
    p_action_config: input.actionConfig ? input.actionConfig as unknown as Record<string, never> : null,
    p_is_active: input.isActive ?? null,
    p_email_mode: input.emailMode || null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as UpdateAutomationRuleResult;
}

export async function toggleAutomationRuleSafe(
  ruleId: string,
  isActive: boolean
): Promise<ToggleAutomationRuleResult> {
  const { data, error } = await supabase.rpc('toggle_automation_rule_safe', {
    p_rule_id: ruleId,
    p_is_active: isActive
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as ToggleAutomationRuleResult;
}

export async function deleteAutomationRuleSafe(
  ruleId: string
): Promise<DeleteAutomationRuleResult> {
  const { data, error } = await supabase.rpc('delete_automation_rule_safe', {
    p_rule_id: ruleId
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as DeleteAutomationRuleResult;
}
