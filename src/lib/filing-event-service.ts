/**
 * Filing Event Service
 * Emits filing events for automation engine compatibility
 */

import { supabase } from "@/integrations/supabase/client";

export interface FilingEvent {
  eventType: string;
  filingId: string;
  filingType: string;
  status: string;
  organizationId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Filing event type mapping for consistent naming
export const FILING_EVENT_TYPES = {
  // RTI events
  RTI_FPS_SUBMITTED: 'rti_fps_submitted',
  RTI_FPS_ACCEPTED: 'rti_fps_accepted',
  RTI_FPS_REJECTED: 'rti_fps_rejected',
  RTI_EPS_SUBMITTED: 'rti_eps_submitted',
  RTI_EPS_ACCEPTED: 'rti_eps_accepted',
  RTI_EPS_REJECTED: 'rti_eps_rejected',
  RTI_P45_SUBMITTED: 'rti_p45_submitted',
  RTI_P45_ACCEPTED: 'rti_p45_accepted',
  RTI_P46_SUBMITTED: 'rti_p46_submitted',
  RTI_P46_ACCEPTED: 'rti_p46_accepted',
  
  // CIS events
  CIS_RETURN_SUBMITTED: 'cis_return_submitted',
  CIS_RETURN_ACCEPTED: 'cis_return_accepted',
  CIS_RETURN_REJECTED: 'cis_return_rejected',
  CIS_VERIFICATION_SUBMITTED: 'cis_verification_submitted',
  CIS_VERIFICATION_ACCEPTED: 'cis_verification_accepted',
  
  // Standard filing events
  FILING_SUBMITTED: 'filing_submitted',
  FILING_ACCEPTED: 'filing_accepted',
  FILING_REJECTED: 'filing_rejected',
  FILING_SENT_FOR_APPROVAL: 'filing_sent_for_approval',
  FILING_CLIENT_APPROVED: 'filing_client_approved',
  FILING_CLIENT_REJECTED: 'filing_client_rejected',
} as const;

/**
 * Emit a filing event for the automation engine
 * Events are stored in filing_events table for processing
 */
export async function emitFilingEvent(event: FilingEvent): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('filing_events')
      .insert({
        organization_id: event.organizationId,
        event_type: event.eventType,
        filing_id: event.filingId,
        filing_type: event.filingType,
        status: event.status,
        emitted_at: event.timestamp,
        metadata: event.metadata || {},
      });

    if (error) {
      console.error('[Filing Event] Failed to emit event:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Filing Event] Emitted ${event.eventType} for filing ${event.filingId}`);
    return { success: true };
  } catch (err: any) {
    console.error('[Filing Event] Error emitting event:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Generate event type from filing type and action
 */
export function getFilingEventType(filingType: string, action: 'submitted' | 'accepted' | 'rejected'): string {
  const normalizedType = filingType.toLowerCase().replace(/_/g, '_');
  return `${normalizedType}_${action}`;
}

/**
 * Emit submission event
 */
export async function emitFilingSubmittedEvent(
  filingId: string,
  filingType: string,
  organizationId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await emitFilingEvent({
    eventType: getFilingEventType(filingType, 'submitted'),
    filingId,
    filingType,
    status: 'submitted',
    organizationId,
    timestamp: new Date().toISOString(),
    metadata,
  });
}

/**
 * Emit acceptance event
 */
export async function emitFilingAcceptedEvent(
  filingId: string,
  filingType: string,
  organizationId: string,
  filingReference?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await emitFilingEvent({
    eventType: getFilingEventType(filingType, 'accepted'),
    filingId,
    filingType,
    status: 'accepted',
    organizationId,
    timestamp: new Date().toISOString(),
    metadata: { ...metadata, filing_reference: filingReference },
  });
}

/**
 * Emit rejection event
 */
export async function emitFilingRejectedEvent(
  filingId: string,
  filingType: string,
  organizationId: string,
  reason?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await emitFilingEvent({
    eventType: getFilingEventType(filingType, 'rejected'),
    filingId,
    filingType,
    status: 'rejected',
    organizationId,
    timestamp: new Date().toISOString(),
    metadata: { ...metadata, rejection_reason: reason },
  });
}
