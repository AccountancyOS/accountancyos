import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  mode: "direct" | "queue" | "process_queue";
  // Direct mode fields
  to?: string;
  to_name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  from?: string;
  from_name?: string;
  // Queue mode fields
  queue_id?: string;
  // Process queue - no additional fields needed
}

interface MergeData {
  [key: string]: string | number | boolean | null | undefined;
}

// Process merge fields in template
function processMergeFields(template: string, mergeData: MergeData): string {
  if (!template || !mergeData) return template;
  
  let result = template;
  
  // Replace {{field}} patterns
  const fieldPattern = /\{\{([^}]+)\}\}/g;
  result = result.replace(fieldPattern, (match, fieldPath) => {
    const keys = fieldPath.trim().split(".");
    let value: unknown = mergeData;
    
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return match; // Keep original if path not found
      }
    }
    
    return value !== null && value !== undefined ? String(value) : match;
  });
  
  return result;
}

// Send email via Postmark
async function sendViaPostmark(
  to: string,
  toName: string | null,
  subject: string,
  htmlBody: string | null,
  textBody: string | null,
  from: string = "notifications@accountancyos.com",
  fromName: string = "AccountancyOS"
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const postmarkApiKey = Deno.env.get("POSTMARK_API_KEY");
  
  if (!postmarkApiKey) {
    console.error("POSTMARK_API_KEY not configured");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkApiKey,
      },
      body: JSON.stringify({
        From: fromName ? `${fromName} <${from}>` : from,
        To: toName ? `${toName} <${to}>` : to,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody || (htmlBody ? undefined : "Please view this email in an HTML-compatible client."),
        MessageStream: "outbound",
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Postmark error:", data);
      return { success: false, error: data.Message || "Failed to send email" };
    }

    console.log("Email sent successfully:", data.MessageID);
    return { success: true, messageId: data.MessageID };
  } catch (error: unknown) {
    console.error("Error sending email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SendEmailRequest = await req.json();
    const { mode } = body;

    // Mode: Direct send
    if (mode === "direct") {
      const { to, to_name, subject, body_html, body_text, from, from_name } = body;
      
      if (!to || !subject) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: to, subject" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await sendViaPostmark(
        to,
        to_name || null,
        subject,
        body_html || null,
        body_text || null,
        from,
        from_name
      );

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode: Send specific queued email
    if (mode === "queue" && body.queue_id) {
      const { data: email, error: fetchError } = await supabase
        .from("email_queue")
        .select("*")
        .eq("id", body.queue_id)
        .maybeSingle();

      if (fetchError || !email) {
        return new Response(
          JSON.stringify({ error: "Email not found in queue" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process merge fields
      const mergeData = (email.merge_data as MergeData) || {};
      const processedSubject = processMergeFields(email.subject, mergeData);
      const processedHtml = email.body_html ? processMergeFields(email.body_html, mergeData) : null;
      const processedText = email.body_text ? processMergeFields(email.body_text, mergeData) : null;

      const result = await sendViaPostmark(
        email.to_email,
        email.to_name,
        processedSubject,
        processedHtml,
        processedText
      );

      // Update queue status
      await supabase
        .from("email_queue")
        .update({
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
          retry_count: result.success ? email.retry_count : (email.retry_count || 0) + 1,
        })
        .eq("id", body.queue_id);

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode: Process all pending emails in queue
    if (mode === "process_queue") {
      const { data: pendingEmails, error: fetchError } = await supabase
        .from("email_queue")
        .select("*")
        .eq("status", "pending")
        .lt("retry_count", 3)
        .order("created_at", { ascending: true })
        .limit(50);

      if (fetchError) {
        console.error("Error fetching queue:", fetchError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch email queue" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = {
        total: pendingEmails?.length || 0,
        sent: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const email of pendingEmails || []) {
        // Process merge fields
        const mergeData = (email.merge_data as MergeData) || {};
        const processedSubject = processMergeFields(email.subject, mergeData);
        const processedHtml = email.body_html ? processMergeFields(email.body_html, mergeData) : null;
        const processedText = email.body_text ? processMergeFields(email.body_text, mergeData) : null;

        const result = await sendViaPostmark(
          email.to_email,
          email.to_name,
          processedSubject,
          processedHtml,
          processedText
        );

        // Update queue status
        await supabase
          .from("email_queue")
          .update({
            status: result.success ? "sent" : "failed",
            sent_at: result.success ? new Date().toISOString() : null,
            error_message: result.error || null,
            retry_count: result.success ? email.retry_count : (email.retry_count || 0) + 1,
          })
          .eq("id", email.id);

        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`${email.id}: ${result.error}`);
        }

        // Small delay between emails to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log("Queue processing complete:", results);
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid mode. Use 'direct', 'queue', or 'process_queue'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
