/**
 * ============================================================================
 * EMAIL ATTACHMENTS — encoding + validation for the practice-mailbox senders
 * ============================================================================
 *
 * PURITY CONTRACT (load-bearing — do not break it).
 *
 * This module has ZERO imports and uses only standard JS / Web platform APIs
 * (`btoa`, `atob`, `TextEncoder`, `Math`, `Date`). No Deno APIs, no npm:/jsr:/https:
 * specifiers, no Supabase client.
 *
 * Why: it is imported *directly* by the Vitest regression suite in
 * `src/test/regression/email-attachments.test.ts`, which asserts on the real MIME text and
 * the real Microsoft Graph payload — including decoding the attachment payload back to bytes
 * and comparing it to the original PDF. That is only possible if this file can be imported
 * outside Deno. Adding a Deno-only import here silently deletes that proof.
 *
 * WHAT THIS EXISTS FOR
 * --------------------
 * `send-invoice` enqueues the invoice PDF on `email_queue.attachments`. All practice
 * correspondence now routes through the accountant's connected mailbox (see
 * `docs/superpowers/plans/2026-08-25-email-sender-identity-and-postmark.md`), and neither
 * `gmail-send` nor `outlook-send` used to accept attachments at all — so those rows were
 * HELD. This module makes them sendable.
 *
 * THE NON-NEGOTIABLE RULE: nothing is ever dropped or truncated.
 * An attachment that cannot be sent correctly causes the whole message to be HELD, with a
 * specific reason code. Delivering an invoice email with no invoice attached is a
 * client-visible failure that looks like a success on our side — the exact silent-failure
 * class this programme keeps being bitten by.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape `send-invoice` (and any other producer) writes to `email_queue.attachments`. */
export interface EmailAttachment {
  filename: string
  /** Base64-encoded file bytes. Whitespace/line wrapping is tolerated and normalised. */
  content: string
  contentType: string
}

/** The mailbox providers that can carry an attachment. Postmark is never on this path. */
export type AttachmentProvider = 'gmail' | 'outlook'

/**
 * Every way an attachment can be refused. Each has its OWN code so the hold reason recorded
 * on `email_queue.last_error_code` says what is actually wrong, rather than a generic
 * "attachments not supported".
 */
export type AttachmentRejectionCode =
  | 'attachment_invalid_payload'
  | 'attachment_invalid_filename'
  | 'attachment_invalid_base64'
  | 'attachment_unsupported_type'
  | 'attachment_too_large'

export type AttachmentValidation =
  | { ok: true }
  | { ok: false; code: AttachmentRejectionCode; message: string }

// ---------------------------------------------------------------------------
// Provider size limits — computed on DECODED bytes
// ---------------------------------------------------------------------------

/**
 * Gmail: 25 MB total message size.
 * Source: Google Workspace Admin Help, "Gmail sending limits" — messages up to 25 MB.
 *
 * TRACEABILITY NOTE (deliberate, flagged): the published 25 MB is Gmail's limit on the
 * message it receives, and the Gmail API `raw` field is base64url of that message, which
 * inflates by ~4/3. This check is applied to the DECODED attachment bytes, as specified,
 * so it is the *headline* limit rather than the wire limit. A payload between ~18.75 MB and
 * 25 MB decoded will pass here and may still be refused by Gmail — which surfaces as a
 * `mailbox_send_failed` hold, not as a silent drop, so the failure direction stays safe.
 */
export const GMAIL_MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 26_214_400

/**
 * Microsoft Graph simple `fileAttachment`: 3 MB total.
 * Source: Microsoft Graph docs, "Add an attachment" — attachments smaller than 3 MB may be
 * added directly to the message; anything larger REQUIRES an upload session
 * (`createUploadSession`).
 *
 * Upload sessions are explicitly OUT OF SCOPE. A message over this limit must be HELD, never
 * sent with the attachment stripped.
 */
export const OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024 // 3_145_728

export function maxTotalAttachmentBytes(provider: AttachmentProvider): number {
  return provider === 'outlook'
    ? OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES
    : GMAIL_MAX_TOTAL_ATTACHMENT_BYTES
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

/** Strip the whitespace a wrapped base64 payload may carry. Does not alter the bytes. */
export function normalizeBase64(raw: string): string {
  return raw.replace(/[\s]/g, '')
}

const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Decode base64 to bytes, or return null if it is not decodable.
 *
 * `atob` alone is not a sufficient check: it is lenient in places and throws in others.
 * The alphabet and length are validated first so the answer is deterministic.
 */
export function decodeBase64(raw: string): Uint8Array | null {
  const b64 = normalizeBase64(raw)
  if (b64.length === 0) return new Uint8Array(0)
  if (b64.length % 4 !== 0) return null
  if (!BASE64_ALPHABET.test(b64)) return null
  // Padding may only ever appear at the very end.
  const firstPad = b64.indexOf('=')
  if (firstPad !== -1 && firstPad < b64.length - 2) return null

  let binary: string
  try {
    binary = atob(b64)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Decoded byte length of a base64 string, or null if it is not decodable. */
export function decodedByteLength(raw: string): number | null {
  const b64 = normalizeBase64(raw)
  if (b64.length === 0) return 0
  if (b64.length % 4 !== 0) return null
  if (!BASE64_ALPHABET.test(b64)) return null
  const firstPad = b64.indexOf('=')
  if (firstPad !== -1 && firstPad < b64.length - 2) return null
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return (b64.length / 4) * 3 - padding
}

/** Base64 of a UTF-8 string. Used for header words and text body parts. */
export function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  // Chunked so a large body cannot blow the argument limit of String.fromCharCode.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Wrap a base64 payload at 76 characters per line, as RFC 2045 §6.8 requires. */
export function wrapBase64(b64: string, lineLength = 76): string {
  const compact = normalizeBase64(b64)
  const lines: string[] = []
  for (let i = 0; i < compact.length; i += lineLength) {
    lines.push(compact.slice(i, i + lineLength))
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_FILENAME_LENGTH = 255

/**
 * `type/subtype`, RFC 6838 restricted-name characters. Parameters (`; charset=…`) are
 * stripped before the test, so `application/pdf; name="x"` is accepted on its type.
 */
const MIME_TYPE_RE =
  /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/

/** Control characters, including CR and LF — the header-injection vector. */
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/

function reject(code: AttachmentRejectionCode, message: string): AttachmentValidation {
  return { ok: false, code, message }
}

/**
 * Validate every attachment on a queued message for a specific provider.
 *
 * Returns `{ ok: true }` for null / undefined / an empty array — a message with no
 * attachments is always valid.
 *
 * The caller HOLDS the message on any failure, recording `code` as
 * `email_queue.last_error_code`. It never sends a partial message.
 */
export function validateAttachments(
  attachments: unknown,
  provider: AttachmentProvider,
): AttachmentValidation {
  if (attachments === null || attachments === undefined) return { ok: true }

  if (!Array.isArray(attachments)) {
    // A non-array value here used to be counted as "no attachments" and quietly ignored.
    // That is a silent drop: the producer meant to attach something.
    return reject(
      'attachment_invalid_payload',
      `email_queue.attachments is ${typeof attachments}, not an array. It cannot be sent, and ` +
        `treating it as "no attachments" would silently drop whatever the sender intended to attach.`,
    )
  }

  if (attachments.length === 0) return { ok: true }

  let totalDecodedBytes = 0

  for (let i = 0; i < attachments.length; i++) {
    const item = attachments[i] as unknown
    const at = `attachment[${i}]`

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return reject(
        'attachment_invalid_payload',
        `${at} is not an object, so it carries no filename, content or contentType.`,
      )
    }

    const record = item as Record<string, unknown>

    // --- filename ---------------------------------------------------------
    const filename = record.filename
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      return reject(
        'attachment_invalid_filename',
        `${at} has no filename. An attachment without a name cannot be given a ` +
          `Content-Disposition, and renaming it here would hide the producer's bug.`,
      )
    }
    if (filename.length > MAX_FILENAME_LENGTH) {
      return reject(
        'attachment_invalid_filename',
        `${at} filename is ${filename.length} characters; the limit is ${MAX_FILENAME_LENGTH}.`,
      )
    }
    if (CONTROL_CHARS_RE.test(filename)) {
      return reject(
        'attachment_invalid_filename',
        `${at} filename contains control characters. CR/LF in a filename is a header-injection ` +
          `vector in the MIME message, so it is refused rather than escaped.`,
      )
    }
    if (filename.includes('"')) {
      return reject(
        'attachment_invalid_filename',
        `${at} filename contains a double quote, which would terminate the quoted ` +
          `Content-Disposition filename parameter.`,
      )
    }
    if (filename.includes('/') || filename.includes('\\')) {
      return reject(
        'attachment_invalid_filename',
        `${at} filename contains a path separator. An attachment name is a leaf name, never a path.`,
      )
    }
    if (filename.includes('..')) {
      return reject(
        'attachment_invalid_filename',
        `${at} filename contains "..", a path-traversal sequence.`,
      )
    }

    // --- contentType ------------------------------------------------------
    const contentType = record.contentType
    if (typeof contentType !== 'string' || contentType.trim().length === 0) {
      return reject(
        'attachment_unsupported_type',
        `${at} ("${filename}") has no contentType. Guessing one from the extension would risk ` +
          `mislabelling the payload to the recipient.`,
      )
    }
    if (CONTROL_CHARS_RE.test(contentType)) {
      return reject(
        'attachment_unsupported_type',
        `${at} ("${filename}") contentType contains control characters.`,
      )
    }
    const essence = contentType.split(';')[0].trim()
    if (!MIME_TYPE_RE.test(essence)) {
      // Deliberately NOT an allowlist: any well-formed type/subtype is acceptable. Only
      // malformed values are refused, because they would produce an invalid MIME header.
      return reject(
        'attachment_unsupported_type',
        `${at} ("${filename}") contentType "${contentType}" is not a well-formed MIME type/subtype.`,
      )
    }

    // --- content ----------------------------------------------------------
    const content = record.content
    if (typeof content !== 'string' || content.length === 0) {
      return reject(
        'attachment_invalid_base64',
        `${at} ("${filename}") has no base64 content.`,
      )
    }
    const byteLength = decodedByteLength(content)
    if (byteLength === null) {
      return reject(
        'attachment_invalid_base64',
        `${at} ("${filename}") content is not decodable base64.`,
      )
    }
    if (byteLength === 0) {
      return reject(
        'attachment_invalid_base64',
        `${at} ("${filename}") decodes to zero bytes. Sending an empty file is indistinguishable ` +
          `from a lost one at the recipient.`,
      )
    }

    totalDecodedBytes += byteLength
  }

  // --- provider size limit, on DECODED bytes -------------------------------
  const limit = maxTotalAttachmentBytes(provider)
  if (totalDecodedBytes > limit) {
    const detail =
      provider === 'outlook'
        ? `Microsoft Graph only accepts a simple fileAttachment below ${limit} bytes (3 MB); ` +
          `anything larger needs an upload session, which is not implemented. The message is ` +
          `held rather than sent without its attachment.`
        : `Gmail accepts a total message of ${limit} bytes (25 MB).`
    return reject(
      'attachment_too_large',
      `Attachments total ${totalDecodedBytes} decoded bytes, over the ${provider} limit of ` +
        `${limit} bytes. ${detail}`,
    )
  }

  return { ok: true }
}

/**
 * Narrow an already-validated `email_queue.attachments` value to the concrete array.
 * Returns [] for null/undefined/empty. Callers MUST have run `validateAttachments` first.
 */
export function asAttachmentList(attachments: unknown): EmailAttachment[] {
  if (!Array.isArray(attachments)) return []
  return attachments as EmailAttachment[]
}

// ---------------------------------------------------------------------------
// Gmail — RFC 5322 / RFC 2045 message construction
// ---------------------------------------------------------------------------

const CRLF = '\r\n'

function makeBoundary(tag: string): string {
  return `----=_AOS_${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

/**
 * RFC 2047 encoded-word for a header value that is not pure US-ASCII. Plain ASCII is left
 * alone so the common case stays human-readable in the raw message.
 */
export function encodeHeaderValue(value: string): string {
  const clean = value.replace(CONTROL_CHARS_RE, ' ')
  // eslint-disable-next-line no-control-regex
  if (!/[^\u0020-\u007E]/.test(clean)) return clean
  return `=?UTF-8?B?${base64EncodeUtf8(clean)}?=`
}

export interface GmailMimeParams {
  from: string
  to: string | string[]
  subject: string
  html?: string | null
  text?: string | null
  attachments?: unknown
  /** Optional, so the existing gmail-send cc/bcc/threading behaviour survives attachments. */
  cc?: string | string[]
  bcc?: string | string[]
  inReplyTo?: string | null
}

function addressList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' && v.length > 0)
}

/**
 * Build the full RFC 5322 message for the Gmail API `raw` field.
 *
 * Structure:
 *
 *   multipart/mixed
 *   ├── multipart/alternative      (only when BOTH html and text are present)
 *   │   ├── text/plain
 *   │   └── text/html
 *   └── one part per attachment    (base64, Content-Disposition: attachment)
 *
 * Text parts are base64 with an explicit `charset="UTF-8"` rather than the `7bit` the
 * attachment-free path declares. `7bit` is a lie for any body containing a non-ASCII
 * character (a £ sign, a client's name), and a lying CTE is how bodies arrive mojibaked.
 */
export function buildGmailMimeMessage(params: GmailMimeParams): string {
  const to = addressList(params.to)
  const cc = addressList(params.cc)
  const bcc = addressList(params.bcc)
  const attachments = asAttachmentList(params.attachments)

  const html = typeof params.html === 'string' && params.html.length > 0 ? params.html : ''
  const text = typeof params.text === 'string' && params.text.length > 0 ? params.text : ''

  const mixedBoundary = makeBoundary('MIX')
  const altBoundary = makeBoundary('ALT')

  const headers: string[] = [
    `From: ${params.from}`,
    `To: ${to.join(', ')}`,
  ]
  if (cc.length > 0) headers.push(`Cc: ${cc.join(', ')}`)
  if (bcc.length > 0) headers.push(`Bcc: ${bcc.join(', ')}`)
  headers.push(`Subject: ${encodeHeaderValue(params.subject ?? '')}`)
  headers.push('MIME-Version: 1.0')
  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`)
    headers.push(`References: ${params.inReplyTo}`)
  }
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)

  const lines: string[] = [...headers, '', 'This is a multi-part message in MIME format.', '']

  // ---- body ----
  const textPart = (): string[] => [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(base64EncodeUtf8(text)),
  ]
  const htmlPart = (): string[] => [
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(base64EncodeUtf8(html)),
  ]

  lines.push(`--${mixedBoundary}`)
  if (html && text) {
    // Both bodies present -> multipart/alternative, so the client picks.
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`, '')
    lines.push(`--${altBoundary}`, ...textPart(), '')
    lines.push(`--${altBoundary}`, ...htmlPart(), '')
    lines.push(`--${altBoundary}--`, '')
  } else if (html) {
    lines.push(...htmlPart(), '')
  } else {
    lines.push(...textPart(), '')
  }

  // ---- attachments ----
  for (const attachment of attachments) {
    const filename = String(attachment.filename)
    const contentType = String(attachment.contentType)
    lines.push(`--${mixedBoundary}`)
    lines.push(`Content-Type: ${contentType}; name="${filename}"`)
    lines.push('Content-Transfer-Encoding: base64')
    lines.push(`Content-Disposition: attachment; filename="${filename}"`)
    lines.push('')
    lines.push(wrapBase64(String(attachment.content)))
    lines.push('')
  }

  lines.push(`--${mixedBoundary}--`, '')

  return lines.join(CRLF)
}

/**
 * Encode a MIME message for the Gmail API `raw` field: base64url, no padding.
 * https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send
 */
export function toGmailRawParam(mime: string): string {
  return base64EncodeUtf8(mime)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Outlook — Microsoft Graph fileAttachment
// ---------------------------------------------------------------------------

export interface GraphFileAttachment {
  '@odata.type': '#microsoft.graph.fileAttachment'
  name: string
  contentType: string
  /** Base64, unwrapped — Graph rejects embedded newlines. */
  contentBytes: string
}

/**
 * Build Microsoft Graph `fileAttachment` objects for `POST /me/sendMail`.
 * https://learn.microsoft.com/en-us/graph/api/resources/fileattachment
 *
 * Only valid below the 3 MB simple-attachment ceiling; `validateAttachments(_, 'outlook')`
 * enforces that before this is called.
 */
export function buildOutlookAttachments(attachments: unknown): GraphFileAttachment[] {
  return asAttachmentList(attachments).map((attachment) => ({
    '@odata.type': '#microsoft.graph.fileAttachment' as const,
    name: String(attachment.filename),
    contentType: String(attachment.contentType),
    contentBytes: normalizeBase64(String(attachment.content)),
  }))
}
