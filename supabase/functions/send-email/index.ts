import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { newTraceId, logInfo, logError } from "../_shared/logging.ts";
import { ok, fail, ErrorCodes } from "../_shared/responses.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { beginIdempotent, finishIdempotentSuccess, finishIdempotentFailure } from "../_shared/idempotency.ts";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "../_shared/rateLimit.ts";

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
  // Idempotency
  idempotency_key?: string;
  // Org context (for queue processing)
  organization_id?: string;
}

interface MergeData {
  [key: string]: string | number | boolean | null | undefined;
}

// Process merge fields in template
function processMergeFields(template: string, mergeData: MergeData): string {
  if (!template || !mergeData) return template;
  
  let result = template;
  
  const fieldPattern = /\{\{([^}]+)\}\}/g;
  result = result.replace(fieldPattern, (match, fieldPath) => {
    const keys = fieldPath.trim().split(".");
    let value: unknown = mergeData;
    
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return match;
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
  fromName: string = "AccountancyOS",
  traceId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const postmarkApiKey = Deno.env.get("POSTMARK_API_KEY");
  
  if (!postmarkApiKey) {
    logError(traceId, new Error("POSTMARK_API_KEY not configured"), { scope: "send-email" });
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
      logError(traceId, new Error(data.Message || "Postmark error"), { status: response.status });
      return { success: false, error: data.Message || "Failed to send email" };
    }

    logInfo(traceId, "Email sent successfully", { messageId: data.MessageID, to });
    return { success: true, messageId: data.MessageID };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logError(traceId, error instanceof Error ? error : new Error(errorMessage), { to });
    return { success: false, error: errorMessage };
  }
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  
  const traceId = newTraceId();
  const corsHeaders = getCorsHeaders(req);

  try {
    const adminClient = getAdminClient();
    const body: SendEmailRequest = await req.json();
    const { mode, idempotency_key, organization_id } = body;

    logInfo(traceId, "Email request received", { mode, hasIdempotencyKey: !!idempotency_key });

    // Mode: Direct send
    if (mode === "direct") {
      const { to, to_name, subject, body_html, body_text, from, from_name } = body;
      
      if (!to || !subject) {
        return fail(req, {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Missing required fields: to, subject",
        }, traceId, 400);
      }

      // Apply rate limiting if org context provided
      if (organization_id) {
        const rateLimitResult = await checkRateLimit(adminClient, {
          orgId: organization_id,
          userId: 'system',
          scope: 'email_send',
          traceId,
          config: RATE_LIMITS.email_send,
        });
        
        if (!rateLimitResult.allowed) {
          return rateLimitResponse(req, rateLimitResult, traceId);
        }
      }

      // Idempotency check for direct sends
      if (idempotency_key && organization_id) {
        const idempotencyResult = await beginIdempotent(adminClient, {
          orgId: organization_id,
          scope: 'email_send',
          key: idempotency_key,
          traceId,
        });

        if (idempotencyResult.replay && idempotencyResult.responseJson) {
          logInfo(traceId, "Returning cached email result", { key: idempotency_key });
          return ok(req, idempotencyResult.responseJson, traceId);
        }
      }

      const result = await sendViaPostmark(
        to,
        to_name || null,
        subject,
        body_html || null,
        body_text || null,
        from,
        from_name,
        traceId
      );

      // Complete idempotency
      if (idempotency_key && organization_id) {
        if (result.success) {
          await finishIdempotentSuccess(adminClient, {
            orgId: organization_id,
            scope: 'email_send',
            key: idempotency_key,
            responseJson: result,
            traceId,
          });
        } else {
          await finishIdempotentFailure(adminClient, {
            orgId: organization_id,
            scope: 'email_send',
            key: idempotency_key,
            errorJson: { error: result.error },
            traceId,
          });
        }
      }

      if (result.success) {
        return ok(req, result, traceId);
      } else {
        return fail(req, {
          code: ErrorCodes.EXTERNAL_SERVICE_ERROR,
          message: result.error || "Failed to send email",
          retryable: true,
        }, traceId, 500);
      }
    }

    // Mode: Send specific queued email
    if (mode === "queue" && body.queue_id) {
      const { data: email, error: fetchError } = await adminClient
        .from("email_queue")
        .select("*")
        .eq("id", body.queue_id)
        .maybeSingle();

      if (fetchError || !email) {
        return fail(req, {
          code: ErrorCodes.NOT_FOUND,
          message: "Email not found in queue",
        }, traceId, 404);
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
        processedText,
        undefined,
        undefined,
        traceId
      );

      // Update queue status
      await adminClient
        .from("email_queue")
        .update({
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
          retry_count: result.success ? email.retry_count : (email.retry_count || 0) + 1,
        })
        .eq("id", body.queue_id);

      if (result.success) {
        return ok(req, result, traceId);
      } else {
        return fail(req, {
          code: ErrorCodes.EXTERNAL_SERVICE_ERROR,
          message: result.error || "Failed to send email",
          retryable: true,
        }, traceId, 500);
      }
    }

    // Mode: Process all pending emails in queue
    if (mode === "process_queue") {
      const { data: pendingEmails, error: fetchError } = await adminClient
        .from("email_queue")
        .select("*")
        .eq("status", "pending")
        .lt("retry_count", 3)
        .order("created_at", { ascending: true })
        .limit(50);

      if (fetchError) {
        logError(traceId, new Error(fetchError.message), { action: "fetch_queue" });
        return fail(req, {
          code: ErrorCodes.DATABASE_ERROR,
          message: "Failed to fetch email queue",
        }, traceId, 500);
      }

      const results = {
        total: pendingEmails?.length || 0,
        sent: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const email of pendingEmails || []) {
        const mergeData = (email.merge_data as MergeData) || {};
        const processedSubject = processMergeFields(email.subject, mergeData);
        const processedHtml = email.body_html ? processMergeFields(email.body_html, mergeData) : null;
        const processedText = email.body_text ? processMergeFields(email.body_text, mergeData) : null;

        const result = await sendViaPostmark(
          email.to_email,
          email.to_name,
          processedSubject,
          processedHtml,
          processedText,
          undefined,
          undefined,
          traceId
        );

        await adminClient
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

      logInfo(traceId, "Queue processing complete", results);
      return ok(req, results, traceId);
    }

    return fail(req, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Invalid mode. Use 'direct', 'queue', or 'process_queue'",
    }, traceId, 400);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logError(traceId, error instanceof Error ? error : new Error(errorMessage), { function: "send-email" });
    return fail(req, {
      code: ErrorCodes.INTERNAL_ERROR,
      message: errorMessage,
    }, traceId, 500);
  }
});
