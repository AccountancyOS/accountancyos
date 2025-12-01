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

export interface SendEmailDirectOptions {
  to: string;
  toName?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  from?: string;
  fromName?: string;
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
 * Send an email directly (bypasses queue)
 */
export async function sendEmailDirect(options: SendEmailDirectOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        mode: "direct",
        to: options.to,
        to_name: options.toName,
        subject: options.subject,
        body_html: options.bodyHtml,
        body_text: options.bodyText,
        from: options.from,
        from_name: options.fromName,
      },
    });

    if (error) {
      console.error("Error sending email:", error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send a specific queued email by ID
 */
export async function sendQueuedEmail(queueId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        mode: "queue",
        queue_id: queueId,
      },
    });

    if (error) {
      console.error("Error sending queued email:", error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (error) {
    console.error("Error sending queued email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Process all pending emails in the queue
 */
export async function processEmailQueue(): Promise<{ success: boolean; total?: number; sent?: number; failed?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        mode: "process_queue",
      },
    });

    if (error) {
      console.error("Error processing email queue:", error);
      return { success: false, error: error.message };
    }

    return { success: true, ...data };
  } catch (error) {
    console.error("Error processing email queue:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Queue and immediately send an email
 */
export async function queueAndSendEmail(options: QueueEmailOptions): Promise<{ success: boolean; error?: string }> {
  const queueResult = await queueEmail(options);
  
  if (!queueResult.success || !queueResult.queueId) {
    return { success: false, error: queueResult.error || "Failed to queue email" };
  }

  return sendQueuedEmail(queueResult.queueId);
}

/**
 * Load email template and prepare with merge data
 */
export async function loadEmailTemplate(
  templateId: string
): Promise<{ subject: string; bodyHtml: string; bodyText?: string } | null> {
  try {
    // Use match to avoid deep type instantiation from chained .eq() calls
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
