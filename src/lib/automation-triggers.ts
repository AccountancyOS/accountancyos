import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// Event types for the automation system
export type AutomationEventType = 
  | 'job_status_change'
  | 'deadline_approaching'
  | 'client_onboarded'
  | 'filing_status_change'
  | 'onboarding_approved';

export type EntityType = 'job' | 'deadline' | 'client' | 'filing' | 'onboarding' | 'company';

interface EmitEventParams {
  organizationId: string;
  eventType: AutomationEventType;
  entityType: EntityType;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Emit an automation event to be processed by the automation engine.
 * This is the central entry point for all automation triggers.
 */
export async function emitAutomationEvent({
  organizationId,
  eventType,
  entityType,
  entityId,
  oldValue = null,
  newValue = null,
  metadata = {}
}: EmitEventParams): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_automation_event', {
      p_organization_id: organizationId,
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_old_value: oldValue as Json,
      p_new_value: newValue as Json,
      p_metadata: metadata as Json
    });

    if (error) {
      console.error('Failed to emit automation event:', error);
      return null;
    }

    return data as string;
  } catch (err) {
    console.error('Error emitting automation event:', err);
    return null;
  }
}

/**
 * Emit a job status change event.
 * Called when a job's status is updated.
 */
export async function emitJobStatusChange(
  organizationId: string,
  jobId: string,
  oldStatus: string,
  newStatus: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'job_status_change',
    entityType: 'job',
    entityId: jobId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    metadata: { ...metadata, oldStatus, newStatus }
  });
}

/**
 * Emit a deadline approaching event.
 * Called when a deadline enters its warning window.
 */
export async function emitDeadlineApproaching(
  organizationId: string,
  deadlineId: string,
  dueDate: string,
  daysRemaining: number,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'deadline_approaching',
    entityType: 'deadline',
    entityId: deadlineId,
    newValue: { dueDate, daysRemaining },
    metadata: { ...metadata, dueDate, daysRemaining }
  });
}

/**
 * Emit a client onboarded event.
 * Called when a client's onboarding is approved and they become active.
 */
export async function emitClientOnboarded(
  organizationId: string,
  clientId: string,
  clientType: 'client' | 'company',
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'client_onboarded',
    entityType: clientType,
    entityId: clientId,
    newValue: { status: 'active' },
    metadata: { ...metadata, clientType }
  });
}

/**
 * Emit an onboarding approved event.
 * Called when an onboarding application is approved.
 */
export async function emitOnboardingApproved(
  organizationId: string,
  onboardingId: string,
  clientId?: string,
  companyId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'onboarding_approved',
    entityType: 'onboarding',
    entityId: onboardingId,
    newValue: { status: 'approved', clientId, companyId },
    metadata: { ...metadata, clientId, companyId }
  });
}

/**
 * Emit a filing status change event.
 * Called when a filing's status is updated.
 */
export async function emitFilingStatusChange(
  organizationId: string,
  filingId: string,
  oldStatus: string,
  newStatus: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'filing_status_change',
    entityType: 'filing',
    entityId: filingId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    metadata: { ...metadata, oldStatus, newStatus }
  });
}
