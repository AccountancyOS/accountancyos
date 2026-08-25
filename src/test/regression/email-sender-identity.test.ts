import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EMAIL_QUEUE_STATUSES } from "@/lib/db-constants/check-constraints";

/**
 * SENDER IDENTITY — the hard rule (owner, 2026-08-25).
 *
 * Two strictly separated sender identities:
 *
 *   context === 'system'       -> AccountancyOS's own mail -> Postmark
 *   anything else, incl. NULL  -> practice correspondence   -> the practice's connected
 *                                 mailbox (gmail/outlook) ONLY
 *
 * There is NO Postmark fallback for practice correspondence. Ever. No mailbox, or a
 * mailbox send that fails, means the message is HELD: still queued, still `pending`,
 * unsent, with `last_error_code` set so the UI can warn.
 *
 * The defect being pinned: the drainer used to choose its sender by PRESENCE —
 * `if (queueRow.mailbox_id && queueRow.provider) {...} else {default provider}` — so a
 * client email with no mailbox fell through to the platform sender. The moment that
 * default became Postmark, a missing mailbox would have sent a client's own accountant's
 * correspondence from accountancyos.com, visible to the client and unrecoverable once
 * delivered. Routing must be a positive decision on `context`.
 *
 * Design: docs/superpowers/plans/2026-08-25-email-sender-identity-and-postmark.md §3,4,5,9,10.
 *
 * These are source-level contract tests, in the style of this directory: the drainer is a
 * Deno edge function that cannot be imported into Vitest, so the invariants are asserted
 * against its source text.
 */
const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const SRC = read("supabase/functions/process-email-queue/index.ts");

/**
 * Remove whole-line `//` comments and block comments. The "no Postmark here" assertions
 * below are about CODE PATHS, not prose: a comment is allowed to explain why the practice
 * path exists, or to name `email_queue.provider`'s 'postmark' default as the trap it is.
 * Only full-line comments are stripped, so a URL's `//` is never mistaken for one.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/** Body of a top-level function, signature to its column-0 closing brace. */
function fnBody(name: string): string {
  const start = SRC.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in process-email-queue`);
  const end = SRC.indexOf("\n}\n", start);
  if (end === -1) throw new Error(`could not find the end of ${name}`);
  return SRC.slice(start, end);
}

describe("sender identity — routing is a positive decision on context", () => {
  it("decides on `context === 'system'`", () => {
    expect(SRC).toMatch(/function isSystemEmail\([^)]*\)[^{]*\{\s*return context === 'system'/);
    expect(SRC).toMatch(/if \(isSystemEmail\(queueRow\.context\)\) \{/);
  });

  it("no longer chooses the sender by whether a mailbox happens to be present", () => {
    // The exact shape of the original defect.
    expect(SRC).not.toMatch(/if \(queueRow\.mailbox_id && queueRow\.provider\)/);
    // Nothing may branch to a sender on mailbox presence alone.
    expect(SRC).not.toMatch(/if \([^)]*mailbox_id\s*&&[^)]*provider[^)]*\)\s*\{[\s\S]{0,400}else\s*\{/);
  });

  it("routes NULL context to the mailbox path, never to Postmark", () => {
    // isSystemEmail is a strict equality against the one permitted value, so NULL,
    // undefined and every other context fall to the else branch by construction.
    expect(SRC).toMatch(/return context === 'system'/);
    expect(SRC).not.toMatch(/context\s*(!==|===)\s*null\s*\?[\s\S]{0,80}[Pp]ostmark/);
  });
});

describe("sender identity — practice correspondence can never reach Postmark", () => {
  /**
   * The central assertion, made three ways:
   *   1. the sender itself refuses a non-system context, before it can do any I/O;
   *   2. the non-system branch of the router contains no reference to Postmark at all;
   *   3. the helpers that carry practice mail contain no reference to Postmark at all.
   *
   * (1) is the strong one: the guard lives INSIDE `sendPostmarkEmail`, so the property is
   * "no code path CAN", not merely "no code path currently does".
   */

  it("guards inside the Postmark sender, before any network call", () => {
    const body = fnBody("sendPostmarkEmail");
    const guard = body.indexOf("if (!isSystemEmail(params.context))");
    const fetchAt = body.indexOf("fetch(");
    expect(guard).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    // The refusal must come first — a guard after the send is not a guard.
    expect(fetchAt).toBeGreaterThan(guard);
    expect(body).toMatch(/postmark_blocked_non_system/);
    expect(body.slice(guard, fetchAt)).toMatch(/throw new EmailSendError/);
  });

  it("passes the row's real context to the sender rather than asserting 'system'", () => {
    // Hard-coding `context: 'system'` at the email_queue call site would defeat the guard.
    expect(SRC).toMatch(/sendPostmarkEmail\(\{\s*\n\s*context: queueRow\.context,/);
  });

  it("keeps every Postmark call site inside a system-only branch", () => {
    // One definition + the pgmq send + the email_queue system-branch send. A fourth
    // occurrence means a new route to AccountancyOS's own domain that this suite has
    // not examined.
    const sites = [...SRC.matchAll(/sendPostmarkEmail\(/g)];
    expect(sites.length).toBe(3);
  });

  it("has no Postmark reference anywhere in the non-system branch", () => {
    const routerAt = SRC.indexOf("if (isSystemEmail(queueRow.context)) {");
    const elseAt = SRC.indexOf("} else {", routerAt);
    const endAt = SRC.indexOf("if (!providerId) {", elseAt);
    expect(routerAt).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(routerAt);
    expect(endAt).toBeGreaterThan(elseAt);

    const practiceBranch = SRC.slice(elseAt, endAt);
    expect(stripComments(practiceBranch)).not.toMatch(/postmark/i);
    // What it does instead: resolve a mailbox, send through it, or hold.
    expect(practiceBranch).toMatch(/resolvePracticeMailbox/);
    expect(practiceBranch).toMatch(/sendViaPracticeMailbox/);
    expect(practiceBranch).toMatch(/holdEmailQueueRow/);
    // All three failure directions hold rather than re-route: no mailbox, mailbox send failed,
    // and a message carrying attachments the mailbox senders cannot yet carry.
    expect([...practiceBranch.matchAll(/holdEmailQueueRow\(/g)].length).toBe(3);
  });

  it("keeps the practice-mail helpers free of any other sender", () => {
    for (const fn of ["resolvePracticeMailbox", "sendViaPracticeMailbox", "holdEmailQueueRow"]) {
      expect(stripComments(fnBody(fn))).not.toMatch(/postmark/i);
    }
    // The mailbox sender knows about these two functions and nothing else.
    const sender = fnBody("sendViaPracticeMailbox");
    expect(sender).toMatch(/outlook-send/);
    expect(sender).toMatch(/gmail-send/);
    expect(sender).not.toMatch(/fetch\(/);
  });

  it("resolves the practice mailbox on the live 'active' predicate", () => {
    const body = fnBody("resolvePracticeMailbox");
    // connected_mailboxes.status is the mailbox_status ENUM
    // ('active'|'expired'|'revoked'|'error'); 'active' is the only usable value. There is
    // no is_active column on this table (disconnect_mailbox_safe wrongly assumes one).
    expect(body).toMatch(/from\('connected_mailboxes'\)/);
    expect(body).toMatch(/\.eq\('status', 'active'\)/);
    expect(body).not.toMatch(/is_active/);
    // Scoped to the organisation, preferring the creator's mailbox.
    expect(body).toMatch(/\.eq\('organization_id', queueRow\.organization_id\)/);
    expect(body).toMatch(/\.eq\('user_id', queueRow\.created_by\)/);
    // `email_queue.provider` DEFAULTS to 'postmark', so presence is not a mailbox.
    expect(body).toMatch(/queueRow\.provider === 'gmail' \|\| queueRow\.provider === 'outlook'/);
    // No mailbox means null, which means hold — never a substitute sender.
    expect(body).toMatch(/return null/);
  });
});

describe("Postmark — HTTP 200 is not proof of delivery", () => {
  it("posts the documented request", () => {
    expect(SRC).toMatch(/https:\/\/api\.postmarkapp\.com\/email/);
    expect(SRC).toMatch(/'X-Postmark-Server-Token'/);
    const body = fnBody("sendPostmarkEmail");
    for (const field of ["From", "To", "Subject", "HtmlBody", "TextBody", "MessageStream"]) {
      expect(body).toMatch(new RegExp(`${field}:`));
    }
    expect(body).toMatch(/body\.ReplyTo = params\.replyTo/);
    expect(SRC).toMatch(/POSTMARK_MESSAGE_STREAM'\)\s*\|\|\s*DEFAULT_POSTMARK_MESSAGE_STREAM/);
    expect(SRC).toMatch(/DEFAULT_POSTMARK_MESSAGE_STREAM = 'outbound'/);
  });

  it("requires ErrorCode === 0, not merely a 200", () => {
    // THE TRAP: Postmark answers HTTP 200 with a non-zero ErrorCode for inactive and
    // invalid recipients. Accepting the 200 would record unsent mail as `sent`.
    const body = fnBody("sendPostmarkEmail");
    const check = body.indexOf("parsed.ErrorCode !== 0");
    const success = body.indexOf("return { providerMessageId");
    expect(check).toBeGreaterThan(-1);
    expect(success).toBeGreaterThan(check);
    expect(body).toMatch(/if \(!parsed \|\| parsed\.ErrorCode !== 0\)/);
    // The failure records the code and Postmark's own message.
    expect(body).toMatch(/postmark_error_\$\{parsed\?\.ErrorCode/);
    expect(body).toMatch(/parsed\?\.Message/);
  });

  it("will not acknowledge a send without a MessageID", () => {
    const body = fnBody("sendPostmarkEmail");
    expect(body).toMatch(/if \(!parsed\.MessageID\)/);
    expect(body).toMatch(/provider_no_ack/);
    expect(body).toMatch(/providerMessageId: parsed\.MessageID/);
  });

  it("fails closed when its secrets are missing", () => {
    const body = fnBody("sendPostmarkEmail");
    expect(body).toMatch(/if \(!token\) \{\s*\n\s*throw new EmailSendError\('postmark_not_configured/);
    expect(body).toMatch(/if \(!fromAddress\) \{\s*\n\s*throw new EmailSendError\('postmark_not_configured/);
    // No silent skip and no defaulted From address.
    expect(body).not.toMatch(/POSTMARK_FROM_EMAIL'\)\s*(\?\?|\|\|)/);
    expect(body).not.toMatch(/if \(!token\)\s*return/);
  });
});

describe("holding — pending, marked, and not counted as a retry", () => {
  const HOLD = fnBody("holdEmailQueueRow");
  const QUEUE_UPDATE = HOLD.slice(HOLD.indexOf(".from('email_queue')"));

  it("leaves the row `pending` and adds no new status value", () => {
    // email_queue_status_check permits only pending|sent|failed|cancelled, that constraint
    // is in the drift registry, and /emails has already crashed once on a status its badge
    // map did not know. `blocked_mailbox_unavailable` is an error CODE, not a status.
    const statuses = [...QUEUE_UPDATE.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(statuses).toEqual(["pending"]);
    for (const status of statuses) {
      expect(EMAIL_QUEUE_STATUSES).toContain(status);
    }
    expect(EMAIL_QUEUE_STATUSES).not.toContain("blocked_mailbox_unavailable");
    expect(EMAIL_QUEUE_STATUSES).not.toContain("held");
    expect(SRC).not.toMatch(/status:\s*'(blocked|held|blocked_mailbox_unavailable)'/);
  });

  it("records the reason in last_error_code / last_error_message", () => {
    expect(QUEUE_UPDATE).toMatch(/last_error_code: code/);
    expect(QUEUE_UPDATE).toMatch(/last_error_message: trimmed/);
    expect(SRC).toMatch(/'blocked_mailbox_unavailable'/);
    expect(SRC).toMatch(/'mailbox_send_failed'/);
    // UPDATED 2026-08-25, deliberately, NOT weakened.
    //
    // `'attachments_unsupported'` was a blanket hold code from when neither gmail-send nor
    // outlook-send accepted attachments at all. Both now do, so the blanket refusal has been
    // REMOVED — keeping it would hold invoice mail that is perfectly sendable, which is the
    // very bug it guarded against, inverted.
    //
    // Its replacement is stricter, not looser: `AttachmentRejectionCode` is a union of five
    // SPECIFIC codes from `validateAttachments`, so the reason recorded on the row says what
    // is actually wrong with the attachment. The detailed assertions live in
    // src/test/regression/email-attachments.test.ts.
    expect(SRC).toMatch(
      /type HoldCode =\s*\|?\s*'blocked_mailbox_unavailable'\s*\|\s*'mailbox_send_failed'\s*\|\s*AttachmentRejectionCode/,
    );
    expect(SRC).not.toContain("attachments_unsupported");
  });

  it("never increments retry_count for blocked_mailbox_unavailable", () => {
    // A missing mailbox is a configuration state, not a transient fault. Counting it would
    // walk the row into the retry ceiling and bury the real cause behind "max retries".
    expect(HOLD).toMatch(/const isTransient = code === 'mailbox_send_failed'/);
    expect(HOLD).toMatch(/\.\.\.\(isTransient \? \{ retry_count: priorRetries \+ 1 \} : \{\}\)/);
    // Exactly one assignment in the update payload, and it is the guarded one above.
    // (`HOLD` mentions retry_count elsewhere in its parameter type and its log line;
    // what must be unique is the WRITE.)
    expect([...QUEUE_UPDATE.matchAll(/retry_count:/g)].length).toBe(1);
    expect([...HOLD.matchAll(/retry_count: priorRetries/g)].length).toBe(1);
  });

  it("releases the claim and backs the row off instead of hammering", () => {
    expect(HOLD).toMatch(/claimed_at: null/);
    expect(HOLD).toMatch(/scheduled_at: new Date\(Date\.now\(\) \+ backoffMinutes \* 60 \* 1000\)/);
    expect(HOLD).toMatch(/HOLD_BACKOFF_NO_MAILBOX_MINUTES/);
    expect(SRC).toMatch(/HOLD_BACKOFF_MAX_MINUTES = \d+/);
  });

  it("logs the hold to email_send_log like the other failure paths", () => {
    expect(HOLD).toMatch(/from\('email_send_log'\)\.insert\(/);
    expect(HOLD).toMatch(/email_queue_id: queueRow\.id/);
    expect(HOLD).toMatch(/held: true/);
  });

  it("gives the user something actionable, not just a code", () => {
    expect(SRC).toMatch(/No active connected mailbox for this organisation/);
    expect(SRC).toMatch(/Connect Gmail or Outlook in Settings/);
    expect(SRC).toMatch(/never re-routed to another sender/);
  });

  it("holds — it does not fail, cancel or drop the message", () => {
    const routerAt = SRC.indexOf("if (isSystemEmail(queueRow.context)) {");
    const elseAt = SRC.indexOf("} else {", routerAt);
    const endAt = SRC.indexOf("if (!providerId) {", elseAt);
    const practiceBranch = SRC.slice(elseAt, endAt);
    expect(practiceBranch).not.toMatch(/status: '(failed|cancelled)'/);
    expect(practiceBranch).not.toMatch(/moveToDlq/);
  });
});

describe("Lovable is gone from the drainer", () => {
  it("imports nothing from Lovable and calls no Lovable sender", () => {
    expect(SRC).not.toMatch(/@lovable\.dev/);
    expect(SRC).not.toMatch(/sendLovableEmail/);
    expect(SRC).not.toMatch(/LOVABLE_/);
    // ...and no dead scaffolding left behind by that sender.
    expect(SRC).not.toMatch(/SENDER_DOMAIN/);
    expect(SRC).not.toMatch(/notify\.accountancyos\.com/);
  });

  it("leaves LOVABLE_* handling elsewhere in the repo alone", () => {
    // auth-email-hook is increment 3 of the plan (Standard Webhooks re-front). Removing
    // its verification early would leave an unauthenticated endpoint that injects into the
    // email queue — anyone could send branded mail from the domain.
    const hook = read("supabase/functions/auth-email-hook/index.ts");
    expect(hook).toMatch(/LOVABLE_API_KEY/);
    expect(hook).toMatch(/verifyWebhookRequest/);
  });
});

describe("the existing mechanics survive the rewrite", () => {
  it("keeps the atomic claim", () => {
    expect(SRC).toMatch(/claim_email_queue_row/);
    expect(SRC).toMatch(/p_stale_before: staleClaimBefore/);
  });

  it("keeps the duplicate-send idempotency guard", () => {
    expect(SRC).toMatch(/Skipping duplicate send \(already sent\)/);
    expect(SRC).toMatch(/idx?_?/); // presence-only; the guard is the query below
    expect(SRC).toMatch(/\.eq\('status', 'sent'\)/);
  });

  it("keeps the DLQ and retry budget", () => {
    expect(SRC).toMatch(/move_to_dlq/);
    expect(SRC).toMatch(/MAX_RETRIES/);
  });

  it("reads context and retry_count, which the claim RPC does not return", () => {
    // claim_email_queue_row's RETURNS TABLE has a fixed column list without `context` or
    // `retry_count`. Routing must not wait on a migration to change a live RPC's return
    // type, so the claimed values are overlaid on the selected row, which carries both.
    expect(SRC).toMatch(/\.select\(\s*\n?\s*'id, organization_id[^']*context[^']*retry_count[^']*'/);
    expect(SRC).toMatch(/const queueRow = \{ \.\.\.row, \.\.\.\(claimed as typeof row\) \}/);
  });
});

describe("attachments are never silently dropped on the practice path", () => {
  /**
   * REWRITTEN 2026-08-25, deliberately. The INVARIANT is unchanged and still the strongest
   * thing in this block: a practice email whose attachment cannot be carried correctly is
   * HELD, never delivered without it. What changed is what "cannot be carried" means.
   *
   * Before: neither gmail-send nor outlook-send accepted attachments at all, so EVERY row
   * carrying one was held under a single blanket code, `attachments_unsupported`. That was
   * always a stopgap — it meant no invoice email could ever go out.
   *
   * Now: both senders carry attachments, and `validateAttachments` decides per provider.
   * Well-formed attachments within the provider's limit are SENT; anything else is held with
   * a SPECIFIC code. That is a strictly finer-grained guarantee, not a weaker one — the byte
   * fidelity of what is sent is proven in src/test/regression/email-attachments.test.ts,
   * which decodes the emitted MIME and Graph payload and compares them to the source PDF.
   */
  it("holds a practice email whose attachments fail validation", () => {
    expect(SRC).toMatch(/validateAttachments\(queueRow\.attachments, mailbox\.provider\)/);
    expect(SRC).toMatch(/if \(!attachmentValidation\.ok\) \{/);
    expect(SRC).toMatch(/attachmentValidation\.code/);
    // Held, unsent — the message body says so, and no sender follows.
    expect(SRC).toContain("The message is held, unsent, rather than ");
    expect(SRC).toContain("delivered without its attachment.");
  });

  it("validates BEFORE sending, so a bad attachment cannot fall through to a send", () => {
    // The ordering that matters. (The check now runs AFTER resolvePracticeMailbox rather than
    // before it, because the limit is provider-specific — 25 MB for Gmail, 3 MB for a Graph
    // fileAttachment — and the provider is not known until the mailbox is resolved. A missing
    // mailbox still holds first, so nothing is sent in that case either.)
    const validateAt = SRC.indexOf("validateAttachments(queueRow.attachments");
    const resolveAt = SRC.indexOf("await resolvePracticeMailbox");
    const sendAt = SRC.indexOf("await sendViaPracticeMailbox");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(validateAt).toBeGreaterThan(resolveAt);
    expect(sendAt).toBeGreaterThan(validateAt);
  });

  it("treats every attachment failure as non-transient — no retry_count inflation", () => {
    // Only mailbox_send_failed is transient. A malformed or oversized attachment is a defect
    // in the enqueued payload, not a blip; inflating retry_count would trip retry limits and
    // mask the real cause. The test is a positive allow-list of the one transient code, so a
    // future hold code cannot join it by accident.
    expect(SRC).toMatch(/const isTransient = code === 'mailbox_send_failed'/);
    expect(SRC).not.toMatch(/isTransient[^\n]*attachment_/);
  });

  it("the mailbox senders now genuinely DO support attachments", () => {
    // The inverse of what this test used to assert. It previously pinned the ABSENCE of
    // attachment support, as the justification for the blanket hold; that support has now
    // landed, so it pins its presence instead — otherwise the drainer would be forwarding
    // attachments to functions that quietly ignore them, which is the silent drop the whole
    // block exists to prevent.
    const gmail = readFileSync(resolve(root, "supabase/functions/gmail-send/index.ts"), "utf8");
    const outlook = readFileSync(resolve(root, "supabase/functions/outlook-send/index.ts"), "utf8");
    expect(gmail).toMatch(/buildGmailMimeMessage/);
    expect(gmail).toMatch(/attachments\?: EmailAttachment\[\]/);
    expect(outlook).toMatch(/buildOutlookAttachments/);
    expect(outlook).toMatch(/attachments\?: EmailAttachment\[\]/);
    // ...and the drainer forwards what it holds, rather than dropping it at the boundary.
    expect(SRC).toMatch(/\.\.\.\(attachments\.length > 0 \? \{ attachments \} : \{\}\)/);
  });
});
