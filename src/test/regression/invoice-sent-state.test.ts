import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ============================================================================
 * INVOICE SENT-STATE — enqueuing is not sending
 * ============================================================================
 *
 * The defect being pinned: `send-invoice` stamped `invoices.sent_at` immediately after
 * upserting the row into `email_queue`:
 *
 *     await svc.from("invoices").update({ sent_at: ... }).eq("id", invoice_id);
 *
 * That is a claim about the provider made before the provider has been asked. The invoice
 * read as sent while its email was still queued — or held, or failed. With attachment
 * validation and the practice-mailbox hold in place, an invoice carrying a PDF could sit held
 * indefinitely and still record a send time.
 *
 * The rule now: `invoices.sent_at` is stamped in `process-email-queue`, on the success path
 * only, once the provider acknowledged with a message id and the queue row was marked `sent`.
 *
 * Source-level contract tests, in the style of this directory: both are Deno edge functions
 * that Vitest cannot execute, so the invariants are asserted against their source text.
 */

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const SEND_INVOICE = read("supabase/functions/send-invoice/index.ts");
const DRAINER = read("supabase/functions/process-email-queue/index.ts");

describe("send-invoice no longer claims a send it has not made", () => {
  it("does not write invoices.sent_at at all", () => {
    // The exact shape of the removed defect, and the general case.
    expect(SEND_INVOICE).not.toMatch(
      /from\(["']invoices["']\)\s*\.update\(\{\s*sent_at/,
    );
    expect(SEND_INVOICE).not.toMatch(/sent_at:\s*new Date\(\)\.toISOString\(\)/);
  });

  it("still enqueues, and still carries the routing keys the drainer stamps on", () => {
    // Removing the write must not remove the link between the email and the invoice —
    // otherwise nothing could ever stamp it.
    expect(SEND_INVOICE).toMatch(/entity_type: "invoice"/);
    expect(SEND_INVOICE).toMatch(/entity_id: invoice_id/);
    expect(SEND_INVOICE).toMatch(/context: "invoice"/);
    expect(SEND_INVOICE).toMatch(/from\("email_queue"\)\.upsert\(/);
  });

  it("still attaches the PDF, so there is something for the mailbox sender to carry", () => {
    expect(SEND_INVOICE).toMatch(/attachments: \[\{/);
    expect(SEND_INVOICE).toMatch(/content: pdfJson\.pdf_base64/);
    expect(SEND_INVOICE).toMatch(/contentType: "application\/pdf"/);
  });

  it("keeps the signed download link in the body — the deliberate secondary route", () => {
    // If an attachment is ever refused, the link is how the client still gets the invoice.
    expect(SEND_INVOICE).toMatch(/createSignedUrl\(path, 60 \* 60 \* 24 \* 90\)/);
    expect(SEND_INVOICE).toMatch(/href="\$\{link\}"/);
    expect(SEND_INVOICE).toMatch(/View \/ Download Invoice \(PDF\)/);
  });

  it("keeps the idempotency key that dedups a double-click", () => {
    expect(SEND_INVOICE).toMatch(/const idempotencyKey = `invoice-send:\$\{invoice_id\}/);
    expect(SEND_INVOICE).toMatch(/onConflict: "idempotency_key", ignoreDuplicates: true/);
  });
});

describe("process-email-queue stamps invoices.sent_at, and only on success", () => {
  /** The email_queue drain block, from the queue-row select to the end of the function. */
  const DRAIN = DRAINER.slice(DRAINER.indexOf("let emailQueueProcessed = 0"));

  const STAMP_AT = DRAINER.indexOf("if (queueRow.entity_type === 'invoice' && queueRow.entity_id)");

  it("stamps it at all", () => {
    expect(STAMP_AT).toBeGreaterThan(-1);
    expect(DRAINER).toMatch(/\.from\('invoices'\)\s*\n?\s*\.update\(\{ sent_at: new Date\(\)\.toISOString\(\) \}\)/);
  });

  it("only for entity_type === 'invoice' with an entity_id present", () => {
    expect(DRAINER).toMatch(
      /if \(queueRow\.entity_type === 'invoice' && queueRow\.entity_id\) \{/,
    );
    // ...and it targets that entity, not the queue row.
    const stamp = DRAINER.slice(STAMP_AT, STAMP_AT + 600);
    expect(stamp).toMatch(/\.eq\('id', queueRow\.entity_id\)/);
    expect(stamp).not.toMatch(/\.eq\('id', queueRow\.id\)/);
  });

  it("reads entity_type and entity_id off the queue row, which the claim RPC does not return", () => {
    // claim_email_queue_row's RETURNS TABLE is a fixed column list without entity_type or
    // entity_id, so they must come from the SELECT and survive the overlay.
    expect(DRAINER).toMatch(/\.select\(\s*\n?\s*'id, organization_id[^']*entity_type, entity_id'/);
    expect(DRAINER).toMatch(/const queueRow = \{ \.\.\.row, \.\.\.\(claimed as typeof row\) \}/);
  });

  it("only when currently NULL, so a resend cannot overwrite the original send time", () => {
    const stamp = DRAINER.slice(STAMP_AT, STAMP_AT + 600);
    expect(stamp).toMatch(/\.is\('sent_at', null\)/);
  });

  it("sits on the SUCCESS path — after the provider ack and after the row is marked sent", () => {
    // Ordering is the whole point. `providerId` is proven non-empty by the guard above, and
    // the queue row has already been flipped to 'sent'.
    const noAckGuard = DRAINER.indexOf("if (!providerId) {");
    const markSent = DRAINER.indexOf("status: 'sent',\n              sent_at:");
    expect(noAckGuard).toBeGreaterThan(-1);
    expect(markSent).toBeGreaterThan(noAckGuard);
    expect(STAMP_AT).toBeGreaterThan(markSent);
  });

  it("is unreachable for a held row — every hold `continue`s before it", () => {
    const routerAt = DRAINER.indexOf("if (isSystemEmail(queueRow.context)) {");
    const elseAt = DRAINER.indexOf("} else {", routerAt);
    const practiceBranch = DRAINER.slice(elseAt, DRAINER.indexOf("if (!providerId) {", elseAt));

    const holds = [...practiceBranch.matchAll(/holdEmailQueueRow\(/g)];
    expect(holds.length).toBe(3); // no mailbox, invalid attachment, mailbox send failed
    // Each hold is followed by a `continue`, so control never reaches the stamp.
    expect([...practiceBranch.matchAll(/emailQueueHeld\+\+\s*\n\s*continue/g)].length).toBe(3);
    // The whole practice branch ends before the stamp, which lives after the success writes.
    expect(elseAt).toBeLessThan(STAMP_AT);
    expect(practiceBranch).not.toContain("entity_type === 'invoice'");
  });

  it("is unreachable for a failed row — the failure path returns/continues before it", () => {
    // provider_no_ack marks the row failed and `continue`s.
    const noAckGuard = DRAINER.indexOf("if (!providerId) {");
    const noAckBlock = DRAINER.slice(noAckGuard, STAMP_AT);
    expect(noAckBlock).toMatch(/last_error_code: 'provider_no_ack'/);
    expect(noAckBlock).toMatch(/emailQueueFailed\+\+\s*\n\s*continue/);
    // The catch block that marks send failures is AFTER the stamp, so a throw skips it.
    const catchAt = DRAINER.indexOf("console.error('email_queue send failed'", STAMP_AT);
    expect(catchAt).toBeGreaterThan(STAMP_AT);
  });

  it("never fails the email send because the invoice could not be stamped", () => {
    // The email genuinely went out. Throwing here would drive a retry and send the client a
    // second copy — strictly worse than an unstamped column.
    const stamp = DRAINER.slice(STAMP_AT, STAMP_AT + 900);
    expect(stamp).toMatch(/if \(invoiceError\) \{/);
    expect(stamp).toMatch(/console\.error\('email_queue: invoice sent_at not stamped'/);
    expect(stamp).not.toMatch(/throw /);
    expect(stamp).not.toMatch(/emailQueueFailed\+\+/);
  });

  it("stamps exactly once, from exactly one place", () => {
    // A second writer is how a resend would start overwriting the original send time again.
    expect([...DRAINER.matchAll(/from\('invoices'\)/g)].length).toBe(1);
  });
});

describe("nothing else writes invoices.sent_at", () => {
  /**
   * Verified across the repo on 2026-08-25:
   *  - the column is created once (20251205112122_…sql) and never written by any migration,
   *    RPC, trigger or view — `issue_invoice_safe` and `void_invoice_safe` do not touch it;
   *  - no RLS policy or view predicates on it;
   *  - no component reads it: the Sales list derives its badge from `invoices.status`, and
   *    the two `select("*")` call sites never reference the field.
   *
   * So `process-email-queue` is the single writer. This test guards that, cheaply, by
   * checking no other edge function writes it.
   */
  const FUNCTIONS_WITH_SENT_AT = [
    "supabase/functions/send-engagement-letter/index.ts",
    "supabase/functions/gmail-send/index.ts",
    "supabase/functions/outlook-send/index.ts",
    "supabase/functions/gmail-sync/index.ts",
    "supabase/functions/outlook-sync/index.ts",
    "supabase/functions/chaser-tick/index.ts",
    "supabase/functions/send-invoice/index.ts",
  ];

  it("no other edge function updates the invoices table's sent_at", () => {
    for (const path of FUNCTIONS_WITH_SENT_AT) {
      const src = read(path);
      expect(src, path).not.toMatch(/from\(["']invoices["']\)[\s\S]{0,120}sent_at/);
    }
  });
});
