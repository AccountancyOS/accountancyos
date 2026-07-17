import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutomationEvent {
  id: string;
  organization_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface AutomationRule {
  id: string;
  organization_id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
}

// AUTO-1 — mirrors src/lib/automation-engine-model.ts (staleClaimCutoff / eventShouldDeadLetter).
// Keep in step with the pure model that the tests pin.
const STALE_CLAIM_MINUTES = 10;
function staleClaimCutoff(now: Date): string {
  return new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
}
const MAX_EVENT_ATTEMPTS = 5;
function eventShouldDeadLetter(attemptsAfterThisFailure: number): boolean {
  return attemptsAfterThisFailure >= MAX_EVENT_ATTEMPTS;
}

/**
 * Generate execution hash for idempotency
 */
function generateExecutionHash(ruleId: string, entityId: string, eventTimestamp: string): string {
  const truncatedTimestamp = eventTimestamp.slice(0, 16);
  return `${ruleId}:${entityId}:${truncatedTimestamp}`;
}

/**
 * Evaluate trigger conditions
 */
function evaluateTriggerConditions(rule: AutomationRule, event: AutomationEvent): boolean {
  if (rule.trigger_type !== event.event_type) return false;

  const conditions = rule.trigger_config;
  if (!conditions || Object.keys(conditions).length === 0) return true;

  switch (event.event_type) {
    case "job_status_change": {
      const { fromStatus, toStatus } = conditions as { fromStatus?: string; toStatus?: string };
      const oldStatus = event.old_value?.status;
      const newStatus = event.new_value?.status;
      if (fromStatus && oldStatus !== fromStatus) return false;
      if (toStatus && newStatus !== toStatus) return false;
      return true;
    }

    case "deadline_approaching": {
      const { daysThreshold, deadlineType } = conditions as { daysThreshold?: number; deadlineType?: string };
      const daysRemaining = event.new_value?.daysRemaining as number;
      const eventDeadlineType = event.metadata?.deadlineType;
      if (daysThreshold !== undefined && daysRemaining > daysThreshold) return false;
      if (deadlineType && eventDeadlineType !== deadlineType) return false;
      return true;
    }

    case "filing_status_change": {
      const { fromStatus, toStatus, filingType } = conditions as { fromStatus?: string; toStatus?: string; filingType?: string };
      const oldStatus = event.old_value?.status;
      const newStatus = event.new_value?.status;
      const eventFilingType = event.metadata?.filingType;
      if (fromStatus && oldStatus !== fromStatus) return false;
      if (toStatus && newStatus !== toStatus) return false;
      if (filingType && eventFilingType !== filingType) return false;
      return true;
    }

    case "client_onboarded":
    case "onboarding_approved": {
      const { clientType } = conditions as { clientType?: string };
      const eventClientType = event.metadata?.clientType;
      if (clientType && eventClientType !== clientType) return false;
      return true;
    }

    default:
      return false;
  }
}

/**
 * Prepare action config with event context
 */
function prepareActionConfig(actionConfig: Record<string, unknown>, event: AutomationEvent): Record<string, unknown> {
  const prepared = { ...actionConfig };

  if (event.entity_type === "client") {
    prepared.clientId = prepared.clientId || event.entity_id;
  } else if (event.entity_type === "company") {
    prepared.companyId = prepared.companyId || event.entity_id;
  } else if (event.entity_type === "job") {
    prepared.jobId = prepared.jobId || event.entity_id;
  }

  if (event.metadata) {
    if (event.metadata.clientId) prepared.clientId = prepared.clientId || event.metadata.clientId;
    if (event.metadata.companyId) prepared.companyId = prepared.companyId || event.metadata.companyId;
  }

  return prepared;
}

/**
 * Execute action based on type
 */
async function executeAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  actionType: string,
  config: Record<string, unknown>,
  context: { organizationId: string; triggeredByEntity: string; triggeredById: string }
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    switch (actionType) {
      case "create_job": {
        // Support both job_name and jobName for flexibility
        const { templateId, clientId, companyId, jobName, job_name, serviceType, dueDate } = config as {
          templateId?: string;
          clientId?: string;
          companyId?: string;
          jobName?: string;
          job_name?: string;
          serviceType?: string;
          dueDate?: string;
        };

        if (!serviceType) {
          return { success: false, error: "create_job action requires serviceType" };
        }

        const finalJobName = jobName || job_name || "Auto-generated Job";

        // automation_source must be 'manual', 'scheduled', or 'template'
        const validSource = context.triggeredByEntity === 'deadline' ? 'scheduled' : 'template';
        
        const { data, error } = await supabase
          .from("jobs")
          .insert({
            organization_id: context.organizationId,
            job_name: finalJobName,
            service_type: serviceType,
            // chk_jobs_status: blank is the canonical "new job" state.
            status: "blank",
            client_id: clientId ?? null,
            company_id: companyId ?? null,
            filing_deadline: dueDate ?? null,
            template_id: templateId ?? null,
            is_auto_generated: true,
            auto_generated_at: new Date().toISOString(),
            automation_source: validSource,
          })
          .select("id")
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: { jobId: data.id } };
      }

      case "create_task": {
        const { title, description, clientId, companyId, jobId, dueDate, visibility } = config as {
          title?: string;
          description?: string;
          clientId?: string;
          companyId?: string;
          jobId?: string;
          dueDate?: string;
          visibility?: string;
        };

        const { data, error } = await supabase
          .from("client_tasks")
          .insert({
            organization_id: context.organizationId,
            title: title || "Auto-generated Task",
            description: description || null,
            client_id: clientId ?? null,
            company_id: companyId ?? null,
            job_id: jobId ?? null,
            due_date: dueDate ?? null,
            visibility: visibility || "internal",
            status: "pending",
          })
          .select("id")
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: { taskId: data.id } };
      }

      case "send_email": {
        const { templateId, toEmail, subject, bodyHtml, mergeData, clientId, companyId } = config as {
          templateId?: string;
          toEmail?: string;
          subject?: string;
          bodyHtml?: string;
          mergeData?: Record<string, unknown>;
          clientId?: string;
          companyId?: string;
        };

        const { data, error } = await supabase
          .from("email_queue")
          .insert({
            organization_id: context.organizationId,
            to_email: toEmail || "",
            subject: subject || "Automated Notification",
            body_html: bodyHtml || "",
            template_id: templateId ?? null,
            merge_data: mergeData ?? {},
            entity_type: context.triggeredByEntity,
            entity_id: context.triggeredById,
            status: "pending",
          })
          .select("id")
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: { emailQueueId: data.id } };
      }

      case "send_notification": {
        const { userId, title, message, entityType, entityId, broadcastToOrg } = config as {
          userId?: string;
          title?: string;
          message?: string;
          entityType?: string;
          entityId?: string;
          broadcastToOrg?: boolean;
        };

        // If broadcastToOrg is true, send to all org users; otherwise require userId
        if (!userId && !broadcastToOrg) {
          // Get all users in organization
          const { data: orgUsers } = await supabase
            .from("organization_users")
            .select("user_id")
            .eq("organization_id", context.organizationId);

          if (orgUsers && orgUsers.length > 0) {
            const notifications = orgUsers.map((ou: { user_id: string }) => ({
              organization_id: context.organizationId,
              user_id: ou.user_id,
              type: "automation",
              title: title || "Notification",
              message: message || "",
              entity_type: entityType ?? context.triggeredByEntity,
              entity_id: entityId ?? context.triggeredById,
              is_read: false,
            }));

            const { error } = await supabase.from("notifications").insert(notifications);
            if (error) return { success: false, error: error.message };
            return { success: true, data: { notificationCount: notifications.length } };
          }
          return { success: false, error: "No users in organization to notify" };
        }

        const { data, error } = await supabase
          .from("notifications")
          .insert({
            organization_id: context.organizationId,
            user_id: userId,
            type: "automation",
            title: title || "Notification",
            message: message || "",
            entity_type: entityType ?? context.triggeredByEntity,
            entity_id: entityId ?? context.triggeredById,
            is_read: false,
          })
          .select("id")
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: { notificationId: data.id } };
      }

      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ============================================================
// Phase 2: trigger-contract routing
// ============================================================

/**
 * Alias map: chaser policy trigger_type ↔ automation event_type.
 * Most names match; this only lists the divergent ones.
 */
const POLICY_TRIGGER_ALIASES: Record<string, string[]> = {
  // event_type → list of policy trigger_type values that should respond
  CLIENT_SERVICE_ENABLED: ["SERVICE_ACTIVATED", "CLIENT_SERVICE_ENABLED"],
  CLIENT_ONBOARDED: ["CLIENT_ONBOARDED"],
};

function policyTriggersForEvent(eventType: string): string[] {
  return POLICY_TRIGGER_ALIASES[eventType] ?? [eventType];
}

/**
 * Map an event's entity_type to the chaser-run subject_type accepted by
 * `chk_chaser_run_subject_type`. Returns null for entities that don't have
 * a subject-based chaser model (e.g. jobs use job_id, not subject_id).
 */
function eventEntityToSubjectType(entityType: string): string | null {
  const allowed = new Set([
    "lead", "quote", "engagement_letter", "kyc_subject", "hmrc_auth",
    "onboarding_subject", "client_service", "records_request",
    "questionnaire_response", "workpaper", "deadline", "signature_request",
    "conversation", "invoice",
  ]);
  if (allowed.has(entityType)) return entityType;
  if (entityType === "onboarding") return "onboarding_subject";
  return null;
}

// In-request caches for kill-switch lookups.
const orgEnabledCache = new Map<string, boolean>();
const categoryEnabledCache = new Map<string, boolean>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isOrgAutomationsEnabled(supabase: any, organizationId: string): Promise<boolean> {
  if (orgEnabledCache.has(organizationId)) return orgEnabledCache.get(organizationId)!;
  const { data } = await supabase
    .from("organizations")
    .select("automations_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  const enabled = data?.automations_enabled !== false; // default true
  orgEnabledCache.set(organizationId, enabled);
  return enabled;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isCategoryEnabled(supabase: any, organizationId: string, category: string | null): Promise<boolean> {
  if (!category) return true;
  const cacheKey = `${organizationId}:${category}`;
  if (categoryEnabledCache.has(cacheKey)) return categoryEnabledCache.get(cacheKey)!;
  const { data } = await supabase
    .from("automation_category_settings")
    .select("is_enabled")
    .eq("organization_id", organizationId)
    .eq("category", category)
    .maybeSingle();
  const enabled = data?.is_enabled !== false; // default true (no row = enabled)
  categoryEnabledCache.set(cacheKey, enabled);
  return enabled;
}

/**
 * Route a single automation_event against the new trigger-contract layer:
 *  - QUOTE_ACCEPTED  → spawn workflow instances per automation_workflow_trigger_map.
 *  - LEAD_STAGE_CHANGED → stop CRM-followup chaser runs when stage advances or = lost.
 *  - QUOTE_REJECTED / QUOTE_EXPIRED → stop quote-chaser runs for that quote.
 *  - KYC_STATUS_CHANGED → stop kyc-subject chaser runs once subject is complete/waived.
 *
 * Safe to run for every event — non-matching types fall through silently.
 * Errors are surfaced to the caller for logging but never block legacy rule processing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function routeTriggerContractEvent(supabase: any, ev: AutomationEvent): Promise<void> {
  const type = ev.event_type;

  // 0. Kill switch — short-circuit ALL starts (stops still run so terminal
  //    events can clean up in-flight runs even when automations are disabled).
  const orgEnabled = await isOrgAutomationsEnabled(supabase, ev.organization_id);

  if (orgEnabled) {
    // 1. Workflow spawn for any event mapped via trigger contracts
    await spawnWorkflowInstancesForEvent(supabase, ev);

    // 2. Event-driven chaser run enqueue
    await enqueueEventDrivenChaserRuns(supabase, ev);
  }

  // 3. Subject-based stop logic (always runs)
  if (type === "LEAD_STAGE_CHANGED") {
    const newStage = String((ev.new_value?.stage ?? ev.new_value?.pipeline_stage ?? "")).toLowerCase();
    const stopStages = new Set(["qualified", "won", "converted", "lost", "dormant"]);
    if (stopStages.has(newStage)) {
      await stopSubjectRuns(supabase, ev.organization_id, "lead", ev.entity_id);
    }
    return;
  }

  if (type === "LEAD_LOST") {
    await stopSubjectRuns(supabase, ev.organization_id, "lead", ev.entity_id);
    return;
  }

  if (type === "QUOTE_REJECTED" || type === "QUOTE_EXPIRED") {
    await stopSubjectRuns(supabase, ev.organization_id, "quote", ev.entity_id);
    return;
  }

  if (type === "QUOTE_ACCEPTED") {
    // Accepted quotes no longer need chasing.
    await stopSubjectRuns(supabase, ev.organization_id, "quote", ev.entity_id);
    return;
  }

  if (type === "KYC_STATUS_CHANGED") {
    const status = String((ev.new_value?.subject_status ?? ev.new_value?.status ?? "")).toLowerCase();
    const terminal = new Set(["complete", "approved", "waived", "rejected", "expired", "replaced"]);
    if (terminal.has(status)) {
      await stopSubjectRuns(supabase, ev.organization_id, "kyc_subject", ev.entity_id);
    }
    return;
  }

  if (type === "ENGAGEMENT_LETTER_SIGNED") {
    await stopSubjectRuns(supabase, ev.organization_id, "engagement_letter", ev.entity_id);
    return;
  }

  if (type === "PAYMENT_RECEIVED") {
    const invoiceId = (ev.metadata?.invoiceId as string | undefined)
      ?? (ev.new_value?.invoice_id as string | undefined);
    if (invoiceId) {
      await stopSubjectRuns(supabase, ev.organization_id, "invoice", invoiceId);
    }
    return;
  }

  if (type === "QUESTIONNAIRE_SUBMITTED") {
    await stopSubjectRuns(supabase, ev.organization_id, "questionnaire_response", ev.entity_id);
    return;
  }
}

/**
 * Look up enabled chaser policies whose trigger_type matches this event and
 * ensure an ACTIVE chaser run exists for the subject. Idempotent via the
 * `uq_chaser_run_subject_policy` unique index.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enqueueEventDrivenChaserRuns(supabase: any, ev: AutomationEvent): Promise<void> {
  const subjectType = eventEntityToSubjectType(ev.entity_type);
  if (!subjectType) return;

  const triggerTypes = policyTriggersForEvent(ev.event_type);

  const { data: policies, error } = await supabase
    .from("automation_chaser_policies")
    .select("id, organization_id, category, trigger_type, frequency_unit, frequency_interval, trigger_offset_days, email_template_id, stop_condition_value, is_enabled, paused_at")
    .eq("organization_id", ev.organization_id)
    .in("trigger_type", triggerTypes)
    .eq("is_enabled", true);

  if (error) {
    console.warn(`[process-automation-events] policy lookup failed for event ${ev.id}: ${error.message}`);
    return;
  }
  if (!policies || policies.length === 0) return;

  const now = new Date();
  const triggerDate = ev.created_at ?? now.toISOString();

  for (const p of policies) {
    if (p.paused_at) continue;
    if (!(await isCategoryEnabled(supabase, ev.organization_id, p.category))) continue;

    const firstSend = new Date(triggerDate);
    firstSend.setDate(firstSend.getDate() + (p.trigger_offset_days || 0));
    const nextSendAt = (firstSend < now ? now : firstSend).toISOString();

    const payload = {
      organization_id: ev.organization_id,
      policy_id: p.id,
      job_id: null,
      subject_type: subjectType,
      subject_id: ev.entity_id,
      status: "ACTIVE",
      trigger_date: triggerDate,
      next_send_at: nextSendAt,
      frequency_unit: p.frequency_unit,
      frequency_interval: p.frequency_interval,
      email_template_id: p.email_template_id,
      stop_condition_value: p.stop_condition_value,
    };

    const { error: insErr } = await supabase
      .from("automation_chaser_runs")
      .insert(payload);

    // 23505 = unique violation → an ACTIVE run for this (subject, policy)
    // already exists. That's the intended idempotent outcome.
    if (insErr && insErr.code !== "23505") {
      console.warn(`[process-automation-events] chaser enqueue failed for policy ${p.id} on event ${ev.id}: ${insErr.message}`);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function spawnWorkflowInstancesForEvent(supabase: any, ev: AutomationEvent): Promise<void> {
  // Find trigger contract id for this event_type
  const { data: contract } = await supabase
    .from("automation_trigger_contracts")
    .select("id")
    .eq("key", ev.event_type)
    .eq("is_active", true)
    .maybeSingle();

  if (!contract?.id) return;

  // Find mapped templates
  const { data: maps } = await supabase
    .from("automation_workflow_trigger_map")
    .select("workflow_template_id, filter_config")
    .eq("trigger_contract_id", contract.id);

  if (!maps || maps.length === 0) return;

  for (const m of maps) {
    // Skip if org disabled this template via override
    const { data: tpl } = await supabase
      .from("automation_workflow_templates")
      .select("id, org_id, default_enabled")
      .eq("id", m.workflow_template_id)
      .maybeSingle();

    if (!tpl) continue;
    // Skip per-org templates that belong to a different org
    if (tpl.org_id && tpl.org_id !== ev.organization_id) continue;

    // Resolve subject IDs based on the source entity (quote, lead, client, etc.)
    const subject = await resolveWorkflowSubject(supabase, ev);

    // Build period_key — for ad-hoc trigger-driven workflows use the event id
    const periodKey = `event:${ev.id}`;

    const insertPayload = {
      org_id: ev.organization_id,
      template_id: tpl.id,
      client_id: subject.clientId,
      company_id: subject.companyId,
      service_id: null,
      period_key: periodKey,
      status: "QUEUED",
      next_run_at: new Date().toISOString(),
      triggering_event_key: ev.event_type,
      triggering_event_id: ev.id,
      context: {
        ...subject.context,
        event_id: ev.id,
        event_type: ev.event_type,
      },
    };

    const { error: insertErr } = await supabase
      .from("automation_workflow_instances")
      .insert(insertPayload);

    if (insertErr && insertErr.code !== "23505") {
      // 23505 = unique violation (already spawned for this period_key) — idempotent
      console.warn(
        `[process-automation-events] workflow spawn failed for template ${tpl.id} on event ${ev.id}: ${insertErr.message}`,
      );
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveWorkflowSubject(
  supabase: any,
  ev: AutomationEvent,
): Promise<{ clientId: string | null; companyId: string | null; context: Record<string, unknown> }> {
  const ctx: Record<string, unknown> = {};

  if (ev.entity_type === "quote") {
    const { data: q } = await supabase
      .from("quotes")
      .select("id, client_id, company_id, lead_id, ported_to_client_id")
      .eq("id", ev.entity_id)
      .maybeSingle();
    if (q) {
      ctx.quoteId = q.id;
      if (q.lead_id) ctx.leadId = q.lead_id;
      return {
        clientId: q.client_id || q.ported_to_client_id || null,
        companyId: q.company_id || null,
        context: ctx,
      };
    }
  }

  if (ev.entity_type === "client") {
    return { clientId: ev.entity_id, companyId: null, context: ctx };
  }

  if (ev.entity_type === "company") {
    return { clientId: null, companyId: ev.entity_id, context: ctx };
  }

  if (ev.entity_type === "lead") {
    ctx.leadId = ev.entity_id;
    return { clientId: null, companyId: null, context: ctx };
  }

  return { clientId: null, companyId: null, context: ctx };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stopSubjectRuns(
  supabase: any,
  organizationId: string,
  subjectType: string,
  subjectId: string,
): Promise<void> {
  const { data: runs } = await supabase
    .from("automation_chaser_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("status", "ACTIVE");

  if (!runs || runs.length === 0) return;

  const ids = runs.map((r: { id: string }) => r.id);

  await supabase
    .from("automation_chaser_runs")
    .update({ status: "STOPPED", next_send_at: null, updated_at: new Date().toISOString() })
    .in("id", ids);

  await supabase
    .from("automation_chaser_messages")
    .update({ status: "CANCELLED" })
    .in("chaser_run_id", ids)
    .eq("status", "QUEUED");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // FUN-2/Fix: cron/internal-only worker (verify_jwt=false). Require the service-role key so it
  // is not anonymously invokable (it processes automation events across all orgs).
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for optional parameters
    let organizationId: string | undefined;
    let limit = 50;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        organizationId = body.organization_id;
        limit = body.limit || 50;
      } catch {
        // No body or invalid JSON - use defaults
      }
    }

    console.log(`Processing automation events. Org: ${organizationId || "all"}, Limit: ${limit}`);

    // Fetch claimable events: unprocessed, not dead-lettered, and not currently claimed by another
    // concurrent run (a claim older than the stale window may be reclaimed). AUTO-1 inc 2.
    const staleClaimBefore = staleClaimCutoff(new Date());
    let query = supabase
      .from("automation_events")
      .select("*")
      .is("processed_at", null)
      .is("failed_at", null)
      .or(`claimed_at.is.null,claimed_at.lt.${staleClaimBefore}`)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data: events, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to fetch events:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!events || events.length === 0) {
      console.log("No unprocessed events found");
      return new Response(JSON.stringify({ processed: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${events.length} unprocessed events`);

    const allErrors: string[] = [];
    const scanned = events.length;
    let claimed = 0;
    let processed = 0;
    let skippedClaimLost = 0;
    let deadLettered = 0;

    for (const event of events) {
      const typedEvent: AutomationEvent = {
        id: event.id,
        organization_id: event.organization_id,
        event_type: event.event_type,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        old_value: event.old_value as Record<string, unknown> | null,
        new_value: event.new_value as Record<string, unknown> | null,
        metadata: (event.metadata || {}) as Record<string, unknown>,
        created_at: event.created_at,
      };

      // Atomic claim BEFORE any routing/execution: if a concurrent run claimed this event first,
      // skip it. This is what stops routeTriggerContractEvent (which has no idempotency guard of
      // its own) from double-spawning workflows. Same idiom as workflow-tick / the email worker.
      const { data: claimRow } = await supabase
        .from("automation_events")
        .update({ claimed_at: new Date().toISOString() })
        .eq("id", typedEvent.id)
        .or(`claimed_at.is.null,claimed_at.lt.${staleClaimBefore}`)
        .select("id")
        .maybeSingle();

      if (!claimRow) {
        skippedClaimLost++;
        continue;
      }
      claimed++;

      try {
        // ------------------------------------------------------------
        // Phase 2: trigger-contract routing (workflow spawn + chaser stop)
        // Runs BEFORE legacy automation_rules so subject events get
        // handled even when no legacy rule exists for them.
        // ------------------------------------------------------------
        try {
          await routeTriggerContractEvent(supabase, typedEvent);
        } catch (routeErr) {
          allErrors.push(`Event ${typedEvent.id} routing: ${routeErr instanceof Error ? routeErr.message : "Unknown"}`);
        }

        // Find matching rules
        const { data: rules, error: rulesError } = await supabase
          .from("automation_rules")
          .select("*")
          .eq("organization_id", typedEvent.organization_id)
          .eq("trigger_type", typedEvent.event_type)
          .eq("is_active", true);

        if (rulesError) {
          // Transient read error — leave processed_at NULL to retry, but release the claim so the
          // next run picks it straight up instead of waiting out the 10-minute stale window. Not
          // counted as an attempt: this is a lookup failure, not a poison event.
          allErrors.push(`Event ${typedEvent.id}: ${rulesError.message}`);
          await supabase
            .from("automation_events")
            .update({ claimed_at: null })
            .eq("id", typedEvent.id);
          continue;
        }

        if (!rules || rules.length === 0) {
          // No matching rules - mark as processed and release the claim. (Trigger-contract routing
          // above may still have spawned a workflow; legacy rules simply had no match.)
          await supabase
            .from("automation_events")
            .update({ processed_at: new Date().toISOString(), claimed_at: null })
            .eq("id", typedEvent.id);
          processed++;
          continue;
        }

        // Evaluate and execute each rule
        for (const rule of rules) {
          const typedRule: AutomationRule = {
            id: rule.id,
            organization_id: rule.organization_id,
            name: rule.name,
            trigger_type: rule.trigger_type,
            trigger_config: rule.trigger_config as Record<string, unknown> | null,
            action_type: rule.action_type,
            action_config: rule.action_config as Record<string, unknown>,
            is_active: rule.is_active ?? true,
          };

          if (!evaluateTriggerConditions(typedRule, typedEvent)) {
            continue;
          }

          const executionHash = generateExecutionHash(typedRule.id, typedEvent.entity_id, typedEvent.created_at);

          // Check idempotency
          const { data: canExecute } = await supabase.rpc("can_execute_automation", {
            p_rule_id: typedRule.id,
            p_execution_hash: executionHash,
          });

          if (!canExecute) continue;

          // Record as running
          await supabase.rpc("record_automation_execution", {
            p_organization_id: typedEvent.organization_id,
            p_rule_id: typedRule.id,
            p_triggered_by_entity: typedEvent.entity_type,
            p_triggered_by_id: typedEvent.entity_id,
            p_execution_hash: executionHash,
            p_status: "running",
            p_error_message: null,
            p_action_result: {},
          });

          // Execute action
          const preparedConfig = prepareActionConfig(typedRule.action_config, typedEvent);
          const actionResult = await executeAction(supabase, typedRule.action_type, preparedConfig, {
            organizationId: typedEvent.organization_id,
            triggeredByEntity: typedEvent.entity_type,
            triggeredById: typedEvent.entity_id,
          });

          // Update execution status
          await supabase.rpc("record_automation_execution", {
            p_organization_id: typedEvent.organization_id,
            p_rule_id: typedRule.id,
            p_triggered_by_entity: typedEvent.entity_type,
            p_triggered_by_id: typedEvent.entity_id,
            p_execution_hash: executionHash,
            p_status: actionResult.success ? "success" : "failed",
            p_error_message: actionResult.error || null,
            p_action_result: actionResult.data || {},
          });

          if (!actionResult.success) {
            allErrors.push(`Rule ${typedRule.name}: ${actionResult.error}`);
          }

          console.log(`Executed rule "${typedRule.name}" for event ${typedEvent.id}: ${actionResult.success ? "success" : "failed"}`);
        }

        // Mark event as processed and release the claim.
        await supabase
          .from("automation_events")
          .update({ processed_at: new Date().toISOString(), claimed_at: null })
          .eq("id", typedEvent.id);

        processed++;
      } catch (err) {
        // AUTO-1 inc 2: this used to only push to allErrors and leave processed_at NULL, so the
        // event was re-selected and retried on every run forever. Now bound it: increment attempts,
        // record the error, release the claim, and after MAX_EVENT_ATTEMPTS stamp failed_at (a
        // visible dead-letter excluded from selection) instead of retrying indefinitely.
        const message = err instanceof Error ? err.message : "Unknown error";
        allErrors.push(`Event ${typedEvent.id}: ${message}`);

        const attemptsAfter = ((event.attempts as number | null) ?? 0) + 1;
        const deadLetter = eventShouldDeadLetter(attemptsAfter);
        await supabase
          .from("automation_events")
          .update({
            attempts: attemptsAfter,
            last_error: message,
            claimed_at: null,
            failed_at: deadLetter ? new Date().toISOString() : null,
          })
          .eq("id", typedEvent.id);
        if (deadLetter) deadLettered++;
      }
    }

    const summary = {
      scanned,
      claimed,
      processed,
      skipped_claim_lost: skippedClaimLost,
      dead_lettered: deadLettered,
      errors: allErrors.length,
    };
    console.log("[process-automation-events]", JSON.stringify(summary));

    return new Response(JSON.stringify({ ...summary, processed, errorDetail: allErrors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
