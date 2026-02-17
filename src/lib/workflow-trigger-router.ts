/**
 * Workflow Trigger Router
 * 
 * Routes incoming automation events to matching workflow templates
 * by looking up trigger contracts and trigger maps.
 * This is the bridge between legacy automation_events and the new
 * workflow orchestration system.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface TriggerPayload {
  triggerKey: string;
  organizationId: string;
  clientId?: string;
  companyId?: string;
  serviceId?: string;
  periodKey: string;
  eventId?: string;
  context: Record<string, unknown>;
}

interface TriggerMapRow {
  id: string;
  workflow_template_id: string;
  trigger_contract_id: string;
  filter_config: Record<string, unknown>;
}

interface WorkflowTemplateRow {
  id: string;
  key: string;
  name: string;
  default_enabled: boolean;
  service_type: string | null;
  applies_to_client_types: string[] | null;
  org_id: string | null;
}

interface OrgOverrideRow {
  enabled: boolean;
}

/**
 * Evaluate filter_config against the trigger payload context.
 * filter_config uses structured conditions like:
 *   { "service_type": "corporation_tax", "client_type": "limited_company" }
 * All conditions must match (AND logic).
 */
function matchesFilter(
  filterConfig: Record<string, unknown>,
  payload: TriggerPayload
): boolean {
  if (!filterConfig || Object.keys(filterConfig).length === 0) return true;

  for (const [key, expected] of Object.entries(filterConfig)) {
    const actual = payload.context[key];
    if (expected !== undefined && expected !== null && actual !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * Find all workflow templates that should be instantiated for a given trigger.
 * Steps:
 * 1. Look up trigger contract by key
 * 2. Find all trigger_map entries for that contract
 * 3. Filter by filter_config
 * 4. Check org override (enabled/disabled)
 * 5. Check template default_enabled
 * 6. Return template IDs to instantiate
 */
export async function findMatchingWorkflows(
  payload: TriggerPayload
): Promise<string[]> {
  // 1. Find trigger contract
  const { data: contract, error: contractErr } = await supabase
    .from("automation_trigger_contracts")
    .select("id")
    .eq("key", payload.triggerKey)
    .eq("is_active", true)
    .maybeSingle();

  if (contractErr || !contract) return [];

  // 2. Find trigger maps
  const { data: maps, error: mapErr } = await supabase
    .from("automation_workflow_trigger_map")
    .select("id, workflow_template_id, trigger_contract_id, filter_config")
    .eq("trigger_contract_id", contract.id);

  if (mapErr || !maps || maps.length === 0) return [];

  const typedMaps: TriggerMapRow[] = maps.map((m) => ({
    id: m.id,
    workflow_template_id: m.workflow_template_id,
    trigger_contract_id: m.trigger_contract_id,
    filter_config: (m.filter_config || {}) as Record<string, unknown>,
  }));

  // 3. Filter by filter_config
  const matchingTemplateIds = typedMaps
    .filter((m) => matchesFilter(m.filter_config, payload))
    .map((m) => m.workflow_template_id);

  if (matchingTemplateIds.length === 0) return [];

  // 4. Fetch templates
  const { data: templates, error: tplErr } = await supabase
    .from("automation_workflow_templates")
    .select("id, key, name, default_enabled, service_type, applies_to_client_types, org_id")
    .in("id", matchingTemplateIds);

  if (tplErr || !templates) return [];

  // 5. Check org overrides and default_enabled
  const result: string[] = [];

  for (const tpl of templates) {
    // Skip org-specific templates that don't belong to this org
    if (tpl.org_id && tpl.org_id !== payload.organizationId) continue;

    // Check org override
    const { data: override } = await supabase
      .from("automation_org_overrides")
      .select("enabled")
      .eq("org_id", payload.organizationId)
      .eq("template_id", tpl.id)
      .maybeSingle();

    const isEnabled = override ? (override as OrgOverrideRow).enabled : tpl.default_enabled;
    if (!isEnabled) continue;

    result.push(tpl.id);
  }

  return result;
}

/**
 * Create a workflow instance for a matched template.
 * Uses the idempotency unique constraint to prevent duplicates.
 */
export async function createWorkflowInstance(
  templateId: string,
  payload: TriggerPayload
): Promise<{ instanceId: string | null; error: string | null; duplicate: boolean }> {
  // Get first step
  const { data: firstStep } = await supabase
    .from("automation_workflow_steps")
    .select("id")
    .eq("template_id", templateId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("automation_workflow_instances")
    .insert({
      org_id: payload.organizationId,
      template_id: templateId,
      client_id: payload.clientId || null,
      company_id: payload.companyId || null,
      service_id: payload.serviceId || null,
      period_key: payload.periodKey,
      triggering_event_key: payload.triggerKey,
      triggering_event_id: payload.eventId || null,
      status: "running",
      current_step_id: firstStep?.id || null,
      context: payload.context as Json,
      next_run_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Check for unique constraint violation (duplicate)
    if (error.code === "23505") {
      return { instanceId: null, error: null, duplicate: true };
    }
    return { instanceId: null, error: error.message, duplicate: false };
  }

  // Log creation event
  await supabase.from("automation_workflow_events").insert({
    instance_id: data.id,
    org_id: payload.organizationId,
    event_type: "instance_created",
    payload: {
      trigger_key: payload.triggerKey,
      template_id: templateId,
      context: payload.context,
    } as Json,
  });

  return { instanceId: data.id, error: null, duplicate: false };
}

/**
 * Route a trigger event: find matching workflows and create instances.
 */
export async function routeTriggerEvent(
  payload: TriggerPayload
): Promise<{ created: number; duplicates: number; errors: string[] }> {
  const templateIds = await findMatchingWorkflows(payload);
  let created = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const templateId of templateIds) {
    const result = await createWorkflowInstance(templateId, payload);
    if (result.duplicate) {
      duplicates++;
    } else if (result.error) {
      errors.push(result.error);
    } else {
      created++;
    }
  }

  return { created, duplicates, errors };
}
