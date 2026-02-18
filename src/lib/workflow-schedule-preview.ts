/**
 * Workflow Schedule Preview
 * 
 * Pure function (no side effects, no DB writes) that generates a preview
 * of when chaser emails will fire for a given template + client + period.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveAnchors, type AnchorResolverInput } from "./automation-context-resolver";

export interface SchedulePreviewEntry {
  stepKey: string;
  label: string;
  anchorKey: string;
  anchorValue: string | null;
  defaultOffsetDays: number;
  overrideOffsetDays: number | null;
  computedSendAt: string | null;
  isPast: boolean;
  isExample: boolean;
  isEnabled: boolean;
  anchorMissing: boolean;
  anchorMissingReason?: string;
  messageTemplateKey?: string;
}

export interface SchedulePreviewResult {
  templateName: string;
  templateKey: string;
  entries: SchedulePreviewEntry[];
  isExample: boolean;
}

/**
 * Preview the chaser schedule for a template with optional org overrides.
 * If no client/period data is provided, uses example dates (clearly marked).
 */
export async function previewWorkflowSchedule(
  orgId: string,
  templateId: string,
  anchorInput?: AnchorResolverInput
): Promise<SchedulePreviewResult> {
  // Fetch template
  const { data: template } = await supabase
    .from("automation_workflow_templates")
    .select("name, key, service_type")
    .eq("id", templateId)
    .single();

  // Fetch WAIT_UNTIL steps only (these are the chaser timing steps)
  const { data: steps } = await supabase
    .from("automation_workflow_steps")
    .select("id, step_key, step_type, step_order, config, is_optional, is_blocking")
    .eq("template_id", templateId)
    .in("step_type", ["WAIT_UNTIL"])
    .order("step_order", { ascending: true });

  // Fetch org overrides
  const { data: override } = await supabase
    .from("automation_org_overrides")
    .select("timing_overrides, optional_step_toggles")
    .eq("org_id", orgId)
    .eq("template_id", templateId)
    .maybeSingle();

  const timingOverrides = (override?.timing_overrides || {}) as Record<string, { offset_days?: number }>;
  const stepToggles = (override?.optional_step_toggles || {}) as Record<string, boolean>;

  // Determine if example mode
  const isExample = !anchorInput?.periodEnd;
  const now = new Date();

  // Resolve anchors
  const resolverInput: AnchorResolverInput = anchorInput || {
    periodStart: `${now.getFullYear()}-04-06`,
    periodEnd: `${now.getFullYear() + 1}-04-05`,
    periodType: "annual",
    serviceType: template?.service_type || "",
  };

  const { anchors, missing } = resolveAnchors(resolverInput);
  const missingMap = new Map(missing.map((m) => [m.anchor_key, m.reason]));

  const entries: SchedulePreviewEntry[] = (steps || []).map((step) => {
    const config = (step.config || {}) as Record<string, unknown>;
    const stepKey = (step as any).step_key as string;
    const anchorKey = (config.anchor_key as string) || "";
    const defaultOffset = (config.offset_days as number) || 0;
    const label = (config.label as string) || stepKey;

    // Check override
    const overrideData = timingOverrides[stepKey];
    const overrideOffset = overrideData?.offset_days ?? null;
    const effectiveOffset = overrideOffset ?? defaultOffset;

    // Check enabled
    const isEnabled = step.is_optional ? (stepToggles[stepKey] !== false) : true;

    // Resolve anchor
    const anchorValue = anchors[anchorKey] || null;
    const anchorMissing = !anchorValue && !!anchorKey;
    const anchorMissingReason = missingMap.get(anchorKey);

    // Compute send date
    let computedSendAt: string | null = null;
    let isPast = false;
    if (anchorValue && !anchorMissing) {
      const base = new Date(anchorValue);
      base.setDate(base.getDate() + effectiveOffset);
      base.setHours(9, 0, 0, 0);
      computedSendAt = base.toISOString();
      isPast = base < now;
    }

    return {
      stepKey,
      label,
      anchorKey,
      anchorValue,
      defaultOffsetDays: defaultOffset,
      overrideOffsetDays: overrideOffset,
      computedSendAt,
      isPast,
      isExample,
      isEnabled,
      anchorMissing,
      anchorMissingReason,
      messageTemplateKey: config.message_template_key as string | undefined,
    };
  });

  return {
    templateName: template?.name || "",
    templateKey: template?.key || "",
    entries,
    isExample,
  };
}
