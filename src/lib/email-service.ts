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
}

/**
 * Queue an email for sending
 */
export async function queueEmail(options: QueueEmailOptions): Promise<{ success: boolean; queueId?: string; error?: string }> {
  try {
    const insertData: EmailQueueInsert = {
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
    };

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
