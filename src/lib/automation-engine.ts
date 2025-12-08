import { supabase } from "@/integrations/supabase/client";
import { executeAction, AutomationActionType } from "./automation-actions";
import type { Json } from "@/integrations/supabase/types";

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

interface ProcessResult {
  eventId: string;
  rulesMatched: number;
  executionsRun: number;
  errors: string[];
}

/**
 * Generate a unique execution hash for idempotency.
 * Format: {rule_id}:{entity_id}:{event_timestamp}
 */
function generateExecutionHash(
  ruleId: string, 
  entityId: string, 
  eventTimestamp: string
): string {
  // Truncate timestamp to minute to allow some wiggle room
  const truncatedTimestamp = eventTimestamp.slice(0, 16);
  return `${ruleId}:${entityId}:${truncatedTimestamp}`;
}

/**
 * Check if a rule's trigger conditions match the event.
 */
function evaluateTriggerConditions(
  rule: AutomationRule,
  event: AutomationEvent
): boolean {
  // Rule trigger_type must match event event_type
  if (rule.trigger_type !== event.event_type) {
    return false;
  }

  const conditions = rule.trigger_config;
  if (!conditions || Object.keys(conditions).length === 0) {
    // No additional conditions - trigger matches
    return true;
  }

  // Evaluate specific conditions based on event type
  switch (event.event_type) {
    case 'job_status_change': {
      const { fromStatus, toStatus } = conditions as { 
        fromStatus?: string; 
        toStatus?: string; 
      };
      const oldStatus = event.old_value?.status;
      const newStatus = event.new_value?.status;
      
      if (fromStatus && oldStatus !== fromStatus) return false;
      if (toStatus && newStatus !== toStatus) return false;
      return true;
    }

    case 'deadline_approaching': {
      const { daysThreshold, deadlineType } = conditions as { 
        daysThreshold?: number; 
        deadlineType?: string; 
      };
      const daysRemaining = event.new_value?.daysRemaining as number;
      const eventDeadlineType = event.metadata?.deadlineType;
      
      if (daysThreshold !== undefined && daysRemaining > daysThreshold) return false;
      if (deadlineType && eventDeadlineType !== deadlineType) return false;
      return true;
    }

    case 'filing_status_change': {
      const { fromStatus, toStatus, filingType } = conditions as { 
        fromStatus?: string; 
        toStatus?: string;
        filingType?: string;
      };
      const oldStatus = event.old_value?.status;
      const newStatus = event.new_value?.status;
      const eventFilingType = event.metadata?.filingType;
      
      if (fromStatus && oldStatus !== fromStatus) return false;
      if (toStatus && newStatus !== toStatus) return false;
      if (filingType && eventFilingType !== filingType) return false;
      return true;
    }

    case 'client_onboarded':
    case 'onboarding_approved': {
      const { clientType } = conditions as { clientType?: string };
      const eventClientType = event.metadata?.clientType;
      
      if (clientType && eventClientType !== clientType) return false;
      return true;
    }

    default:
      // Unknown event type - don't match
      return false;
  }
}

/**
 * Prepare action config with event context.
 * Replaces placeholders with actual values from the event.
 */
function prepareActionConfig(
  actionConfig: Record<string, unknown>,
  event: AutomationEvent
): Record<string, unknown> {
  const prepared = { ...actionConfig };
  
  // Inject event context
  if (event.entity_type === 'client') {
    prepared.clientId = prepared.clientId || event.entity_id;
  } else if (event.entity_type === 'company') {
    prepared.companyId = prepared.companyId || event.entity_id;
  } else if (event.entity_type === 'job') {
    prepared.jobId = prepared.jobId || event.entity_id;
  }

  // Inject metadata values
  if (event.metadata) {
    if (event.metadata.clientId) prepared.clientId = prepared.clientId || event.metadata.clientId;
    if (event.metadata.companyId) prepared.companyId = prepared.companyId || event.metadata.companyId;
  }

  return prepared;
}

/**
 * Process a single automation event.
 * Finds matching rules and executes their actions.
 */
export async function processAutomationEvent(
  event: AutomationEvent
): Promise<ProcessResult> {
  const result: ProcessResult = {
    eventId: event.id,
    rulesMatched: 0,
    executionsRun: 0,
    errors: []
  };

  try {
    // 1. Find active rules for this organization that match the event type
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('organization_id', event.organization_id)
      .eq('trigger_type', event.event_type)
      .eq('is_active', true);

    if (rulesError) {
      result.errors.push(`Failed to fetch rules: ${rulesError.message}`);
      return result;
    }

    if (!rules || rules.length === 0) {
      // No matching rules - mark event as processed
      await markEventProcessed(event.id, null);
      return result;
    }

    // 2. Evaluate each rule's conditions
    for (const rule of rules) {
      const ruleTyped: AutomationRule = {
        id: rule.id,
        organization_id: rule.organization_id,
        name: rule.name,
        trigger_type: rule.trigger_type,
        trigger_config: rule.trigger_config as Record<string, unknown> | null,
        action_type: rule.action_type,
        action_config: rule.action_config as Record<string, unknown>,
        is_active: rule.is_active ?? true
      };
      
      if (!evaluateTriggerConditions(ruleTyped, event)) {
        continue;
      }

      result.rulesMatched++;

      // 3. Generate execution hash for idempotency
      const executionHash = generateExecutionHash(
        ruleTyped.id,
        event.entity_id,
        event.created_at
      );

      // 4. Check if already executed (idempotency check)
      const { data: canExecute } = await supabase.rpc('can_execute_automation', {
        p_rule_id: ruleTyped.id,
        p_execution_hash: executionHash
      });

      if (!canExecute) {
        // Already executed - skip
        continue;
      }

      // 5. Record execution as pending
      const { data: executionId, error: recordError } = await supabase.rpc(
        'record_automation_execution',
        {
          p_organization_id: event.organization_id,
          p_rule_id: ruleTyped.id,
          p_triggered_by_entity: event.entity_type,
          p_triggered_by_id: event.entity_id,
          p_execution_hash: executionHash,
          p_status: 'running',
          p_error_message: null,
          p_action_result: {} as Json
        }
      );

      if (recordError) {
        result.errors.push(`Failed to record execution: ${recordError.message}`);
        continue;
      }

      // 6. Prepare action config with event context
      const preparedConfig = prepareActionConfig(
        ruleTyped.action_config,
        event
      );

      // 7. Execute the action
      const actionResult = await executeAction(
        ruleTyped.action_type as AutomationActionType,
        preparedConfig,
        {
          organizationId: event.organization_id,
          triggeredByEntity: event.entity_type,
          triggeredById: event.entity_id,
          metadata: event.metadata
        }
      );

      // 8. Update execution status
      await supabase.rpc('record_automation_execution', {
        p_organization_id: event.organization_id,
        p_rule_id: ruleTyped.id,
        p_triggered_by_entity: event.entity_type,
        p_triggered_by_id: event.entity_id,
        p_execution_hash: executionHash,
        p_status: actionResult.success ? 'success' : 'failed',
        p_error_message: actionResult.error || null,
        p_action_result: (actionResult.data || {}) as Json
      });

      result.executionsRun++;

      if (!actionResult.success) {
        result.errors.push(`Action failed for rule ${ruleTyped.name}: ${actionResult.error}`);
      }
    }

    // 9. Mark event as processed
    await markEventProcessed(event.id, null);

  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

/**
 * Mark an event as processed.
 */
async function markEventProcessed(
  eventId: string,
  executionId: string | null
): Promise<void> {
  await supabase
    .from('automation_events')
    .update({
      processed_at: new Date().toISOString(),
      processed_by_execution_id: executionId
    })
    .eq('id', eventId);
}

/**
 * Process all unprocessed automation events for an organization.
 * Called by edge function or scheduled job.
 */
export async function processUnprocessedEvents(
  organizationId?: string,
  limit: number = 50
): Promise<{ processed: number; errors: string[] }> {
  let query = supabase
    .from('automation_events')
    .select('*')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data: events, error } = await query;

  if (error) {
    return { processed: 0, errors: [error.message] };
  }

  if (!events || events.length === 0) {
    return { processed: 0, errors: [] };
  }

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
      created_at: event.created_at
    };
    const result = await processAutomationEvent(typedEvent);
    processed++;
    allErrors.push(...result.errors);
  }

  return { processed, errors: allErrors };
}
