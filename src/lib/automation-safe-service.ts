import { supabase } from "@/integrations/supabase/client";

export interface DryRunResult {
  success: boolean;
  would_trigger?: boolean;
  trigger_reason?: string;
  resolved_placeholders?: Record<string, unknown>;
  actions_would_execute?: Array<{ action_type: string; action_config: Record<string, unknown>; email_mode: string; }>;
  rule_name?: string;
  email_mode?: string;
  error?: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  rule_hour_count: number;
  rule_hour_limit: number;
  rule_day_count: number;
  rule_day_limit: number;
  org_hour_count: number;
  org_hour_limit: number;
  org_day_count: number;
  org_day_limit: number;
}

export async function automationDryRun(
  ruleId: string,
  sampleEvent?: { event_type: string; entity_type?: string; entity_id?: string; }
): Promise<DryRunResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase.rpc('automation_dry_run', {
    p_rule_id: ruleId,
    p_user_id: user.id,
    p_sample_event: sampleEvent ? (sampleEvent as unknown as Record<string, never>) : null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as DryRunResult;
}

export async function checkAutomationRateLimit(organizationId: string, ruleId?: string): Promise<RateLimitCheckResult | null> {
  const { data, error } = await supabase.rpc('check_automation_rate_limit', {
    p_organization_id: organizationId,
    p_rule_id: ruleId || null
  });
  if (error) return null;
  return data as unknown as RateLimitCheckResult;
}

export async function getAutomationExecutionHistory(organizationId: string, ruleId?: string, limit: number = 50) {
  let query = supabase
    .from('automation_executions')
    .select(`*, automation_rules (name, trigger_type, action_type)`)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ruleId) query = query.eq('automation_rule_id', ruleId);
  const { data, error } = await query;
  if (error) return [];
  return data;
}

export async function getAutomationRulesWithStats(organizationId: string) {
  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name');

  if (error) return [];
  return rules || [];
}
