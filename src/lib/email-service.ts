import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type EmailQueueInsert = Database["public"]["Tables"]["email_queue"]["Insert"];

export interface QueueEmailOptions {
  organizationId: string;
  toEmail: string;
  toName?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  mergeData?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  scheduledAt?: Date;
  /**
   * FUN-4/Fix 10: deterministic key to dedup the same logical email (double-click / retry).
   * Genuinely distinct events (separate scheduled chasers, deliberate resends) must use
   * distinct keys. When set, a same-key collision is a no-op (the existing row is kept).
   */
  idempotencyKey?: string;
}

/**
 * Queue an email for sending
 */
export async function queueEmail(options: QueueEmailOptions): Promise<{ success: boolean; queueId?: string; error?: string }> {
  try {
    const insertData = {
      organization_id: options.organizationId,
      to_email: options.toEmail,
      to_name: options.toName || null,
      subject: options.subject,
      body_html: options.bodyHtml || null,
      body_text: options.bodyText || null,
      template_id: options.templateId || null,
      merge_data: (options.mergeData || {}) as Json,
      entity_type: options.entityType || null,
      entity_id: options.entityId || null,
      scheduled_at: options.scheduledAt?.toISOString() || null,
      status: "pending",
      retry_count: 0,
      ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
    } as EmailQueueInsert & { idempotency_key?: string };

    // With an idempotency key, dedup via ON CONFLICT DO NOTHING (ignoreDuplicates): a repeat
    // call for the same event is a no-op rather than a second queued email.
    if (options.idempotencyKey) {
      const { data, error } = await supabase
        .from("email_queue")
        .upsert(insertData, { onConflict: "idempotency_key", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("Error queueing email:", error);
        return { success: false, error: error.message };
      }
      // data === null means a row with this key already existed (deduped) — still success.
      return { success: true, queueId: data?.id };
    }

    const { data, error } = await supabase
      .from("email_queue")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      console.error("Error queueing email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, queueId: data.id };
  } catch (error) {
    console.error("Error queueing email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Load email template and prepare with merge data
 */
export async function loadEmailTemplate(
  templateId: string
): Promise<{ subject: string; bodyHtml: string; bodyText?: string } | null> {
  try {
    const { data: template, error } = await supabase
      .from("templates")
      .select("name, content")
      .match({ id: templateId, template_type: "email" })
      .maybeSingle();

    if (error || !template) {
      console.error("Error loading email template:", error);
      return null;
    }

    const content = template.content as { subject?: string; body_html?: string; body_text?: string } | null;
    
    if (!content) {
      return null;
    }

    return {
      subject: content.subject || template.name,
      bodyHtml: content.body_html || "",
      bodyText: content.body_text,
    };
  } catch (error) {
    console.error("Error loading email template:", error);
    return null;
  }
}
