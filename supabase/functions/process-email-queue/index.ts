import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailQueueItem {
  id: string;
  organization_id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  template_id: string | null;
  merge_data: Record<string, unknown>;
  mailbox_id: string | null;
  provider: string | null;
  status: string;
  scheduled_at: string | null;
  retry_count: number;
  error_message: string | null;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
}

interface ConnectedMailbox {
  id: string;
  user_id: string;
  provider: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  display_name: string | null;
}

/**
 * Process merge fields in a template string
 */
function processMergeFields(template: string, mergeData: Record<string, unknown>): string {
  if (!template) return template;
  let result = template;
  for (const [key, value] of Object.entries(mergeData)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, String(value ?? ""));
  }
  return result;
}

/**
 * Send email via connected Gmail mailbox
 */
async function sendViaGmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  mailbox: ConnectedMailbox,
  email: EmailQueueItem,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        mailbox_id: mailbox.id,
        to: email.to_email,
        to_name: email.to_name,
        subject: subject,
        body_html: body,
        cc: email.cc_emails,
        bcc: email.bcc_emails,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || `Gmail send failed: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gmail send error" };
  }
}

/**
 * Send email via connected Outlook mailbox
 */
async function sendViaOutlook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  mailbox: ConnectedMailbox,
  email: EmailQueueItem,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/outlook-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        mailbox_id: mailbox.id,
        to: email.to_email,
        to_name: email.to_name,
        subject: subject,
        body_html: body,
        cc: email.cc_emails,
        bcc: email.bcc_emails,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || `Outlook send failed: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Outlook send error" };
  }
}

/**
 * Log email queue action
 */
async function logQueueAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  queueId: string,
  action: string,
  status: string | null,
  provider: string | null,
  errorMessage: string | null
): Promise<void> {
  try {
    await supabase.from("email_queue_log").insert({
      queue_id: queueId,
      action,
      status,
      provider,
      error_message: errorMessage,
    });
  } catch (error) {
    console.error("Failed to log queue action:", error);
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
    let limit = 20;
    try {
      const body = await req.json();
      limit = body.limit || 20;
    } catch {
      // No body or invalid JSON - use defaults
    }

    console.log(`Processing email queue. Limit: ${limit}`);

    // Fetch pending/queued emails that are ready to send
    const { data: emails, error: fetchError } = await supabase
      .from("email_queue")
      .select("*")
      .in("status", ["queued", "pending"])
      .or("scheduled_at.is.null,scheduled_at.lte.now()")
      .lt("retry_count", 3)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("Failed to fetch queue:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!emails || emails.length === 0) {
      console.log("No emails to process");
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${emails.length} emails to process`);

    let sent = 0;
    let failed = 0;

    for (const email of emails as EmailQueueItem[]) {
      // Mark as pending
      await supabase
        .from("email_queue")
        .update({ status: "pending", last_attempt_at: new Date().toISOString() })
        .eq("id", email.id);

      await logQueueAction(supabase, email.id, "send_attempt", "pending", null, null);

      let subject = email.subject;
      let body = email.body_html || "";

      // If template_id is set, load and merge template
      if (email.template_id) {
        const { data: template } = await supabase
          .from("templates")
          .select("content")
          .eq("id", email.template_id)
          .single();

        if (template?.content) {
          const content = template.content as { subject?: string; body?: string; htmlBody?: string };
          subject = content.subject || subject;
          body = content.htmlBody || content.body || body;
        }
      }

      // Process merge fields
      const mergeData = (email.merge_data || {}) as Record<string, unknown>;
      subject = processMergeFields(subject, mergeData);
      body = processMergeFields(body, mergeData);

      let result: { success: boolean; error?: string; messageId?: string };
      let provider = "postmark";

      // Try to use connected mailbox if available
      if (email.mailbox_id) {
        const { data: mailbox } = await supabase
          .from("connected_mailboxes")
          .select("*")
          .eq("id", email.mailbox_id)
          .single();

        if (mailbox && mailbox.status === "active") {
          provider = mailbox.provider;
          if (mailbox.provider === "gmail") {
            result = await sendViaGmail(supabase, mailbox as ConnectedMailbox, email, subject, body);
          } else if (mailbox.provider === "outlook") {
            result = await sendViaOutlook(supabase, mailbox as ConnectedMailbox, email, subject, body);
          } else {
            result = await sendViaPostmark(email.to_email, subject, body, email.body_text);
            provider = "postmark";
          }
        } else {
          // Mailbox not active, fallback to Postmark
          result = await sendViaPostmark(email.to_email, subject, body, email.body_text);
        }
      } else {
        // No mailbox specified, use Postmark
        result = await sendViaPostmark(email.to_email, subject, body, email.body_text);
      }

      if (result.success) {
        await supabase
          .from("email_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider,
            error_message: null,
          })
          .eq("id", email.id);

        await logQueueAction(supabase, email.id, "sent", "sent", provider, null);
        sent++;
        console.log(`Email ${email.id} sent successfully via ${provider}`);
      } else {
        const newRetryCount = email.retry_count + 1;
        const newStatus = newRetryCount >= 3 ? "failed" : "queued";

        await supabase
          .from("email_queue")
          .update({
            status: newStatus,
            retry_count: newRetryCount,
            error_message: result.error,
            provider,
          })
          .eq("id", email.id);

        await logQueueAction(supabase, email.id, "failed", newStatus, provider, result.error || null);
        failed++;
        console.error(`Email ${email.id} failed: ${result.error}`);
      }

      // Small delay between emails to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`Processing complete: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({ processed: emails.length, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});