import { supabase } from "@/integrations/supabase/client";

export interface QueueEmailResult { success: boolean; email_id?: string; status?: string; error?: string; }
export interface UpdateEmailResult { success: boolean; email_id?: string; error?: string; }
export interface RetryEmailResult { success: boolean; email_id?: string; error?: string; }
export interface AcknowledgeEmailResult { success: boolean; email_id?: string; error?: string; }

export async function queueEmailSafe(
  organizationId: string,
  email: { 
    toEmail: string; 
    toName?: string; 
    subject?: string; 
    bodyHtml?: string; 
    templateId?: string; 
    mergeData?: Record<string, unknown>; 
    scheduledAt?: string; 
    entityType?: string; 
    entityId?: string; 
  }
): Promise<QueueEmailResult> {
  // Canonical signature order: org, to_email, to_name, subject, body_html, template_id, merge_data, scheduled_at, entity_type, entity_id
  const { data, error } = await supabase.rpc('queue_email_safe', {
    p_organization_id: organizationId,
    p_to_email: email.toEmail,
    p_to_name: email.toName || null,
    p_subject: email.subject || null,
    p_body_html: email.bodyHtml || null,
    p_template_id: email.templateId || null,
    p_merge_data: (email.mergeData || {}) as unknown as Record<string, never>,
    p_scheduled_at: email.scheduledAt || null,
    p_entity_type: email.entityType || null,
    p_entity_id: email.entityId || null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as QueueEmailResult;
}

export async function updateQueuedEmailSafe(
  emailId: string,
  changes: { subject?: string; bodyHtml?: string; toEmail?: string; scheduledAt?: string; }
): Promise<UpdateEmailResult> {
  const { data, error } = await supabase.rpc('update_queued_email_safe', {
    p_email_id: emailId,
    p_subject: changes.subject || null,
    p_body_html: changes.bodyHtml || null,
    p_to_email: changes.toEmail || null,
    p_scheduled_at: changes.scheduledAt || null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as UpdateEmailResult;
}

export async function retryFailedEmailSafe(emailId: string): Promise<RetryEmailResult> {
  const { data, error } = await supabase.rpc('retry_failed_email_safe', { p_email_id: emailId });
  if (error) return { success: false, error: error.message };
  return data as unknown as RetryEmailResult;
}

export async function acknowledgeFailedEmailSafe(emailId: string): Promise<AcknowledgeEmailResult> {
  const { data, error } = await supabase.rpc('acknowledge_failed_email_safe', { p_email_id: emailId });
  if (error) return { success: false, error: error.message };
  return data as unknown as AcknowledgeEmailResult;
}

export async function disconnectMailboxSafe(mailboxId: string): Promise<{ success: boolean; mailbox_id?: string; error?: string; }> {
  const { data, error } = await supabase.rpc('disconnect_mailbox_safe', { p_mailbox_id: mailboxId });
  if (error) return { success: false, error: error.message };
  return data as unknown as { success: boolean; mailbox_id?: string; error?: string; };
}
