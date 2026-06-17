/**
 * Workflow Tick Edge Function
 * 
 * Called on a schedule (or manually) to:
 * 1. Process legacy automation events (existing automation_rules)
 * 2. Route new trigger events to workflow templates
 * 3. Advance running workflow instances through their steps
 * 
 * This is the unified entry point for the automation engine.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// Types
// ============================================================

interface WorkflowInstance {
  id: string;
  org_id: string;
  template_id: string;
  client_id: string | null;
  company_id: string | null;
  service_id: string | null;
  period_key: string;
  status: string;
  current_step_id: string | null;
  context: Record<string, unknown>;
  next_run_at: string | null;
  waiting_for_event_key: string | null;
}

interface StepRow {
  id: string;
  step_type: string;
  step_order: number;
  config: Record<string, unknown>;
  is_optional: boolean;
  is_blocking: boolean;
}

interface StepResult {
  success: boolean;
  shouldWait: boolean;
  nextRunAt?: string;
  waitForEventKey?: string;
  data?: Record<string, unknown>;
  error?: string;
  /** When set, overrides default sequential advancement and jumps to step with this step_order */
  nextStepOrder?: number;
}

// Exponential back-off schedule (seconds) for failed step executions
const RETRY_BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200, 86400];
const MAX_RETRIES = RETRY_BACKOFF_SECONDS.length;

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function evaluateCondition(
  ctx: Record<string, unknown>,
  cond: { field: string; op: string; value?: unknown }
): boolean {
  const actual = getNestedValue(ctx, cond.field);
  switch (cond.op) {
    case "eq": return actual === cond.value;
    case "neq": return actual !== cond.value;
    case "gt": return typeof actual === "number" && typeof cond.value === "number" && actual > cond.value;
    case "gte": return typeof actual === "number" && typeof cond.value === "number" && actual >= cond.value;
    case "lt": return typeof actual === "number" && typeof cond.value === "number" && actual < cond.value;
    case "lte": return typeof actual === "number" && typeof cond.value === "number" && actual <= cond.value;
    case "in": return Array.isArray(cond.value) && cond.value.includes(actual);
    case "exists": return actual !== undefined && actual !== null;
    case "missing": return actual === undefined || actual === null;
    default: return false;
  }
}

// ============================================================
// Step Executor (server-side, uses service role client)
// ============================================================

function resolvePlaceholders(template: string, ctx: { periodKey: string; orgId: string; clientId?: string; companyId?: string; instanceId: string }): string {
  if (!template) return template;
  return template
    .replace(/\{\{period_key\}\}/g, ctx.periodKey)
    .replace(/\{\{org_id\}\}/g, ctx.orgId)
    .replace(/\{\{client_id\}\}/g, ctx.clientId || "")
    .replace(/\{\{company_id\}\}/g, ctx.companyId || "")
    .replace(/\{\{instance_id\}\}/g, ctx.instanceId);
}

// deno-lint-ignore no-explicit-any
async function executeStep(supabase: any, step: StepRow, overrides: { timingOverride?: any; messageTemplateId?: string; assigneeUserId?: string }, ctx: { instanceId: string; orgId: string; clientId?: string; companyId?: string; periodKey: string; workflowContext: Record<string, unknown> }): Promise<StepResult> {
  switch (step.step_type) {
    case "WAIT_UNTIL": {
      const config = step.config as { base_date_field?: string; offset_days?: number; time_of_day?: string };
      let offsetDays = config.offset_days ?? 0;
      let timeOfDay = config.time_of_day ?? "09:00";
      if (overrides.timingOverride?.offsetDays !== undefined) offsetDays = overrides.timingOverride.offsetDays;
      if (overrides.timingOverride?.timeOfDay) timeOfDay = overrides.timingOverride.timeOfDay;

      const baseDateStr = (ctx.workflowContext[config.base_date_field || "period_end"] as string) || new Date().toISOString();
      const baseDate = new Date(baseDateStr);
      baseDate.setDate(baseDate.getDate() + offsetDays);
      const [h, m] = timeOfDay.split(":").map(Number);
      baseDate.setHours(h || 9, m || 0, 0, 0);

      if (baseDate <= new Date()) return { success: true, shouldWait: false };
      return { success: true, shouldWait: true, nextRunAt: baseDate.toISOString() };
    }

    case "WAIT_FOR_EVENT": {
      const config = step.config as { event_key: string };
      const waitKey = [config.event_key, ctx.orgId, ctx.clientId || "_", ctx.companyId || "_"].join(":");
      return { success: true, shouldWait: true, waitForEventKey: waitKey };
    }

    case "SEND_EMAIL": {
      const config = step.config as { message_template_key?: string; to_type?: string; to_email?: string; subject_override?: string };
      const templateKey = overrides.messageTemplateId || config.message_template_key;
      let toEmail = config.to_email || "";

      if (config.to_type === "client_primary" && ctx.clientId) {
        const { data: client } = await supabase.from("clients").select("email").eq("id", ctx.clientId).maybeSingle();
        if (client?.email) toEmail = client.email;
      }

      if (!toEmail) return { success: false, shouldWait: false, error: "No recipient email" };

      let subject = config.subject_override || "Notification";
      let bodyHtml = "";
      if (templateKey) {
        const { data: msgTpl } = await supabase.from("message_templates").select("subject, body_html").eq("key", templateKey).maybeSingle();
        if (msgTpl) {
          subject = resolvePlaceholders(msgTpl.subject || subject, ctx);
          bodyHtml = resolvePlaceholders(msgTpl.body_html || "", ctx);
        }
      }

      const { data, error } = await supabase.from("email_queue").insert({ organization_id: ctx.orgId, to_email: toEmail, subject, body_html: bodyHtml, status: "pending", entity_type: "workflow_instance", entity_id: ctx.instanceId }).select("id").single();
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { emailQueueId: data.id } };
    }

    case "CREATE_JOB": {
      const config = step.config as { job_name_template?: string; service_type?: string; job_template_id?: string };
      if (!config.service_type) return { success: false, shouldWait: false, error: "CREATE_JOB requires service_type" };
      const jobName = resolvePlaceholders(config.job_name_template || "Auto-generated Job", ctx);
      // chk_jobs_status: blank is the canonical "new job" state.
      const { data, error } = await supabase.from("jobs").insert({ organization_id: ctx.orgId, job_name: jobName, service_type: config.service_type, status: "blank", client_id: ctx.clientId || null, company_id: ctx.companyId || null, template_id: config.job_template_id || null, assigned_to: overrides.assigneeUserId || null, is_auto_generated: true, auto_generated_at: new Date().toISOString(), automation_source: "template" }).select("id").single();
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { jobId: data.id } };
    }

    case "CREATE_TASK": {
      const config = step.config as { title?: string; description?: string; visibility?: string; due_offset_days?: number };
      const title = resolvePlaceholders(config.title || "Auto Task", ctx);
      let dueDate: string | null = null;
      if (config.due_offset_days) { const d = new Date(); d.setDate(d.getDate() + config.due_offset_days); dueDate = d.toISOString().split("T")[0]; }
      const { data, error } = await supabase.from("client_tasks").insert({ organization_id: ctx.orgId, title, description: config.description || null, client_id: ctx.clientId || null, company_id: ctx.companyId || null, visibility: config.visibility || "internal", status: "pending", due_date: dueDate }).select("id").single();
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { taskId: data.id } };
    }

    case "SEND_NOTIFICATION": {
      const config = step.config as { title?: string; message?: string; user_id?: string };
      const title = resolvePlaceholders(config.title || "Notification", ctx);
      const message = resolvePlaceholders(config.message || "", ctx);
      let userIds: string[] = [];
      if (config.user_id) { userIds = [config.user_id]; }
      else if (overrides.assigneeUserId) { userIds = [overrides.assigneeUserId]; }
      else {
        const { data: orgUsers } = await supabase.from("organization_users").select("user_id").eq("organization_id", ctx.orgId);
        userIds = (orgUsers || []).map((u: { user_id: string }) => u.user_id);
      }
      if (userIds.length === 0) return { success: false, shouldWait: false, error: "No recipients" };
      const notifications = userIds.map(uid => ({ organization_id: ctx.orgId, user_id: uid, type: "automation", title, message, entity_type: "workflow_instance", entity_id: ctx.instanceId, is_read: false }));
      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { notified: userIds.length } };
    }

    case "SET_SLA_TIMER":
      return { success: true, shouldWait: false, data: { slaSet: true } };

    case "ASSIGN_STAFF": {
      const config = step.config as { user_id?: string; entity_type?: string };
      const userId = config.user_id || overrides.assigneeUserId;
      if (!userId) return { success: false, shouldWait: false, error: "ASSIGN_STAFF requires user_id" };
      const entityType = config.entity_type || "job";
      if (entityType === "job") {
        const jobId = (ctx.workflowContext.jobId as string | undefined);
        if (!jobId) return { success: false, shouldWait: false, error: "ASSIGN_STAFF (job) requires jobId in context" };
        const { error } = await supabase.from("jobs").update({ assigned_to: userId }).eq("id", jobId).eq("organization_id", ctx.orgId);
        if (error) return { success: false, shouldWait: false, error: error.message };
        return { success: true, shouldWait: false, data: { assignedTo: userId, jobId } };
      }
      if (entityType === "task") {
        const taskId = (ctx.workflowContext.taskId as string | undefined);
        if (!taskId) return { success: false, shouldWait: false, error: "ASSIGN_STAFF (task) requires taskId in context" };
        const { error } = await supabase.from("client_tasks").update({ assigned_to: userId }).eq("id", taskId).eq("organization_id", ctx.orgId);
        if (error) return { success: false, shouldWait: false, error: error.message };
        return { success: true, shouldWait: false, data: { assignedTo: userId, taskId } };
      }
      return { success: false, shouldWait: false, error: `Unsupported entity_type: ${entityType}` };
    }

    case "SEND_PORTAL_MESSAGE": {
      const config = step.config as { subject?: string; content?: string; visibility?: string; message_type?: string };
      const subject = resolvePlaceholders(config.subject || "Update from your accountant", ctx);
      const content = resolvePlaceholders(config.content || "", ctx);
      if (!ctx.clientId && !ctx.companyId) return { success: false, shouldWait: false, error: "SEND_PORTAL_MESSAGE requires client or company" };
      const { data, error } = await supabase.from("client_messages").insert({
        organization_id: ctx.orgId,
        client_id: ctx.clientId || null,
        company_id: ctx.companyId || null,
        subject,
        content,
        sender_type: "system",
        message_type: config.message_type || "automation",
        visibility: config.visibility || "client",
      }).select("id").single();
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { messageId: data.id } };
    }

    case "BRANCH_ON_CONDITION": {
      const config = step.config as {
        branches?: Array<{ conditions?: Array<{ field: string; op: string; value?: unknown }>; logic?: "and" | "or"; next_step_order: number }>;
        default_step_order?: number;
      };
      const branches = config.branches || [];
      const evalCtx: Record<string, unknown> = {
        ...ctx.workflowContext,
        period_key: ctx.periodKey,
        client_id: ctx.clientId,
        company_id: ctx.companyId,
      };
      for (const br of branches) {
        const conds = br.conditions || [];
        if (conds.length === 0) continue;
        const logic = br.logic || "and";
        const results = conds.map((c) => evaluateCondition(evalCtx, c));
        const matched = logic === "or" ? results.some(Boolean) : results.every(Boolean);
        if (matched) {
          return { success: true, shouldWait: false, nextStepOrder: br.next_step_order, data: { matchedBranch: br.next_step_order } };
        }
      }
      if (config.default_step_order !== undefined) {
        return { success: true, shouldWait: false, nextStepOrder: config.default_step_order, data: { matchedBranch: "default" } };
      }
      return { success: true, shouldWait: false, data: { matchedBranch: null } };
    }

    case "UPDATE_STATUS": {
      const config = step.config as { entity_type?: string; new_status?: string };
      if (config.entity_type === "job" && ctx.workflowContext.jobId) {
        await supabase.from("jobs").update({ status: config.new_status }).eq("id", ctx.workflowContext.jobId).eq("organization_id", ctx.orgId);
      }
      return { success: true, shouldWait: false, data: { newStatus: config.new_status } };
    }

    case "PORT_QUOTE": {
      const quoteId = (step.config as { quote_id?: string }).quote_id
        || (ctx.workflowContext.quoteId as string | undefined);
      if (!quoteId) return { success: false, shouldWait: false, error: "PORT_QUOTE requires quote_id" };
      const { data, error } = await supabase.rpc("port_quote_to_client", { p_quote_id: quoteId });
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { clientId: data } };
    }

    case "START_KYC_PACK": {
      const clientId = ctx.clientId || (ctx.workflowContext.clientId as string | undefined);
      if (!clientId) return { success: false, shouldWait: false, error: "START_KYC_PACK requires client" };
      const subjects = ((step.config as { subjects?: unknown[] }).subjects) ?? [];
      const { data, error } = await supabase.rpc("start_kyc_pack", {
        p_client_id: clientId,
        p_subjects: subjects,
      });
      if (error) return { success: false, shouldWait: false, error: error.message };
      return { success: true, shouldWait: false, data: { kycPackId: data } };
    }

    case "REQUEST_HMRC_AUTH": {
      const clientId = ctx.clientId || (ctx.workflowContext.clientId as string | undefined);
      if (!clientId) return { success: false, shouldWait: false, error: "REQUEST_HMRC_AUTH requires client" };
      const taxRegime = (step.config as { tax_regime?: string }).tax_regime || "ITSA";
      await supabase.from("automation_events").insert({
        organization_id: ctx.orgId,
        event_type: "HMRC_AUTH_REQUESTED",
        entity_type: "client",
        entity_id: clientId,
        payload: { tax_regime: taxRegime, source: "workflow", instance_id: ctx.instanceId },
        status: "pending",
      });
      return { success: true, shouldWait: false, data: { hmrcAuthRequested: true, tax_regime: taxRegime } };
    }

    default:
      return { success: false, shouldWait: false, error: `Unknown step type: ${step.step_type}` };
  }
}

// ============================================================
// Orchestrator
// ============================================================

// deno-lint-ignore no-explicit-any
async function advanceInstance(supabase: any, instance: WorkflowInstance): Promise<{ advanced: boolean; error?: string }> {
  try {
    // Fetch steps
    const { data: steps, error: stepsErr } = await supabase
      .from("automation_workflow_steps")
      .select("id, step_type, step_order, config, is_optional, is_blocking")
      .eq("template_id", instance.template_id)
      .order("step_order", { ascending: true });

    if (stepsErr || !steps || steps.length === 0) {
      await supabase.from("automation_workflow_instances").update({ status: "completed", next_run_at: null, updated_at: new Date().toISOString() }).eq("id", instance.id);
      return { advanced: true };
    }

    // Fetch org override
    const { data: override } = await supabase
      .from("automation_org_overrides")
      .select("timing_overrides, message_template_overrides, assignment_overrides, optional_step_toggles")
      .eq("org_id", instance.org_id)
      .eq("template_id", instance.template_id)
      .maybeSingle();

    const timingOverrides = (override?.timing_overrides || {}) as Record<string, unknown>;
    const msgOverrides = (override?.message_template_overrides || {}) as Record<string, string>;
    const assignmentOverrides = (override?.assignment_overrides || {}) as Record<string, Record<string, string>>;
    const stepToggles = (override?.optional_step_toggles || {}) as Record<string, boolean>;

    let currentIdx = steps.findIndex((s: StepRow) => s.id === instance.current_step_id);
    if (currentIdx === -1) currentIdx = 0;

    const step = steps[currentIdx] as StepRow;

    // Skip disabled optional steps
    if (step.is_optional && stepToggles[step.id] === false) {
      // Move to next
      const nextStep = findNextEnabledStep(steps, currentIdx, stepToggles);
      if (!nextStep) {
        await supabase.from("automation_workflow_instances").update({ status: "completed", next_run_at: null, current_step_id: null, updated_at: new Date().toISOString() }).eq("id", instance.id);
      } else {
        await supabase.from("automation_workflow_instances").update({ current_step_id: nextStep.id, next_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", instance.id);
      }
      return { advanced: true };
    }

    // Build overrides for this step
    const stepOverrides = {
      timingOverride: timingOverrides[step.id] as Record<string, unknown> | undefined,
      messageTemplateId: msgOverrides[step.id],
      assigneeUserId: assignmentOverrides[step.id]?.userId,
    };

    const result = await executeStep(supabase, step, stepOverrides, {
      instanceId: instance.id,
      orgId: instance.org_id,
      clientId: instance.client_id || undefined,
      companyId: instance.company_id || undefined,
      periodKey: instance.period_key,
      workflowContext: instance.context,
    });

    // Log event
    await supabase.from("automation_workflow_events").insert({
      instance_id: instance.id,
      org_id: instance.org_id,
      step_id: step.id,
      event_type: result.success ? "step_completed" : "step_failed",
      payload: { step_type: step.step_type, result: result.data || {}, error: result.error },
    });

    if (!result.success) {
      // Reliability: exponential back-off then dead-letter
      const { data: current } = await supabase
        .from("automation_workflow_instances")
        .select("retry_count")
        .eq("id", instance.id)
        .maybeSingle();
      const currentRetries = (current?.retry_count as number | null) ?? 0;
      const nextRetries = currentRetries + 1;

      if (nextRetries >= MAX_RETRIES) {
        await supabase.from("automation_workflow_instances").update({
          status: "failed",
          error_message: result.error,
          last_error: result.error,
          retry_count: nextRetries,
          dead_lettered_at: new Date().toISOString(),
          next_run_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", instance.id);
        await supabase.from("automation_workflow_events").insert({
          instance_id: instance.id,
          org_id: instance.org_id,
          step_id: step.id,
          event_type: "instance_dead_lettered",
          payload: { retries: nextRetries, error: result.error },
        });
      } else {
        const backoffSec = RETRY_BACKOFF_SECONDS[currentRetries] ?? RETRY_BACKOFF_SECONDS[RETRY_BACKOFF_SECONDS.length - 1];
        const retryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
        await supabase.from("automation_workflow_instances").update({
          // Keep status running so tick will re-pick when next_run_at hits
          last_error: result.error,
          retry_count: nextRetries,
          next_retry_at: retryAt,
          next_run_at: retryAt,
          updated_at: new Date().toISOString(),
        }).eq("id", instance.id);
      }
      return { advanced: false, error: result.error };
    }

    if (result.shouldWait) {
      await supabase.from("automation_workflow_instances").update({
        next_run_at: result.nextRunAt || null,
        waiting_for_event_key: result.waitForEventKey || null,
        status: result.waitForEventKey ? "waiting" : "running",
        updated_at: new Date().toISOString(),
      }).eq("id", instance.id);
      return { advanced: true };
    }

    // Advance to next step
    let nextStep: StepRow | null = null;
    if (result.nextStepOrder !== undefined) {
      nextStep = (steps.find((s: StepRow) => s.step_order === result.nextStepOrder) as StepRow | undefined) || null;
    } else {
      nextStep = findNextEnabledStep(steps, currentIdx, stepToggles);
    }
    if (!nextStep) {
      await supabase.from("automation_workflow_instances").update({ status: "completed", next_run_at: null, current_step_id: null, waiting_for_event_key: null, updated_at: new Date().toISOString() }).eq("id", instance.id);
      await supabase.from("automation_workflow_events").insert({ instance_id: instance.id, org_id: instance.org_id, event_type: "instance_completed", payload: {} });
    } else {
      // Reset retry counters on successful step
      await supabase.from("automation_workflow_instances").update({ current_step_id: nextStep.id, next_run_at: new Date().toISOString(), waiting_for_event_key: null, retry_count: 0, last_error: null, next_retry_at: null, updated_at: new Date().toISOString() }).eq("id", instance.id);
    }

    return { advanced: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await supabase.from("automation_workflow_instances").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", instance.id);
    return { advanced: false, error: msg };
  }
}

function findNextEnabledStep(steps: StepRow[], currentIdx: number, stepToggles: Record<string, boolean>): StepRow | null {
  for (let i = currentIdx + 1; i < steps.length; i++) {
    const s = steps[i];
    if (s.is_optional && stepToggles[s.id] === false) continue;
    return s;
  }
  return null;
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let limit = 50;
    let mode = "tick"; // "tick" | "resume"
    let eventKey: string | undefined;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        limit = body.limit || 50;
        mode = body.mode || "tick";
        eventKey = body.event_key;
      } catch { /* defaults */ }
    }

    if (mode === "resume" && eventKey) {
      // Resume instances waiting for this event
      const { data: waitingInstances } = await supabase
        .from("automation_workflow_instances")
        .select("*")
        .eq("status", "waiting")
        .eq("waiting_for_event_key", eventKey)
        .is("paused_at", null)
        .is("cancelled_at", null)
        .is("dead_lettered_at", null);

      let resumed = 0;
      const errors: string[] = [];

      for (const raw of (waitingInstances || [])) {
        const instance = raw as unknown as WorkflowInstance;
        instance.context = (instance.context || {}) as Record<string, unknown>;

        // Find next step
        const { data: steps } = await supabase.from("automation_workflow_steps").select("id, step_type, step_order, config, is_optional, is_blocking").eq("template_id", instance.template_id).order("step_order", { ascending: true });
        const { data: override } = await supabase.from("automation_org_overrides").select("optional_step_toggles").eq("org_id", instance.org_id).eq("template_id", instance.template_id).maybeSingle();
        const stepToggles = (override?.optional_step_toggles || {}) as Record<string, boolean>;

        const currentIdx = (steps || []).findIndex((s: StepRow) => s.id === instance.current_step_id);
        const nextStep = findNextEnabledStep(steps || [], currentIdx, stepToggles);

        if (!nextStep) {
          await supabase.from("automation_workflow_instances").update({ status: "completed", next_run_at: null, current_step_id: null, waiting_for_event_key: null, updated_at: new Date().toISOString() }).eq("id", instance.id);
        } else {
          await supabase.from("automation_workflow_instances").update({ status: "running", current_step_id: nextStep.id, next_run_at: new Date().toISOString(), waiting_for_event_key: null, updated_at: new Date().toISOString() }).eq("id", instance.id);
        }

        await supabase.from("automation_workflow_events").insert({ instance_id: instance.id, org_id: instance.org_id, event_type: "event_received", payload: { event_key: eventKey } });
        resumed++;
      }

      return new Response(JSON.stringify({ mode: "resume", resumed, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard tick: advance running instances
    const now = new Date().toISOString();
    const { data: instances, error: fetchErr } = await supabase
      .from("automation_workflow_instances")
      .select("*")
      .eq("status", "running")
      .lte("next_run_at", now)
      .is("waiting_for_event_key", null)
      .is("paused_at", null)
      .is("cancelled_at", null)
      .is("dead_lettered_at", null)
      .order("next_run_at", { ascending: true })
      .limit(limit);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let advanced = 0;
    const tickErrors: string[] = [];

    for (const raw of (instances || [])) {
      const instance = raw as unknown as WorkflowInstance;
      instance.context = (instance.context || {}) as Record<string, unknown>;
      processed++;

      const result = await advanceInstance(supabase, instance);
      if (result.advanced) advanced++;
      if (result.error) tickErrors.push(`${instance.id}: ${result.error}`);
    }

    console.log(`Workflow tick: ${processed} processed, ${advanced} advanced, ${tickErrors.length} errors`);

    return new Response(JSON.stringify({ mode: "tick", processed, advanced, errors: tickErrors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("workflow-tick error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
