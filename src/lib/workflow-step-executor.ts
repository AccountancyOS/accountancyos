/**
 * Workflow Step Executor
 * 
 * Executes individual workflow steps based on their type.
 * Handles: SEND_EMAIL, CREATE_JOB, CREATE_TASK, SEND_NOTIFICATION,
 *          WAIT_UNTIL, WAIT_FOR_EVENT, SET_SLA_TIMER, UPDATE_STATUS,
 *          CONDITION
 * 
 * NOTE: Client-side executor is for preview rendering only.
 * The server-side edge function (workflow-tick) is the authoritative executor.
 * Client-side WAIT_UNTIL does NOT write to the database.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ResolvedStepConfig } from "./workflow-override-resolver";
import { VALID_CONDITION_REFS, CONDITION_TYPES } from "./workflow-constants";

export interface StepExecutionResult {
  success: boolean;
  /** If the step should pause the workflow (WAIT_UNTIL, WAIT_FOR_EVENT) */
  shouldWait: boolean;
  /** When the workflow should resume (for WAIT_UNTIL) */
  nextRunAt?: string;
  /** Event key to wait for (for WAIT_FOR_EVENT) */
  waitForEventKey?: string;
  /** Output data from the step */
  data?: Record<string, unknown>;
  error?: string;
}

interface ExecutionContext {
  instanceId: string;
  orgId: string;
  clientId?: string;
  companyId?: string;
  serviceId?: string;
  periodKey: string;
  workflowContext: Record<string, unknown>;
}

/**
 * Resolve placeholder values in a string.
 */
function resolvePlaceholders(
  template: string,
  ctx: ExecutionContext
): string {
  if (!template) return template;
  
  return template
    .replace(/\{\{period_key\}\}/g, ctx.periodKey)
    .replace(/\{\{org_id\}\}/g, ctx.orgId)
    .replace(/\{\{client_id\}\}/g, ctx.clientId || "")
    .replace(/\{\{company_id\}\}/g, ctx.companyId || "")
    .replace(/\{\{instance_id\}\}/g, ctx.instanceId);
}

/**
 * Execute a CONDITION step.
 * Returns { skipped: true } when the condition fails (gate blocks).
 * The orchestrator must then skip forward to the next WAIT_UNTIL or end.
 */
function executeCondition(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): StepExecutionResult {
  const config = step.config as {
    condition_type?: string;
    values_ref?: string;
    job_context_key?: string;
  };

  if (config.condition_type !== CONDITION_TYPES.JOB_STATUS_NOT_IN) {
    return { success: false, shouldWait: false, error: `Unsupported condition_type: ${config.condition_type}` };
  }

  // Resolve values_ref to a known constant
  const valuesRef = config.values_ref;
  if (!valuesRef || !VALID_CONDITION_REFS[valuesRef]) {
    return { success: false, shouldWait: false, error: `Unknown values_ref: ${valuesRef}. Must be one of: ${Object.keys(VALID_CONDITION_REFS).join(", ")}` };
  }

  const blockedStatuses = VALID_CONDITION_REFS[valuesRef];

  // Resolve current job status from context
  const jobId = ctx.workflowContext[config.job_context_key || "jobId"] as string | undefined;
  const jobStatus = ctx.workflowContext.jobStatus as string | undefined;

  if (!jobStatus) {
    // If we can't determine status, let it pass (don't block on missing data)
    return { success: true, shouldWait: false, data: { conditionPassed: true, reason: "job_status_unknown" } };
  }

  if (blockedStatuses.includes(jobStatus)) {
    // Condition FAILED — records already received or further
    return {
      success: true,
      shouldWait: false,
      data: { skipped: true, conditionFailed: true, reason: "condition_not_met", jobStatus, blockedBy: valuesRef },
    };
  }

  // Condition passed — continue to next step
  return { success: true, shouldWait: false, data: { conditionPassed: true, jobStatus } };
}

/**
 * Execute a WAIT_UNTIL step.
 * Uses anchor_key from config to resolve the base date from context.anchors.
 * Falls back to legacy base_date_field for backwards compatibility.
 */
function executeWaitUntil(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): StepExecutionResult {
  const config = step.config as {
    anchor_key?: string;
    base_date_field?: string;
    offset_days?: number;
    time_of_day?: string;
  };

  let offsetDays = config.offset_days ?? 0;
  let timeOfDay = config.time_of_day ?? "09:00";

  // Apply timing override (keyed by step_key)
  if (step.timingOverride) {
    if (step.timingOverride.offsetDays !== undefined) {
      offsetDays = step.timingOverride.offsetDays;
    }
    if (step.timingOverride.timeOfDay) {
      timeOfDay = step.timingOverride.timeOfDay;
    }
  }

  // Resolve base date: prefer anchor_key, fall back to legacy base_date_field
  let baseDateStr: string | null = null;

  if (config.anchor_key) {
    const anchors = (ctx.workflowContext.anchors || {}) as Record<string, string>;
    baseDateStr = anchors[config.anchor_key] || null;

    if (!baseDateStr) {
      // Missing anchor
      if (step.isBlocking) {
        return {
          success: true,
          shouldWait: true, // Pause the instance
          data: { anchorMissing: true, anchorKey: config.anchor_key, reason: `Anchor '${config.anchor_key}' not resolved in workflow context` },
        };
      } else {
        // Non-blocking: skip
        return {
          success: true,
          shouldWait: false,
          data: { skipped: true, anchorMissing: true, anchorKey: config.anchor_key },
        };
      }
    }
  } else {
    // Legacy fallback
    const legacyField = config.base_date_field || "period_end";
    baseDateStr = (ctx.workflowContext[legacyField] as string) || new Date().toISOString();
  }

  const baseDate = new Date(baseDateStr);
  baseDate.setDate(baseDate.getDate() + offsetDays);
  
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  baseDate.setHours(hours || 9, minutes || 0, 0, 0);

  const nextRunAt = baseDate.toISOString();
  const now = new Date();

  // If target is in the past, don't wait
  if (baseDate <= now) {
    return { success: true, shouldWait: false };
  }

  return {
    success: true,
    shouldWait: true,
    nextRunAt,
  };
}

/**
 * Execute a WAIT_FOR_EVENT step.
 */
function executeWaitForEvent(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): StepExecutionResult {
  const config = step.config as {
    event_key: string;
    correlation_keys?: Record<string, string>;
    timeout_days?: number;
  };

  // Build the composite event key for matching
  // Format: {event_key}:{org_id}:{client_id}:{company_id}
  const parts = [
    config.event_key,
    ctx.orgId,
    ctx.clientId || "_",
    ctx.companyId || "_",
  ];
  const waitKey = parts.join(":");

  return {
    success: true,
    shouldWait: true,
    waitForEventKey: waitKey,
  };
}

/**
 * Execute a SEND_EMAIL step.
 */
async function executeSendEmail(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  const config = step.config as {
    message_template_key?: string;
    to_type?: string; // "client_primary", "assigned_user", "custom"
    to_email?: string;
    subject_override?: string;
  };

  // Use overridden message template if available
  const templateKey = step.messageTemplateId || config.message_template_key;

  // Resolve recipient
  let toEmail = config.to_email || "";
  if (config.to_type === "client_primary" && ctx.clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("id", ctx.clientId)
      .maybeSingle();
    if (client?.email) toEmail = client.email;
  }

  if (!toEmail) {
    return { success: false, shouldWait: false, error: "No recipient email resolved" };
  }

  // Fetch message template if key provided
  let subject = config.subject_override || "Notification";
  let bodyHtml = "";

  if (templateKey) {
    const { data: msgTpl } = await supabase
      .from("message_templates")
      .select("subject, body")
      .eq("key", templateKey)
      .maybeSingle();

    if (msgTpl) {
      subject = resolvePlaceholders(msgTpl.subject || subject, ctx);
      bodyHtml = resolvePlaceholders(msgTpl.body || "", ctx);
    }
  }

  // Queue the email
  const { data, error } = await supabase
    .from("email_queue")
    .insert({
      organization_id: ctx.orgId,
      to_email: toEmail,
      subject,
      body_html: bodyHtml,
      status: "pending",
      entity_type: "workflow_instance",
      entity_id: ctx.instanceId,
    })
    .select("id")
    .single();

  if (error) return { success: false, shouldWait: false, error: error.message };
  return { success: true, shouldWait: false, data: { emailQueueId: data.id } };
}

/**
 * Execute a CREATE_JOB step.
 */
async function executeCreateJob(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  const config = step.config as {
    job_name_template?: string;
    service_type?: string;
    job_template_id?: string;
    assigned_to_override_key?: string;
  };

  const serviceType = config.service_type;
  if (!serviceType) {
    return { success: false, shouldWait: false, error: "CREATE_JOB requires service_type" };
  }

  const jobName = resolvePlaceholders(config.job_name_template || "Auto-generated Job", ctx);
  const assignedTo = step.assigneeUserId || null;

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      organization_id: ctx.orgId,
      job_name: jobName,
      service_type: serviceType,
      status: "not_started",
      client_id: ctx.clientId || null,
      company_id: ctx.companyId || null,
      template_id: config.job_template_id || null,
      assigned_to: assignedTo,
      is_auto_generated: true,
      auto_generated_at: new Date().toISOString(),
      automation_source: "template",
    })
    .select("id")
    .single();

  if (error) return { success: false, shouldWait: false, error: error.message };

  return { success: true, shouldWait: false, data: { jobId: data.id } };
}

/**
 * Execute a CREATE_TASK step.
 */
async function executeCreateTask(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  const config = step.config as {
    title?: string;
    description?: string;
    visibility?: string;
    due_offset_days?: number;
  };

  const title = resolvePlaceholders(config.title || "Auto-generated Task", ctx);
  const description = resolvePlaceholders(config.description || "", ctx);

  let dueDate: string | null = null;
  if (config.due_offset_days) {
    const d = new Date();
    d.setDate(d.getDate() + config.due_offset_days);
    dueDate = d.toISOString().split("T")[0];
  }

  const { data, error } = await supabase
    .from("client_tasks")
    .insert({
      organization_id: ctx.orgId,
      title,
      description: description || null,
      client_id: ctx.clientId || null,
      company_id: ctx.companyId || null,
      visibility: config.visibility || "internal",
      status: "pending",
      due_date: dueDate,
    })
    .select("id")
    .single();

  if (error) return { success: false, shouldWait: false, error: error.message };
  return { success: true, shouldWait: false, data: { taskId: data.id } };
}

/**
 * Execute a SEND_NOTIFICATION step.
 */
async function executeSendNotification(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  const config = step.config as {
    title?: string;
    message?: string;
    to_type?: string; // "assigned", "all_org"
    user_id?: string;
  };

  const title = resolvePlaceholders(config.title || "Notification", ctx);
  const message = resolvePlaceholders(config.message || "", ctx);

  // Resolve recipients
  let userIds: string[] = [];
  if (config.user_id) {
    userIds = [config.user_id];
  } else if (step.assigneeUserId) {
    userIds = [step.assigneeUserId];
  } else {
    // Default: notify all org users
    const { data: orgUsers } = await supabase
      .from("organization_users")
      .select("user_id")
      .eq("organization_id", ctx.orgId);
    userIds = (orgUsers || []).map((u) => u.user_id);
  }

  if (userIds.length === 0) {
    return { success: false, shouldWait: false, error: "No notification recipients" };
  }

  const notifications = userIds.map((uid) => ({
    organization_id: ctx.orgId,
    user_id: uid,
    type: "automation",
    title,
    message,
    entity_type: "workflow_instance",
    entity_id: ctx.instanceId,
    is_read: false,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) return { success: false, shouldWait: false, error: error.message };
  return { success: true, shouldWait: false, data: { notified: userIds.length } };
}

/**
 * Execute a SET_SLA_TIMER step.
 */
async function executeSetSlaTimer(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  const config = step.config as {
    sla_name?: string;
    sla_days?: number;
    entity_type?: string;
  };

  // SLA is informational — log it and continue
  return {
    success: true,
    shouldWait: false,
    data: {
      slaName: config.sla_name,
      slaDays: config.sla_days,
      setAt: new Date().toISOString(),
    },
  };
}

/**
 * Execute an UPDATE_STATUS step.
 */
async function executeUpdateStatus(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  const config = step.config as {
    entity_type?: string;
    new_status?: string;
  };

  // Update job status if entity_type is job
  if (config.entity_type === "job" && ctx.workflowContext.jobId) {
    const { error } = await supabase
      .from("jobs")
      .update({ status: config.new_status })
      .eq("id", ctx.workflowContext.jobId as string)
      .eq("organization_id", ctx.orgId);

    if (error) return { success: false, shouldWait: false, error: error.message };
  }

  return { success: true, shouldWait: false, data: { newStatus: config.new_status } };
}

/**
 * Main step executor - routes to specific handlers.
 */
export async function executeStep(
  step: ResolvedStepConfig,
  ctx: ExecutionContext
): Promise<StepExecutionResult> {
  // Skip disabled optional steps
  if (step.isOptional && !step.isEnabled) {
    return { success: true, shouldWait: false, data: { skipped: true } };
  }

  switch (step.stepType) {
    case "CONDITION":
      return executeCondition(step, ctx);
    case "WAIT_UNTIL":
      return executeWaitUntil(step, ctx);
    case "WAIT_FOR_EVENT":
      return executeWaitForEvent(step, ctx);
    case "SEND_EMAIL":
      return executeSendEmail(step, ctx);
    case "CREATE_JOB":
      return executeCreateJob(step, ctx);
    case "CREATE_TASK":
      return executeCreateTask(step, ctx);
    case "SEND_NOTIFICATION":
      return executeSendNotification(step, ctx);
    case "SET_SLA_TIMER":
      return executeSetSlaTimer(step, ctx);
    case "UPDATE_STATUS":
      return executeUpdateStatus(step, ctx);
    default:
      return {
        success: false,
        shouldWait: false,
        error: `Unknown step type: ${step.stepType}`,
      };
  }
}
