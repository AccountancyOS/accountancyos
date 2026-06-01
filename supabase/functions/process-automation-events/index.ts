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
            status: "not_started",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    // Fetch unprocessed events
    let query = supabase
      .from("automation_events")
      .select("*")
      .is("processed_at", null)
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
    let processed = 0;

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
          allErrors.push(`Event ${typedEvent.id}: ${rulesError.message}`);
          continue;
        }

        if (!rules || rules.length === 0) {
          // No matching rules - mark as processed
          await supabase
            .from("automation_events")
            .update({ processed_at: new Date().toISOString() })
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

        // Mark event as processed
        await supabase
          .from("automation_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", typedEvent.id);

        processed++;
      } catch (err) {
        allErrors.push(`Event ${typedEvent.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    console.log(`Processing complete: ${processed} events, ${allErrors.length} errors`);

    return new Response(JSON.stringify({ processed, errors: allErrors }), {
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
