import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  validateAttachments,
  type AttachmentRejectionCode,
} from '../_shared/attachments.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

const POSTMARK_API_URL = 'https://api.postmarkapp.com/email'
const DEFAULT_POSTMARK_MESSAGE_STREAM = 'outbound'

// Back-off applied to a held row's `scheduled_at`. A hold must not be re-attempted every
// minute: a missing mailbox will still be missing sixty seconds later, and hammering a
// mailbox that is down turns one outage into a rate-limit.
const HOLD_BACKOFF_NO_MAILBOX_MINUTES = 15
const HOLD_BACKOFF_BASE_MINUTES = 5
const HOLD_BACKOFF_MAX_MINUTES = 60

/**
 * ============================================================================
 * SENDER IDENTITY — the hard rule (owner, 2026-08-25)
 * ============================================================================
 * Two strictly separated identities:
 *
 *   context === 'system'        -> AccountancyOS's own mail  -> Postmark
 *   anything else, incl. NULL   -> practice correspondence    -> the practice's
 *                                  connected mailbox (gmail/outlook) ONLY
 *
 * There is NO Postmark fallback for practice correspondence. Ever. If no mailbox is
 * connected, or the mailbox send fails, the message is HELD: it stays in the queue,
 * unsent, `status='pending'`, with `last_error_code` set so the UI can warn.
 *
 * Sending a client's mail from AccountancyOS's own domain is the single worst outcome
 * available here — the client sees it, and it is unrecoverable once delivered. Holding is
 * always the correct failure direction.
 *
 * NULL routes to the mailbox path DELIBERATELY. Routing is a positive decision on
 * `context`, never an inference from whether a mailbox happens to be present: the previous
 * implementation chose by presence (`if (mailbox_id && provider) ... else default provider`)
 * which meant a missing mailbox silently fell through to the platform sender.
 *
 * Design: `docs/superpowers/plans/2026-08-25-email-sender-identity-and-postmark.md` §3, §4,
 * §9, §10.
 */
const SYSTEM_CONTEXT = 'system'

function isSystemEmail(context: string | null | undefined): boolean {
  return context === 'system'
}

// Derive a plain-text fallback from HTML so every send carries a TextBody as well as an
// HtmlBody. Best-effort: strip tags, decode common entities, collapse space.
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

/**
 * Send failure carrying the transport status, so the existing rate-limit / forbidden
 * classification keeps working without string-sniffing.
 */
class EmailSendError extends Error {
  status: number | null
  retryAfterSeconds: number | null

  constructor(message: string, status: number | null = null, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'EmailSendError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// Check if an error is a rate-limit (429) response.
// Uses EmailSendError.status when available, falls back to parsing the message.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// A permanent CONFIGURATION failure: retrying cannot help, and every other message in the queue
// will fail identically, so the batch stops rather than draining itself into the DLQ one message
// at a time.
//
// This matched only 403, which was wrong for Postmark in two ways:
//
//  1. Postmark answers a bad or missing Server Token with HTTP **401**, not 403. A wrong token
//     therefore fell through to the generic retry path and burned all five attempts per message,
//     for every message in the queue, before each one reached the DLQ — turning a one-line
//     config mistake into a queue-wide DLQ flood.
//  2. Postmark reports unusable-sender conditions as HTTP 200 with a non-zero `ErrorCode`, which
//     sendPostmarkEmail throws with `status = null`. Those cannot be classified by HTTP status at
//     all, so the code is read back out of the message:
//       400  SenderSignatureNotFound       — the From address is not a verified sender
//       401  SenderSignatureNotConfirmed   — verified but not yet confirmed
//       405  NotAllowedToSend              — account pending approval or disabled
//
// Deliberately NOT included: 300 (invalid email request) and 406 (inactive recipient) are
// per-message, not per-configuration — stopping the whole batch for one bad address would let a
// single malformed recipient block everyone else's mail.
function isPermanentConfigFailure(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number | null }).status
    if (status === 401 || status === 403) return true
  }
  if (error instanceof Error) {
    if (/^postmark_error_(400|401|405):/.test(error.message)) return true
    // Preserved from the original 403-only implementation.
    if (error.message.includes('403')) return true
  }
  return false
}

// Extract Retry-After seconds from a structured EmailSendError, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

type PostmarkResponse = {
  To?: string
  SubmittedAt?: string
  MessageID?: string
  ErrorCode?: number
  Message?: string
}

/**
 * Postmark — AccountancyOS's OWN sender identity, and nothing else.
 *
 * The guard below lives INSIDE the sender rather than only at the call site. Routing
 * decides; this refuses. That is the difference between "no current code path sends
 * practice mail through Postmark" and "no code path can", and it is the property the
 * regression suite pins.
 */
async function sendPostmarkEmail(params: {
  context: string | null | undefined
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string | null
}): Promise<{ providerMessageId: string; response: PostmarkResponse }> {
  // NON-NEGOTIABLE. Practice correspondence must never leave AccountancyOS's domain.
  if (!isSystemEmail(params.context)) {
    throw new EmailSendError(
      `postmark_blocked_non_system: refusing to send context=${params.context ?? 'null'} through ` +
        `AccountancyOS's own sender. Practice correspondence goes out through the practice's ` +
        `connected mailbox or it is held — there is no fallback.`
    )
  }

  const token = Deno.env.get('POSTMARK_SERVER_TOKEN')
  const fromAddress = Deno.env.get('POSTMARK_FROM_EMAIL')

  // Fail CLOSED. A missing secret must surface as a loud, retryable failure — never as a
  // send that is quietly skipped and later reported as delivered.
  if (!token) {
    throw new EmailSendError('postmark_not_configured: POSTMARK_SERVER_TOKEN is not set')
  }
  if (!fromAddress) {
    throw new EmailSendError('postmark_not_configured: POSTMARK_FROM_EMAIL is not set')
  }

  const body: Record<string, unknown> = {
    From: fromAddress,
    To: params.to,
    Subject: params.subject,
    HtmlBody: params.html,
    TextBody: params.text,
    MessageStream: Deno.env.get('POSTMARK_MESSAGE_STREAM') || DEFAULT_POSTMARK_MESSAGE_STREAM,
  }
  if (params.replyTo) {
    body.ReplyTo = params.replyTo
  }

  const res = await fetch(POSTMARK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify(body),
  })

  const rawBody = await res.text()
  let parsed: PostmarkResponse | null = null
  try {
    parsed = rawBody ? (JSON.parse(rawBody) as PostmarkResponse) : null
  } catch {
    parsed = null
  }

  if (!res.ok) {
    const retryAfterHeader = res.headers.get('Retry-After')
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null
    throw new EmailSendError(
      `postmark_http_${res.status}: ${parsed?.Message ?? rawBody.slice(0, 500)}`,
      res.status,
      Number.isFinite(retryAfterSeconds as number) ? (retryAfterSeconds as number) : null
    )
  }

  // THE TRAP: Postmark answers HTTP 200 with a NON-ZERO `ErrorCode` for whole classes of
  // failure — inactive recipient (406), invalid email address (300), suppressed address.
  // Treating HTTP 200 as success would record unsent mail as `sent`, which is precisely the
  // silent-failure class this programme keeps being bitten by. Success requires
  // `ErrorCode === 0`; anything else is a failure and `Message` is recorded.
  if (!parsed || parsed.ErrorCode !== 0) {
    throw new EmailSendError(
      `postmark_error_${parsed?.ErrorCode ?? 'unparseable'}: ${parsed?.Message ?? rawBody.slice(0, 500)}`
    )
  }

  // ...and an accepted send must still hand back a provider id, or we have no proof of
  // acceptance to record.
  if (!parsed.MessageID) {
    throw new EmailSendError('provider_no_ack: Postmark returned ErrorCode 0 without a MessageID')
  }

  return { providerMessageId: parsed.MessageID, response: parsed }
}

type PracticeMailbox = {
  id: string
  provider: 'gmail' | 'outlook'
  /** Where the choice came from, for the log trail. */
  source: 'queue_row' | 'organization'
}

/**
 * Resolve the mailbox that practice correspondence must go out through.
 *
 * Returns null when there is no usable mailbox — which means HOLD, never "send it some
 * other way".
 */
async function resolvePracticeMailbox(
  supabase: ReturnType<typeof createClient>,
  queueRow: {
    id: string
    organization_id: string | null
    mailbox_id: string | null
    provider: string | null
    created_by: string | null
  }
): Promise<PracticeMailbox | null> {
  // 1. The row names its own mailbox. Honour it.
  //    `email_queue.provider` DEFAULTS to 'postmark', so presence is not enough — only
  //    'gmail' and 'outlook' are mailbox providers, and a row carrying 'postmark' here is
  //    carrying the default, not a decision.
  if (queueRow.mailbox_id) {
    if (queueRow.provider === 'gmail' || queueRow.provider === 'outlook') {
      return { id: queueRow.mailbox_id, provider: queueRow.provider, source: 'queue_row' }
    }

    // A mailbox is named but the provider is missing or is the table default. Read the
    // provider off the mailbox itself rather than guessing which API to call.
    const { data, error } = await supabase
      .from('connected_mailboxes')
      .select('id, provider, status')
      .eq('id', queueRow.mailbox_id)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      console.error('email_queue mailbox lookup failed', { id: queueRow.id, error: error.message })
      return null
    }
    if (data && (data.provider === 'gmail' || data.provider === 'outlook')) {
      return { id: String(data.id), provider: data.provider, source: 'queue_row' }
    }
    console.warn('email_queue names a mailbox that is not usable', {
      id: queueRow.id,
      mailbox_id: queueRow.mailbox_id,
    })
    return null
  }

  if (!queueRow.organization_id) return null

  // 2. No mailbox on the row: resolve the organisation's active connected mailbox.
  //    `connected_mailboxes.status` is the `mailbox_status` ENUM ('active'|'expired'|
  //    'revoked'|'error') — 'active' is the only usable value. `sync_enabled` is nullable
  //    and the established SQL convention treats NULL as true (COALESCE(sync_enabled,true)).
  //    Preference order mirrors the quote-dispatch RPCs: the mailbox of whoever created the
  //    email, then any active mailbox in the organisation, most recently refreshed first.
  const asMailbox = (row: Record<string, unknown> | null): PracticeMailbox | null => {
    if (!row) return null
    const provider = row.provider
    if (provider !== 'gmail' && provider !== 'outlook') return null
    return { id: String(row.id), provider, source: 'organization' }
  }

  if (queueRow.created_by) {
    const { data, error } = await supabase
      .from('connected_mailboxes')
      .select('id, provider, email_address, updated_at')
      .eq('organization_id', queueRow.organization_id)
      .eq('status', 'active')
      .eq('user_id', queueRow.created_by)
      .or('sync_enabled.is.null,sync_enabled.eq.true')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('email_queue creator mailbox lookup failed', { id: queueRow.id, error: error.message })
    } else {
      const mailbox = asMailbox(data as Record<string, unknown> | null)
      if (mailbox) return mailbox
    }
  }

  const { data, error } = await supabase
    .from('connected_mailboxes')
    .select('id, provider, email_address, updated_at')
    .eq('organization_id', queueRow.organization_id)
    .eq('status', 'active')
    .or('sync_enabled.is.null,sync_enabled.eq.true')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('email_queue organisation mailbox lookup failed', { id: queueRow.id, error: error.message })
    return null
  }
  return asMailbox(data as Record<string, unknown> | null)
}

/**
 * Send practice correspondence through the practice's own mailbox. This function knows
 * about gmail-send and outlook-send and nothing else — there is no other route out of it.
 */
async function sendViaPracticeMailbox(
  supabase: ReturnType<typeof createClient>,
  mailbox: PracticeMailbox,
  queueRow: {
    to_email: string
    subject: string
    body_html: string
    body_text: string | null
    attachments?: unknown
  },
  messageId: string
): Promise<{ providerMessageId: string; response: Record<string, unknown> }> {
  const fnName = mailbox.provider === 'outlook' ? 'outlook-send' : 'gmail-send'

  // Attachments are FORWARDED, not dropped. `email_queue.attachments` is the same shape both
  // mailbox senders now accept ({ filename, content (base64), contentType }); they validate it
  // again on arrival and refuse rather than send a message missing its attachment.
  const attachments = Array.isArray(queueRow.attachments) ? queueRow.attachments : []

  const { data: fnData, error: fnErr } = await supabase.functions.invoke(fnName, {
    body: {
      mailbox_id: mailbox.id,
      to: queueRow.to_email,
      subject: queueRow.subject,
      body_html: queueRow.body_html,
      body_text: queueRow.body_text ?? htmlToText(queueRow.body_html),
      ...(attachments.length > 0 ? { attachments } : {}),
    },
  })
  if (fnErr) throw new Error(`${fnName} invoke failed: ${fnErr.message ?? String(fnErr)}`)

  const data = (fnData ?? {}) as Record<string, unknown>
  if (data.error) throw new Error(String(data.error))

  // gmail-send/outlook-send do not always return a provider message id; a clean invoke
  // means accepted, so synthesize one rather than discarding the acknowledgement.
  const providerMessageId = String(data.message_id ?? data.id ?? `${mailbox.provider}-${messageId}`)
  return { providerMessageId, response: data }
}

/**
 * Every reason a practice email can be HELD.
 *
 * The old blanket "attachments not supported" code is GONE. It existed only because neither
 * mailbox sender accepted attachments at all; both now do, so a blanket refusal would hold
 * mail that is perfectly sendable. In its place are the specific `attachment_*` codes
 * produced by `validateAttachments`, so the hold reason recorded on the row says what is
 * actually wrong with the attachment.
 */
type HoldCode =
  | 'blocked_mailbox_unavailable'
  | 'mailbox_send_failed'
  | AttachmentRejectionCode

/**
 * HOLD a practice email: keep it queued, unsent, and visible.
 *
 * A held message is NOT failed and NOT cancelled — it is genuinely still waiting, and will
 * go out through the practice mailbox as soon as one is available. So `status` stays
 * `'pending'` and the hold is carried by `last_error_code`.
 *
 * `email_queue_status_check` permits only pending|sent|failed|cancelled, that constraint is
 * in the drift registry, and the Emails page has already crashed once on a status its badge
 * map did not know ('cancelled'). Widening a status vocabulary is the defect class behind
 * DEF-026 and DEF-032. So: no new status value. See design §4 and §10.
 */
async function holdEmailQueueRow(
  supabase: ReturnType<typeof createClient>,
  queueRow: { id: string; to_email: string; retry_count: number | null },
  messageId: string,
  code: HoldCode,
  message: string
): Promise<void> {
  // ONLY `mailbox_send_failed` is transient. `blocked_mailbox_unavailable` is a configuration
  // state and every `attachment_*` code is a defect in the enqueued payload — neither gets
  // better by being retried. Counting them as retries would walk the row into the retry
  // ceiling and then bury the real cause behind "max retries exceeded". So the test is a
  // positive allow-list of the one transient code, not a deny-list that a future code could
  // silently join.
  const isTransient = code === 'mailbox_send_failed'
  const priorRetries = queueRow.retry_count ?? 0
  const backoffMinutes = isTransient
    ? Math.min(HOLD_BACKOFF_MAX_MINUTES, HOLD_BACKOFF_BASE_MINUTES * 2 ** Math.min(priorRetries, 8))
    : HOLD_BACKOFF_NO_MAILBOX_MINUTES

  const trimmed = message.slice(0, 1000)

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'email_queue',
    recipient_email: queueRow.to_email,
    status: 'failed',
    error_message: `${code}: ${trimmed}`.slice(0, 1000),
    metadata: { email_queue_id: queueRow.id, held: true, last_error_code: code },
  })

  const { error } = await supabase
    .from('email_queue')
    .update({
      status: 'pending',
      // Release the claim so a later run can pick the row up again, and push `scheduled_at`
      // out so it is not re-attempted every minute.
      claimed_at: null,
      scheduled_at: new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString(),
      error_message: trimmed,
      last_error_code: code,
      last_error_message: trimmed,
      updated_at: new Date().toISOString(),
      ...(isTransient ? { retry_count: priorRetries + 1 } : {}),
    })
    .eq('id', queueRow.id)

  if (error) {
    console.error('email_queue hold could not be recorded', { id: queueRow.id, code, error: error.message })
  } else {
    console.warn('email_queue row held', {
      id: queueRow.id,
      code,
      backoff_minutes: backoffMinutes,
      retry_count_incremented: isTransient,
    })
  }
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  // Postmark's own secrets are checked inside `sendPostmarkEmail`, not here: the practice
  // mailbox path does not need them, and refusing to start would stop practice mail moving
  // because AccountancyOS's own sender is unconfigured.
  if (!supabaseUrl || !supabaseServiceKey) {
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

  // 2. Process auth_emails first (priority), then transactional_emails.
  //
  //    These pgmq queues carry AccountancyOS's OWN mail: `auth_emails` is produced solely by
  //    `auth-email-hook` (password reset, magic link, confirmation), and no producer in this
  //    repository writes to `transactional_emails` at all. So they route to Postmark.
  //
  //    A payload may still declare its own `context`. If one ever carries practice
  //    correspondence, `sendPostmarkEmail` rejects it rather than sending it under the wrong
  //    identity, and the message stays in pgmq — fail closed, in the safe direction.
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
        // Non-negotiable: do not record `sent` unless the provider acknowledged. Postmark's
        // acknowledgement is `ErrorCode === 0` plus a `MessageID` — HTTP 200 alone is not
        // proof, and `sendPostmarkEmail` throws when either is missing.
        const { providerMessageId, response: providerResponse } = await sendPostmarkEmail({
          context: typeof payload.context === 'string' ? payload.context : SYSTEM_CONTEXT,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text ?? htmlToText(payload.html ?? ''),
          replyTo: typeof payload.reply_to === 'string' ? payload.reply_to : null,
        })

        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
          metadata: {
            provider_message_id: String(providerMessageId),
            provider_response: providerResponse,
            provider: 'postmark',
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
            // NB: 'rate_limited' is not in email_send_log_status_check
            // (pending|sent|suppressed|failed|bounced|complained|dlq), so this insert is
            // rejected and the row is not written. Left exactly as it was: logging it as
            // 'failed' instead would make every rate-limit consume the retry budget below
            // and walk the message into the DLQ, which is the opposite of the intent. The
            // status vocabulary is a separate defect — out of scope for this increment.
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

        // Permanent configuration failures — a rejected Server Token, or a From address that is
        // not a verified/confirmed Postmark sender. Retrying cannot help and every remaining
        // message would fail identically, so DLQ this one and stop the batch rather than
        // shovelling the entire queue into the DLQ five attempts at a time.
        if (isPermanentConfigFailure(error)) {
          await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000))
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'permanent_config_failure' }),
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
  let emailQueueHeld = 0
  try {
    // FUN-4/Fix 10: only pick rows that are unclaimed, or whose claim has gone stale (a worker
    // that crashed mid-send). This lets a second worker recover an orphaned row without
    // double-sending a live one.
    const staleClaimBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes
    const dueBefore = new Date().toISOString()
    const { data: rows, error: rowsError } = await supabase
      .from('email_queue')
      .select(
        'id, organization_id, to_email, to_name, subject, body_html, body_text, mailbox_id, provider, context, retry_count, created_by, attachments, entity_type, entity_id'
      )
      .eq('status', 'pending')
      .lte('scheduled_at', dueBefore)
      .or(`claimed_at.is.null,claimed_at.lt.${staleClaimBefore}`)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (rowsError) {
      console.error('Failed to read email_queue', { error: rowsError })
    } else {
      console.log('email_queue due rows selected', {
        count: rows?.length ?? 0,
        batchSize,
        dueBefore,
        staleClaimBefore,
        ids: (rows ?? []).map((row) => ({
          id: row.id,
          context: row.context ?? null,
          provider: row.provider ?? null,
          hasMailbox: Boolean(row.mailbox_id),
        })),
      })

      let selectedRows = 0
      let claimedRows = 0

      for (const row of rows ?? []) {
        selectedRows++
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

        // FUN-4/Fix 10: atomically claim the row before sending. The UPDATE takes a row lock, so
        // if two worker runs race, only one sees status='pending' + a free claim and gets the
        // row back; the other gets no row and skips — preventing a duplicate send.
        const { data: claimed, error: claimError } = await supabase
          .rpc('claim_email_queue_row', {
            p_email_id: row.id,
            p_stale_before: staleClaimBefore,
          })
          .maybeSingle()
        if (claimError) {
          console.error('email_queue claim failed', { id: row.id, error: claimError.message })
          continue
        }
        if (!claimed) {
          console.log('email_queue claim skipped', { id: row.id })
          continue // another worker already claimed or sent this row
        }
        claimedRows++

        // `claim_email_queue_row` returns a fixed column list that does not include `context`
        // or `retry_count`. Rather than change a live RPC's return type (a DROP/CREATE, and
        // the routing decision must not wait on a migration), overlay the claimed values on
        // the row we selected — which carries both.
        const queueRow = { ...row, ...(claimed as typeof row) }

        const messageId = crypto.randomUUID()

        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: 'email_queue',
          recipient_email: queueRow.to_email,
          status: 'pending',
        })

        try {
          let providerResponse: unknown
          let providerLabel: 'gmail' | 'outlook' | 'postmark'
          let providerId: string

          console.log('email_queue routing claimed row', {
            id: queueRow.id,
            context: queueRow.context ?? null,
            system: isSystemEmail(queueRow.context),
            hasMailbox: Boolean(queueRow.mailbox_id),
          })

          // ================================================================
          // THE ROUTING DECISION. Positive, on `context`. Never on presence.
          // ================================================================
          if (isSystemEmail(queueRow.context)) {
            // AccountancyOS's own mail — platform notices to practice staff.
            providerLabel = 'postmark'
            const sent = await sendPostmarkEmail({
              context: queueRow.context,
              to: queueRow.to_email,
              subject: queueRow.subject,
              html: queueRow.body_html,
              text: queueRow.body_text ?? htmlToText(queueRow.body_html),
            })
            providerId = sent.providerMessageId
            providerResponse = sent.response
          } else {
            // Practice correspondence — including context NULL. The practice's own mailbox
            // or nothing. Every failure direction below HOLDS the row; none of them, and
            // no path after them, can reach another sender.
            const mailbox = await resolvePracticeMailbox(supabase, queueRow)

            if (!mailbox) {
              await holdEmailQueueRow(
                supabase,
                queueRow,
                messageId,
                'blocked_mailbox_unavailable',
                'No active connected mailbox for this organisation. Practice email is only ever ' +
                  'sent from the practice\'s own mailbox, so this message is held, unsent. ' +
                  'Connect Gmail or Outlook in Settings to release it.'
              )
              emailQueueHeld++
              continue
            }

            // ATTACHMENT VALIDATION — provider-specific, so it can only run once the mailbox
            // is known (Gmail allows 25 MB, Microsoft Graph's simple fileAttachment 3 MB).
            //
            // This replaces the old blanket "attachments not supported" hold, which existed only
            // because neither mailbox sender accepted attachments at all. They both do now, so
            // an attachment that is well-formed and within the provider's limit is SENT.
            //
            // Anything that is not is HELD with the specific reason — never sent with the
            // attachment dropped. Delivering an invoice email with no invoice attached is a
            // client-visible failure that looks like a success on our side.
            const attachmentValidation = validateAttachments(queueRow.attachments, mailbox.provider)
            if (!attachmentValidation.ok) {
              await holdEmailQueueRow(
                supabase,
                queueRow,
                messageId,
                attachmentValidation.code,
                `${attachmentValidation.message} The message is held, unsent, rather than ` +
                  `delivered without its attachment.`
              )
              emailQueueHeld++
              continue
            }

            providerLabel = mailbox.provider
            try {
              const sent = await sendViaPracticeMailbox(supabase, mailbox, queueRow, messageId)
              providerId = sent.providerMessageId
              providerResponse = sent.response
            } catch (mailboxError) {
              const mailboxErrorMsg =
                mailboxError instanceof Error ? mailboxError.message : String(mailboxError)
              await holdEmailQueueRow(
                supabase,
                queueRow,
                messageId,
                'mailbox_send_failed',
                `Sending through the practice mailbox (${mailbox.provider}) failed: ` +
                  `${mailboxErrorMsg}. The message is held and will be retried through the same ` +
                  `mailbox; it is never re-routed to another sender.`
              )
              emailQueueHeld++
              continue
            }
          }

          if (!providerId) {
            // Defence in depth. Both senders above throw rather than return an empty id, so
            // reaching here means one of them changed.
            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'email_queue',
              recipient_email: queueRow.to_email,
              status: 'failed',
              error_message: 'provider_no_ack: sender resolved without a provider message id',
              metadata: { provider_response: providerResponse ?? null, email_queue_id: queueRow.id },
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
              .eq('id', queueRow.id)
            emailQueueFailed++
            continue
          }

          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'email_queue',
            recipient_email: queueRow.to_email,
            status: 'sent',
            metadata: {
              provider_message_id: String(providerId),
              provider_response: providerResponse,
              email_queue_id: queueRow.id,
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
            .eq('id', queueRow.id)

          // ================================================================
          // INVOICE SENT-STATE. Enqueuing is not sending.
          // ================================================================
          // `send-invoice` used to stamp `invoices.sent_at` the instant it enqueued the row,
          // so an invoice read as "sent" while its email was still queued, held or failed.
          // With attachment validation and the mailbox hold, an invoice could sit held
          // indefinitely and still display as sent — exactly the wrong direction.
          //
          // So it is stamped HERE and only here: on the success path, after the provider
          // acknowledged with a message id and the queue row was marked `sent`. Held and
          // failed rows `continue` before reaching this point, so they leave `sent_at` NULL
          // and remain visibly unsent.
          //
          // `.is('sent_at', null)` makes a resend a no-op against the column: the original
          // send time is the one that matters, and overwriting it would erase the record of
          // when the client first received the invoice.
          if (queueRow.entity_type === 'invoice' && queueRow.entity_id) {
            const { error: invoiceError } = await supabase
              .from('invoices')
              .update({ sent_at: new Date().toISOString() })
              .eq('id', queueRow.entity_id)
              .is('sent_at', null)

            // The email genuinely went out. Failing the send because a bookkeeping column
            // could not be stamped would be strictly worse — it would drive a retry and send
            // the client a second copy. Log it and move on.
            if (invoiceError) {
              console.error('email_queue: invoice sent_at not stamped', {
                id: queueRow.id,
                invoice_id: queueRow.entity_id,
                error: invoiceError.message,
              })
            }
          }

          emailQueueProcessed++
          await new Promise((r) => setTimeout(r, sendDelayMs))
        } catch (error) {
          // Only the Postmark (system) branch can land here: every practice-mailbox failure
          // is caught above and held.
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('email_queue send failed', { id: queueRow.id, error: errorMsg })
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'email_queue',
            recipient_email: queueRow.to_email,
            status: 'failed',
            error_message: errorMsg.slice(0, 1000),
            metadata: { email_queue_id: queueRow.id },
          })
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              error_message: errorMsg.slice(0, 1000),
              last_error_code: isRateLimited(error)
                ? 'rate_limited'
                : errorMsg.startsWith('provider_no_ack')
                  ? 'provider_no_ack'
                  : 'send_failed',
              last_error_message: errorMsg.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq('id', queueRow.id)
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

      if (selectedRows > 0 && claimedRows === 0) {
        console.warn('email_queue rows selected but none claimed', { selectedRows })
      }
    }
  } catch (e) {
    console.error('email_queue drain crashed', { error: e instanceof Error ? e.message : String(e) })
  }

  return new Response(
    JSON.stringify({
      processed: totalProcessed + emailQueueProcessed,
      failed: emailQueueFailed,
      held: emailQueueHeld,
      pgmq_processed: totalProcessed,
      email_queue_processed: emailQueueProcessed,
      email_queue_failed: emailQueueFailed,
      email_queue_held: emailQueueHeld,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
