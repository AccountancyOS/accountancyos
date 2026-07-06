/**
 * FUN-4 / Audit Fix 10 — deterministic email idempotency keys.
 *
 * A key uniquely identifies ONE logical email event. The email_queue table has a unique index
 * on idempotency_key, so two producer calls with the same key collapse to a single queued email
 * (ON CONFLICT DO NOTHING). Genuinely distinct events (separate scheduled chasers, a deliberate
 * resend on a later day) MUST produce distinct keys so they are not suppressed.
 *
 * The edge-function producers (send-invoice, send-engagement-letter, chaser-tick) build keys of
 * the same shape inline (they run in Deno and cannot import this module); the tests assert these
 * exact formats so the two stay in lockstep.
 */

/** YYYY-MM-DD in UTC, matching `new Date().toISOString().slice(0, 10)` used in the edge fns. */
export function utcDateStamp(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Invoice send. Date-bucketed so an accidental double-send of the same invoice on the same day
 * is deduped, while a deliberate resend on a later day is a new event.
 */
export function invoiceSendKey(invoiceId: string, at: Date): string {
  return `invoice-send:${invoiceId}:${utcDateStamp(at)}`;
}

/** Engagement-letter send. Same date-bucketed rationale as invoiceSendKey. */
export function engagementLetterKey(letterId: string, at: Date): string {
  return `engagement-letter:${letterId}:${utcDateStamp(at)}`;
}

/**
 * Chaser send. Keyed on the specific scheduled occurrence (next_send_at), so a retried tick
 * dedups but each distinct scheduled chaser remains a separate send.
 */
export function chaserKey(organizationId: string, runId: string, nextSendAt: string): string {
  return `chaser:${organizationId}:${runId}:${nextSendAt}`;
}
