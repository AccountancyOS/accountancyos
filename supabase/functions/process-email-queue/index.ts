import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FROM_ADDRESS = 'AccountancyOS <noreply@accountancyos.com>'
const SENDER_DOMAIN = 'notify.accountancyos.com'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

// Derive a plain-text fallback from HTML so the Lovable Email API always
// receives a `text` parameter (it's required and 400s with missing_parameter
// otherwise). Best-effort: strip tags, decode common entities, collapse space.
function htmlToText(html: string): string {
  if (!html) return ''
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    .replace(/<[^>]+>/g, '')
  const decoded = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return decoded.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// Check if an error is a rate-limit (429) response.
// Uses EmailAPIError.status when available (email-js >=0.x with structured errors),
// falls back to parsing the error message for older versions.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// Check if an error is a forbidden (403) response. Retrying won't help.
// Move straight to DLQ.
function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

// Extract Retry-After seconds from a structured EmailAPIError, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

// Move a message to the dead letter queue and log the reason.
async function moveToDlq(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string
): Promise<void> {
  const payload = msg.message
  await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
  })
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', { queue, msg_id: msg.msg_id, reason, error })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Auth: verify_jwt=true at the gateway (see config.toml) guarantees the bearer
  // is a signature-verified JWT, so the role claim can be trusted. We allow two
  // callers: the service-role cron (automated draining) AND an authenticated app
  // user (the manual "Process Queue" admin action in the UI). Anon is rejected —
  // queue processing is not a public operation.
  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  const callerRole = claims?.role
  if (callerRole !== 'service_role' && callerRole !== 'authenticated') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    if (!messages?.length) continue

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          error: failedRowsError,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : msg.read_ct ?? 0

      // Drop expired messages (TTL exceeded).
      // Prefer payload.queued_at when present; fall back to PGMQ's enqueued_at
      // which is always set by the queue.
      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`)
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
          })
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            console.error('Failed to delete duplicate message from queue', { queue, msg_id: msg.msg_id, error: dupDelError })
          }
          continue
        }
      }

      try {
        const providerResponse = await sendLovableEmail(
          {
            run_id: payload.run_id,
            to: payload.to,
            from: payload.from,
            sender_domain: payload.sender_domain,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            purpose: payload.purpose,
            label: payload.label,
            idempotency_key: payload.idempotency_key,
            unsubscribe_token: payload.unsubscribe_token,
            message_id: payload.message_id,
          },
          // sendUrl is optional — when LOVABLE_SEND_URL is not set, the library
          // falls back to the default Lovable API endpoint (https://api.lovable.dev).
          // Set LOVABLE_SEND_URL as a Supabase secret to override (e.g. for local dev).
          { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
        )

        // Non-negotiable: do not record `sent` unless the provider returned
        // an acknowledgement (id / response body). A silent resolve from the
        // SDK without a provider id means we have no proof of acceptance and
        // must keep the message in-flight so it retries.
        const providerId =
          (providerResponse && typeof providerResponse === 'object'
            ? ((providerResponse as Record<string, unknown>).id ??
              (providerResponse as Record<string, unknown>).message_id ??
                 (providerResponse as Record<string, unknown>).messageId ??
                 (providerResponse as Record<string, unknown>).workflow_id ??
                 (providerResponse as Record<string, unknown>).workflowId)
            : null) ?? null

        if (!providerId) {
          // Treat as a soft failure so pgmq visibility timeout retries it.
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'failed',
            error_message: 'provider_no_ack: SDK resolved without provider message id',
            metadata: { provider_response: providerResponse ?? null },
          })
          continue
        }

        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
          metadata: {
            provider_message_id: String(providerId),
            provider_response: providerResponse,
          },
        })

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete sent message from queue', { queue, msg_id: msg.msg_id, error: delError })
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(
                Date.now() + retryAfterSecs * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // 403s are permanent configuration or authorization failures for this
        // message, so move straight to DLQ and stop processing the rest of the batch.
        if (isForbidden(error)) {
          await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000))
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'forbidden' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Log non-429 failures to track real retry attempts.
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }

        // Non-429 errors: message stays invisible until VT expires, then retried
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  // 3. Drain public.email_queue rows (UI-visible app emails — quotes, ad-hoc, etc.)
  //    Non-negotiable: only flip to `sent` when the provider returned a message id.
  let emailQueueProcessed = 0
  let emailQueueFailed = 0
  try {
    const { data: rows, error: rowsError } = await supabase
      .from('email_queue')
      .select('id, organization_id, to_email, to_name, subject, body_html, body_text, mailbox_id, provider, created_by, attachments')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (rowsError) {
      console.error('Failed to read email_queue', { error: rowsError })
    } else {
      for (const row of rows ?? []) {
        if (!row.to_email || !row.subject || !row.body_html) {
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              error_message: 'Missing to_email, subject, or body_html',
              last_error_code: 'invalid_payload',
              last_error_message: 'Missing to_email, subject, or body_html',
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
          emailQueueFailed++
          continue
        }

        const messageId = crypto.randomUUID()

        // Mint a one-click unsubscribe token. The Lovable Email API rejects
        // transactional sends without one (`missing_unsubscribe`).
        let unsubscribeToken: string | null = null
        if (row.organization_id) {
          const { data: tokenData, error: tokenErr } = await supabase.rpc(
            'enqueue_unsubscribe_token',
            { p_org_id: row.organization_id, p_email: row.to_email, p_category: 'transactional' }
          )
          if (tokenErr) {
            console.error('Failed to mint unsubscribe token', { id: row.id, error: tokenErr.message })
          } else if (typeof tokenData === 'string') {
            unsubscribeToken = tokenData
          }
        }

        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: 'email_queue',
          recipient_email: row.to_email,
          status: 'pending',
        })

        try {
          let providerResponse: unknown
          let providerLabel: 'gmail' | 'outlook' | 'lovable' = 'lovable'

          if (row.mailbox_id && row.provider) {
            // Send from the accountant's connected mailbox
            const fnName = row.provider === 'outlook' ? 'outlook-send' : 'gmail-send'
            providerLabel = row.provider === 'outlook' ? 'outlook' : 'gmail'
            const { data: fnData, error: fnErr } = await supabase.functions.invoke(fnName, {
              body: {
                mailbox_id: row.mailbox_id,
                to: row.to_email,
                subject: row.subject,
                body_html: row.body_html,
                body_text: row.body_text ?? htmlToText(row.body_html),
              },
            })
            if (fnErr) throw new Error(`${fnName} invoke failed: ${fnErr.message ?? String(fnErr)}`)
            // gmail-send/outlook-send may not return a provider message id;
            // a non-error invoke means accepted -> synthesize one for ack.
            const data = (fnData ?? {}) as Record<string, unknown>
            if (data.error) throw new Error(String(data.error))
            if (!data.message_id && !data.id) {
              data.message_id = `${providerLabel}-${messageId}`
            }
            providerResponse = data
          } else {
            providerResponse = await sendLovableEmail(
              {
                to: row.to_email,
                from: FROM_ADDRESS,
                sender_domain: SENDER_DOMAIN,
                subject: row.subject,
                html: row.body_html,
                text: row.body_text ?? htmlToText(row.body_html),
                purpose: 'transactional',
                label: 'email_queue',
                idempotency_key: row.id,
                message_id: messageId,
                unsubscribe_token: unsubscribeToken ?? undefined,
                // Best-effort attachments (e.g. invoice PDF). Ignored by the SDK if unsupported.
                ...(Array.isArray((row as any).attachments) && (row as any).attachments.length
                  ? { attachments: (row as any).attachments }
                  : {}),
              } as any,
              { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
            )
          }

          const providerId =
            (providerResponse && typeof providerResponse === 'object'
              ? ((providerResponse as Record<string, unknown>).id ??
                (providerResponse as Record<string, unknown>).message_id ??
                (providerResponse as Record<string, unknown>).messageId ??
                (providerResponse as Record<string, unknown>).workflow_id ??
                (providerResponse as Record<string, unknown>).workflowId ??
                (providerResponse as Record<string, unknown>).provider_message_id)
              : null) ?? null

          if (!providerId) {
            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'email_queue',
              recipient_email: row.to_email,
              status: 'failed',
              error_message: 'provider_no_ack: SDK resolved without provider message id',
              metadata: { provider_response: providerResponse ?? null, email_queue_id: row.id },
            })
            await supabase
              .from('email_queue')
              .update({
                status: 'failed',
                error_message: 'Provider did not acknowledge send (no message id)',
                last_error_code: 'provider_no_ack',
                last_error_message: 'Provider did not acknowledge send (no message id)',
                updated_at: new Date().toISOString(),
              })
              .eq('id', row.id)
            emailQueueFailed++
            continue
          }

          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'email_queue',
            recipient_email: row.to_email,
            status: 'sent',
            metadata: {
              provider_message_id: String(providerId),
              provider_response: providerResponse,
              email_queue_id: row.id,
              provider: providerLabel,
            },
          })

          await supabase
            .from('email_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null,
              last_error_code: null,
              last_error_message: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)

          emailQueueProcessed++
          await new Promise((r) => setTimeout(r, sendDelayMs))
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('email_queue send failed', { id: row.id, error: errorMsg })
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'email_queue',
            recipient_email: row.to_email,
            status: 'failed',
            error_message: errorMsg.slice(0, 1000),
            metadata: { email_queue_id: row.id },
          })
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              error_message: errorMsg.slice(0, 1000),
              last_error_code: isRateLimited(error) ? 'rate_limited' : 'send_failed',
              last_error_message: errorMsg.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
          emailQueueFailed++

          if (isRateLimited(error)) {
            const retryAfterSecs = getRetryAfterSeconds(error)
            await supabase
              .from('email_send_state')
              .update({
                retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', 1)
            break
          }
        }
      }
    }
  } catch (e) {
    console.error('email_queue drain crashed', { error: e instanceof Error ? e.message : String(e) })
  }

  return new Response(
    JSON.stringify({
      processed: totalProcessed + emailQueueProcessed,
      failed: emailQueueFailed,
      pgmq_processed: totalProcessed,
      email_queue_processed: emailQueueProcessed,
      email_queue_failed: emailQueueFailed,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
