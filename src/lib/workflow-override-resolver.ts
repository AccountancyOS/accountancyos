/**
 * Workflow Override Resolver
 * 
 * Resolves org-specific overrides for workflow templates.
 * Merges template defaults with org overrides for timing,
 * message templates, channels, assignments, and optional step toggles.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface ResolvedTimingOverride {
  /** Offset in days from the base date (positive = after, negative = before) */
  offsetDays?: number;
  /** Specific time of day to execute (HH:MM) */
  timeOfDay?: string;
}

export interface ResolvedStepConfig {
  stepId: string;
  /** Stable semantic identifier for override lookups */
  stepKey: string;
  stepType: string;
  stepOrder: number;
  isOptional: boolean;
  isBlocking: boolean;
  /** Whether this optional step is enabled for this org */
  isEnabled: boolean;
  /** Base config from template */
  config: Record<string, unknown>;
  /** Resolved timing override */
  timingOverride?: ResolvedTimingOverride;
  /** Resolved message template ID override */
  messageTemplateId?: string;
  /** Resolved channel override */
  channel?: string;
  /** Resolved assignee override */
  assigneeUserId?: string;
  assigneeRole?: string;
}

interface OrgOverrideRow {
  enabled: boolean;
  timing_overrides: Record<string, unknown>;
  message_template_overrides: Record<string, unknown>;
  channel_overrides: Record<string, unknown>;
  assignment_overrides: Record<string, unknown>;
  optional_step_toggles: Record<string, boolean>;
}

/**
 * Fetch the org override for a template, if any.
 */
async function fetchOrgOverride(
  orgId: string,
  templateId: string
): Promise<OrgOverrideRow | null> {
  const { data, error } = await supabase
    .from("automation_org_overrides")
    .select("enabled, timing_overrides, message_template_overrides, channel_overrides, assignment_overrides, optional_step_toggles")
    .eq("org_id", orgId)
    .eq("template_id", templateId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    enabled: data.enabled,
    timing_overrides: (data.timing_overrides || {}) as Record<string, unknown>,
    message_template_overrides: (data.message_template_overrides || {}) as Record<string, unknown>,
    channel_overrides: (data.channel_overrides || {}) as Record<string, unknown>,
    assignment_overrides: (data.assignment_overrides || {}) as Record<string, unknown>,
    optional_step_toggles: (data.optional_step_toggles || {}) as Record<string, boolean>,
  };
}

/**
 * Resolve all steps for a workflow instance with org overrides applied.
 */
export async function resolveStepsWithOverrides(
  orgId: string,
  templateId: string
): Promise<ResolvedStepConfig[]> {
  // Fetch steps and override in parallel
  const [stepsResult, override] = await Promise.all([
    supabase
      .from("automation_workflow_steps")
      .select("id, step_key, step_type, step_order, config, is_optional, is_blocking")
      .eq("template_id", templateId)
      .order("step_order", { ascending: true }),
    fetchOrgOverride(orgId, templateId),
  ]);

  if (stepsResult.error || !stepsResult.data) return [];

  return stepsResult.data.map((step) => {
    const stepId = step.id;
    const stepKey = (step as any).step_key as string;
    const config = (step.config || {}) as Record<string, unknown>;
    const isOptional = step.is_optional;

    // Use step_key for all override lookups (not step.id)
    const lookupKey = stepKey || stepId;

    // Determine if optional step is enabled
    let isEnabled = true;
    if (isOptional && override?.optional_step_toggles) {
      const toggle = override.optional_step_toggles[lookupKey];
      if (toggle !== undefined) {
        isEnabled = toggle;
      }
    }

    // Resolve timing
    let timingOverride: ResolvedTimingOverride | undefined;
    if (override?.timing_overrides && override.timing_overrides[lookupKey]) {
      timingOverride = override.timing_overrides[lookupKey] as ResolvedTimingOverride;
    }

    // Resolve message template
    let messageTemplateId: string | undefined;
    if (override?.message_template_overrides && override.message_template_overrides[lookupKey]) {
      messageTemplateId = override.message_template_overrides[lookupKey] as string;
    }

    // Resolve channel
    let channel: string | undefined;
    if (override?.channel_overrides && override.channel_overrides[lookupKey]) {
      channel = override.channel_overrides[lookupKey] as string;
    }

    // Resolve assignment
    let assigneeUserId: string | undefined;
    let assigneeRole: string | undefined;
    if (override?.assignment_overrides && override.assignment_overrides[lookupKey]) {
      const assignment = override.assignment_overrides[lookupKey] as Record<string, string>;
      assigneeUserId = assignment.userId;
      assigneeRole = assignment.role;
    }

    return {
      stepId,
      stepKey,
      stepType: step.step_type,
      stepOrder: step.step_order,
      isOptional,
      isBlocking: step.is_blocking,
      isEnabled,
      config,
      timingOverride,
      messageTemplateId,
      channel,
      assigneeUserId,
      assigneeRole,
    };
  });
}

/**
 * Check if a workflow template is enabled for an organization.
 */
export async function isWorkflowEnabledForOrg(
  orgId: string,
  templateId: string,
  defaultEnabled: boolean
): Promise<boolean> {
  const override = await fetchOrgOverride(orgId, templateId);
  return override ? override.enabled : defaultEnabled;
}
