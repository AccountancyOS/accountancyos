/**
 * Workflow Orchestrator
 * 
 * Advances workflow instances through their steps.
 * Called by the workflow-tick edge function on a schedule.
 * 
 * Responsibilities:
 * - Find instances ready to run (status=running, next_run_at <= now)
 * - Execute current step
 * - Advance to next step or complete workflow
 * - Handle errors and retries
 * - Log all events to automation_workflow_events
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { resolveStepsWithOverrides, type ResolvedStepConfig } from "./workflow-override-resolver";
import { executeStep } from "./workflow-step-executor";

/**
 * Skip forward from a CONDITION gate failure to the next WAIT_UNTIL step or end.
 * Returns the index of the next WAIT_UNTIL (or steps.length if none found).
 */
function skipUntilNextWaitOrEnd(steps: ResolvedStepConfig[], fromIdx: number): number {
  for (let i = fromIdx + 1; i < steps.length; i++) {
    if (steps[i].stepType === "WAIT_UNTIL" || steps[i].stepType === "WAIT_FOR_EVENT") {
      return i;
    }
  }
  return steps.length;
}

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
  error_message: string | null;
}

/**
 * Advance a single workflow instance.
 * Executes the current step and moves to the next.
 */
async function advanceInstance(instance: WorkflowInstance): Promise<{
  advanced: boolean;
  error?: string;
}> {
  try {
    // Resolve steps with org overrides
    const steps = await resolveStepsWithOverrides(instance.org_id, instance.template_id);
    if (steps.length === 0) {
      await completeInstance(instance.id, instance.org_id, "completed");
      return { advanced: true };
    }

    // Find current step index
    let currentIdx = steps.findIndex((s) => s.stepId === instance.current_step_id);
    if (currentIdx === -1) currentIdx = 0;

    const currentStep = steps[currentIdx];

    // Execute the step
    const result = await executeStep(currentStep, {
      instanceId: instance.id,
      orgId: instance.org_id,
      clientId: instance.client_id || undefined,
      companyId: instance.company_id || undefined,
      serviceId: instance.service_id || undefined,
      periodKey: instance.period_key,
      workflowContext: instance.context,
    });

    // Log step execution event
    await supabase.from("automation_workflow_events").insert({
      instance_id: instance.id,
      org_id: instance.org_id,
      step_id: currentStep.stepId,
      event_type: result.success ? "step_completed" : "step_failed",
      payload: {
        step_type: currentStep.stepType,
        result: result.data || {},
        error: result.error,
      } as Json,
    });

    if (!result.success) {
      // Mark instance as failed
      await supabase
        .from("automation_workflow_instances")
        .update({
          status: "failed",
          error_message: result.error || "Step execution failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", instance.id);

      return { advanced: false, error: result.error };
    }

    // Handle CONDITION gate failure: skip forward to next WAIT_UNTIL or end
    if (result.data?.skipped && result.data?.conditionFailed) {
      const nextWaitIdx = skipUntilNextWaitOrEnd(steps, currentIdx);
      if (nextWaitIdx >= steps.length) {
        await completeInstance(instance.id, instance.org_id, "completed");
        return { advanced: true };
      }
      const nextStep = steps[nextWaitIdx];
      await supabase
        .from("automation_workflow_instances")
        .update({
          current_step_id: nextStep.stepId,
          next_run_at: new Date().toISOString(),
          waiting_for_event_key: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", instance.id);

      // Log the skip
      await supabase.from("automation_workflow_events").insert({
        instance_id: instance.id,
        org_id: instance.org_id,
        step_id: currentStep.stepId,
        event_type: "condition_gate_skipped",
        payload: { skippedTo: nextStep.stepId, reason: result.data.reason } as Json,
      });

      return { advanced: true };
    }

    if (result.shouldWait) {
      // Pause the workflow
      await supabase
        .from("automation_workflow_instances")
        .update({
          next_run_at: result.nextRunAt || null,
          waiting_for_event_key: result.waitForEventKey || null,
          status: result.waitForEventKey ? "waiting" : "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", instance.id);

      return { advanced: true };
    }

    // Move to next enabled step
    let nextIdx = currentIdx + 1;
    while (nextIdx < steps.length) {
      const nextStep = steps[nextIdx];
      if (nextStep.isOptional && !nextStep.isEnabled) {
        nextIdx++;
        continue;
      }
      break;
    }

    if (nextIdx >= steps.length) {
      // All steps done
      await completeInstance(instance.id, instance.org_id, "completed");
      return { advanced: true };
    }

    // Advance to next step
    const nextStep = steps[nextIdx];
    await supabase
      .from("automation_workflow_instances")
      .update({
        current_step_id: nextStep.stepId,
        next_run_at: new Date().toISOString(), // run immediately
        waiting_for_event_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", instance.id);

    return { advanced: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("automation_workflow_instances")
      .update({
        status: "failed",
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", instance.id);

    return { advanced: false, error: errorMsg };
  }
}

/**
 * Complete a workflow instance.
 */
async function completeInstance(
  instanceId: string,
  orgId: string,
  status: "completed" | "cancelled"
): Promise<void> {
  await supabase
    .from("automation_workflow_instances")
    .update({
      status,
      next_run_at: null,
      waiting_for_event_key: null,
      current_step_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", instanceId);

  await supabase.from("automation_workflow_events").insert({
    instance_id: instanceId,
    org_id: orgId,
    event_type: status === "completed" ? "instance_completed" : "instance_cancelled",
    payload: {} as Json,
  });
}

/**
 * Process all ready workflow instances.
 * Called by the workflow-tick edge function.
 */
export async function tickWorkflows(
  limit: number = 50
): Promise<{ processed: number; advanced: number; errors: string[] }> {
  const now = new Date().toISOString();

  // Fetch instances ready to run
  const { data: instances, error } = await supabase
    .from("automation_workflow_instances")
    .select("*")
    .eq("status", "running")
    .lte("next_run_at", now)
    .is("waiting_for_event_key", null)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) return { processed: 0, advanced: 0, errors: [error.message] };
  if (!instances || instances.length === 0) return { processed: 0, advanced: 0, errors: [] };

  const errors: string[] = [];
  let advanced = 0;

  for (const raw of instances) {
    const instance: WorkflowInstance = {
      id: raw.id,
      org_id: raw.org_id,
      template_id: raw.template_id,
      client_id: raw.client_id,
      company_id: raw.company_id,
      service_id: raw.service_id,
      period_key: raw.period_key,
      status: raw.status,
      current_step_id: raw.current_step_id,
      context: (raw.context || {}) as Record<string, unknown>,
      next_run_at: raw.next_run_at,
      waiting_for_event_key: raw.waiting_for_event_key,
      error_message: raw.error_message,
    };

    const result = await advanceInstance(instance);
    if (result.advanced) advanced++;
    if (result.error) errors.push(`Instance ${instance.id}: ${result.error}`);
  }

  return { processed: instances.length, advanced, errors };
}

/**
 * Resume instances waiting for a specific event.
 */
export async function resumeWaitingInstances(
  eventKey: string
): Promise<{ resumed: number; errors: string[] }> {
  const { data: instances, error } = await supabase
    .from("automation_workflow_instances")
    .select("*")
    .eq("status", "waiting")
    .eq("waiting_for_event_key", eventKey);

  if (error) return { resumed: 0, errors: [error.message] };
  if (!instances || instances.length === 0) return { resumed: 0, errors: [] };

  const errors: string[] = [];
  let resumed = 0;

  for (const raw of instances) {
    // Move to next step by advancing current_step_id
    const instance: WorkflowInstance = {
      id: raw.id,
      org_id: raw.org_id,
      template_id: raw.template_id,
      client_id: raw.client_id,
      company_id: raw.company_id,
      service_id: raw.service_id,
      period_key: raw.period_key,
      status: raw.status,
      current_step_id: raw.current_step_id,
      context: (raw.context || {}) as Record<string, unknown>,
      next_run_at: raw.next_run_at,
      waiting_for_event_key: raw.waiting_for_event_key,
      error_message: raw.error_message,
    };

    // Find next step
    const steps = await resolveStepsWithOverrides(instance.org_id, instance.template_id);
    const currentIdx = steps.findIndex((s) => s.stepId === instance.current_step_id);
    
    let nextIdx = currentIdx + 1;
    while (nextIdx < steps.length) {
      if (steps[nextIdx].isOptional && !steps[nextIdx].isEnabled) {
        nextIdx++;
        continue;
      }
      break;
    }

    if (nextIdx >= steps.length) {
      await completeInstance(instance.id, instance.org_id, "completed");
    } else {
      await supabase
        .from("automation_workflow_instances")
        .update({
          status: "running",
          current_step_id: steps[nextIdx].stepId,
          next_run_at: new Date().toISOString(),
          waiting_for_event_key: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", instance.id);
    }

    // Log event
    await supabase.from("automation_workflow_events").insert({
      instance_id: instance.id,
      org_id: instance.org_id,
      event_type: "event_received",
      payload: { event_key: eventKey } as Json,
    });

    resumed++;
  }

  return { resumed, errors };
}
