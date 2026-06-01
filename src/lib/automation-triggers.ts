import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { routeTriggerEvent, type TriggerPayload } from "./workflow-trigger-router";

// Event types — MUST match keys in `automation_trigger_contracts`
// (registry uses UPPERCASE — keep these aligned).
export type AutomationEventType =
  | 'JOB_STATUS_CHANGED'
  | 'DEADLINE_APPROACHING'
  | 'CLIENT_CREATED'
  | 'CLIENT_ONBOARDED'
  | 'CLIENT_SERVICE_ENABLED'
  | 'FILING_ACCEPTED'
  | 'ONBOARDING_APPROVED'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'INVOICE_ISSUED'
  | 'INVOICE_OVERDUE'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_DUE_DATE_SET'
  | 'LEAD_CREATED'
  | 'LEAD_STAGE_CHANGED'
  | 'LEAD_LOST'
  | 'LEAD_DORMANT'
  | 'ENGAGEMENT_LETTER_SENT'
  | 'ENGAGEMENT_LETTER_SIGNED'
  | 'KYC_STATUS_CHANGED'
  | 'HMRC_AUTH_REQUESTED'
  | 'QUESTIONNAIRE_SENT'
  | 'QUESTIONNAIRE_SUBMITTED'
  | 'CONVERSATION_RECEIVED'
  | 'RECORDS_REQUESTED'
  | 'WORKPAPER_CREATED'
  | 'SIGNATURE_REQUESTED';

export type EntityType =
  | 'job' | 'deadline' | 'client' | 'filing' | 'onboarding' | 'company'
  | 'quote' | 'invoice' | 'payment' | 'lead' | 'engagement_letter'
  | 'kyc_subject' | 'hmrc_auth' | 'questionnaire_response' | 'conversation'
  | 'records_request' | 'workpaper' | 'signature_request' | 'client_service';

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
 * Emit an automation event to be processed by both the legacy
 * automation engine (automation_rules) and the new workflow engine.
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
    // 1. Emit legacy automation event
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
    }

    // 2. Also route to new workflow engine (event keys already match contract keys)
    const triggerKey = eventType;
    if (triggerKey) {
      const payload: TriggerPayload = {
        triggerKey,
        organizationId,
        clientId: (metadata?.clientId as string) || undefined,
        companyId: (metadata?.companyId as string) || undefined,
        serviceId: (metadata?.serviceId as string) || undefined,
        periodKey: (metadata?.periodKey as string) || generatePeriodKey(),
        eventId: data as string || undefined,
        context: {
          ...metadata,
          entityType,
          entityId,
          eventType,
          oldValue,
          newValue,
        },
      };

      // Inject entity-specific IDs
      if (entityType === 'client') payload.clientId = payload.clientId || entityId;
      if (entityType === 'company') payload.companyId = payload.companyId || entityId;

      try {
        const result = await routeTriggerEvent(payload);
        if (result.errors.length > 0) {
          console.warn('Workflow routing errors:', result.errors);
        }
      } catch (routeErr) {
        // Don't fail the whole event emission if workflow routing fails
        console.error('Workflow routing failed:', routeErr);
      }
    }

    return data as string;
  } catch (err) {
    console.error('Error emitting automation event:', err);
    return null;
  }
}

/**
 * Generate a period key based on current tax year.
 * Format: YYYY-YY (e.g., 2025-26)
 */
function generatePeriodKey(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  // UK tax year starts April 6
  const taxYear = month >= 3 ? year : year - 1;
  const nextYear = (taxYear + 1) % 100;
  return `${taxYear}-${String(nextYear).padStart(2, '0')}`;
}

/**
 * Emit a job status change event.
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
    eventType: 'JOB_STATUS_CHANGED',
    entityType: 'job',
    entityId: jobId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    metadata: { ...metadata, oldStatus, newStatus }
  });
}

/**
 * Emit a deadline approaching event.
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
    eventType: 'DEADLINE_APPROACHING',
    entityType: 'deadline',
    entityId: deadlineId,
    newValue: { dueDate, daysRemaining },
    metadata: { ...metadata, dueDate, daysRemaining }
  });
}

/**
 * Emit a client onboarded event.
 */
export async function emitClientOnboarded(
  organizationId: string,
  clientId: string,
  clientType: 'client' | 'company',
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'CLIENT_ONBOARDED',
    entityType: clientType,
    entityId: clientId,
    newValue: { status: 'active' },
    metadata: { ...metadata, clientType }
  });
}

/**
 * Emit an onboarding approved event.
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
    eventType: 'ONBOARDING_APPROVED',
    entityType: 'onboarding',
    entityId: onboardingId,
    newValue: { status: 'approved', clientId, companyId },
    metadata: { ...metadata, clientId, companyId }
  });
}

/**
 * Emit a filing status change event.
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
    eventType: 'FILING_ACCEPTED',
    entityType: 'filing',
    entityId: filingId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    metadata: { ...metadata, oldStatus, newStatus }
  });
}

/**
 * Emit a quote accepted event.
 */
export async function emitQuoteAccepted(
  organizationId: string,
  quoteId: string,
  clientId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'QUOTE_ACCEPTED',
    entityType: 'quote',
    entityId: quoteId,
    newValue: { status: 'accepted' },
    metadata: { ...metadata, clientId }
  });
}

/**
 * Emit an invoice issued event.
 */
export async function emitInvoiceIssued(
  organizationId: string,
  invoiceId: string,
  clientId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'INVOICE_ISSUED',
    entityType: 'invoice',
    entityId: invoiceId,
    newValue: { status: 'issued' },
    metadata: { ...metadata, clientId }
  });
}

/**
 * Emit a payment received event.
 */
export async function emitPaymentReceived(
  organizationId: string,
  paymentId: string,
  invoiceId?: string,
  clientId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return emitAutomationEvent({
    organizationId,
    eventType: 'PAYMENT_RECEIVED',
    entityType: 'payment',
    entityId: paymentId,
    newValue: { status: 'received' },
    metadata: { ...metadata, invoiceId, clientId }
  });
}

// ---------------------------------------------------------------------------
// Slice F4: emit helpers for the previously-uncovered lifecycle events.
// All seeded chaser policies for these events are paused — these helpers
// only insert a row into automation_events; no email is sent until an Owner
// flips the policy to send_mode='auto' inside Settings → Automation.
// ---------------------------------------------------------------------------

export function emitLeadCreated(organizationId: string, leadId: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'LEAD_CREATED', entityType: 'lead', entityId: leadId, newValue: { id: leadId }, metadata });
}

export function emitLeadStageChanged(organizationId: string, leadId: string, oldStage: string | null, newStage: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'LEAD_STAGE_CHANGED', entityType: 'lead', entityId: leadId, oldValue: { stage: oldStage }, newValue: { stage: newStage }, metadata: { ...metadata, oldStage, newStage } });
}

export function emitLeadLost(organizationId: string, leadId: string, reason?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'LEAD_LOST', entityType: 'lead', entityId: leadId, newValue: { status: 'lost', reason } });
}

export function emitQuoteSent(organizationId: string, quoteId: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'QUOTE_SENT', entityType: 'quote', entityId: quoteId, newValue: { status: 'sent' }, metadata });
}

export function emitQuoteRejected(organizationId: string, quoteId: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'QUOTE_REJECTED', entityType: 'quote', entityId: quoteId, newValue: { status: 'rejected' }, metadata });
}

export function emitEngagementLetterSent(organizationId: string, letterId: string, clientId?: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'ENGAGEMENT_LETTER_SENT', entityType: 'engagement_letter', entityId: letterId, newValue: { status: 'sent' }, metadata: { ...metadata, clientId } });
}

export function emitEngagementLetterSigned(organizationId: string, letterId: string, clientId?: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'ENGAGEMENT_LETTER_SIGNED', entityType: 'engagement_letter', entityId: letterId, newValue: { status: 'signed' }, metadata: { ...metadata, clientId } });
}

export function emitKycStatusChanged(organizationId: string, subjectId: string, oldStatus: string | null, newStatus: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'KYC_STATUS_CHANGED', entityType: 'kyc_subject', entityId: subjectId, oldValue: { status: oldStatus }, newValue: { status: newStatus }, metadata });
}

export function emitHmrcAuthRequested(organizationId: string, authId: string, clientId?: string, metadata?: Record<string, unknown>) {
  return emitAutomationEvent({ organizationId, eventType: 'HMRC_AUTH_REQUESTED', entityType: 'hmrc_auth', entityId: authId, newValue: { status: 'requested' }, metadata: { ...metadata, clientId } });
}

export function emitClientServiceEnabled(organizationId: string, clientServiceId: string, serviceType: string, clientId?: string, companyId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'CLIENT_SERVICE_ENABLED', entityType: 'client_service', entityId: clientServiceId, newValue: { service_type: serviceType }, metadata: { clientId, companyId, serviceType } });
}

export function emitQuestionnaireSent(organizationId: string, responseId: string, clientId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'QUESTIONNAIRE_SENT', entityType: 'questionnaire_response', entityId: responseId, newValue: { status: 'sent' }, metadata: { clientId } });
}

export function emitQuestionnaireSubmitted(organizationId: string, responseId: string, clientId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'QUESTIONNAIRE_SUBMITTED', entityType: 'questionnaire_response', entityId: responseId, newValue: { status: 'submitted' }, metadata: { clientId } });
}

export function emitConversationReceived(organizationId: string, conversationId: string, clientId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'CONVERSATION_RECEIVED', entityType: 'conversation', entityId: conversationId, newValue: { direction: 'inbound' }, metadata: { clientId } });
}

export function emitRecordsRequested(organizationId: string, requestId: string, jobId?: string, clientId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'RECORDS_REQUESTED', entityType: 'records_request', entityId: requestId, newValue: { status: 'requested' }, metadata: { jobId, clientId } });
}

export function emitWorkpaperCreated(organizationId: string, workpaperId: string, jobId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'WORKPAPER_CREATED', entityType: 'workpaper', entityId: workpaperId, metadata: { jobId } });
}

export function emitSignatureRequested(organizationId: string, signatureId: string, documentId?: string, clientId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'SIGNATURE_REQUESTED', entityType: 'signature_request', entityId: signatureId, newValue: { status: 'requested' }, metadata: { documentId, clientId } });
}

export function emitInvoiceOverdue(organizationId: string, invoiceId: string, clientId?: string, daysOverdue?: number) {
  return emitAutomationEvent({ organizationId, eventType: 'INVOICE_OVERDUE', entityType: 'invoice', entityId: invoiceId, newValue: { status: 'overdue', days_overdue: daysOverdue }, metadata: { clientId, daysOverdue } });
}

export function emitPaymentDueDateSet(organizationId: string, invoiceId: string, dueDate: string, clientId?: string) {
  return emitAutomationEvent({ organizationId, eventType: 'PAYMENT_DUE_DATE_SET', entityType: 'invoice', entityId: invoiceId, newValue: { due_date: dueDate }, metadata: { clientId, dueDate } });
}
