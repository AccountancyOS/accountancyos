import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  GMAIL_MAX_TOTAL_ATTACHMENT_BYTES,
  OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES,
  buildGmailMimeMessage,
  buildOutlookAttachments,
  decodeBase64,
  decodedByteLength,
  toGmailRawParam,
  validateAttachments,
  wrapBase64,
} from "../../../supabase/functions/_shared/attachments";

/**
 * ============================================================================
 * EMAIL ATTACHMENTS — the PDF must actually be in the message
 * ============================================================================
 *
 * `send-invoice` enqueues the invoice PDF on `email_queue.attachments`. All practice
 * correspondence routes through the accountant's connected mailbox, and until this increment
 * neither `gmail-send` nor `outlook-send` accepted attachments at all — so those rows were
 * blanket-HELD with `attachments_unsupported`.
 *
 * The bar the owner set for lifting that hold is deliberately high: these tests do NOT check
 * that "an attachments field exists". They build a known PDF, run it through the real
 * encoders, then DECODE what comes out and compare it byte-for-byte with what went in. An
 * encoder that silently truncated, re-encoded, or dropped the payload would pass a
 * field-presence test and fail these.
 *
 * That is only possible because `supabase/functions/_shared/attachments.ts` is pure — zero
 * imports, standard Web APIs only — so Vitest can import it directly rather than asserting
 * on the source text of a Deno function it cannot run.
 */

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

// ---------------------------------------------------------------------------
// A known PDF, built here so the test owns the ground truth
// ---------------------------------------------------------------------------

/**
 * `%PDF-1.4`, a findable marker, then all 256 byte values.
 *
 * The full byte range is the point: it contains NUL, CR, LF, the `=` and `+` and `/` that
 * base64 is sensitive to, and the high bytes that a UTF-8 round-trip would mangle. Any
 * encoder that treats the payload as text rather than bytes corrupts this and the byte
 * comparison catches it.
 */
function makeKnownPdfBytes(): Uint8Array {
  const enc = new TextEncoder();
  const header = enc.encode("%PDF-1.4\n%AOS-ATTACHMENT-MARKER\n");
  const allBytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) allBytes[i] = i;
  const trailer = enc.encode("\ntrailer\n%%EOF\n");

  const out = new Uint8Array(header.length + allBytes.length + trailer.length);
  out.set(header, 0);
  out.set(allBytes, header.length);
  out.set(trailer, header.length + allBytes.length);
  return out;
}

/** Bytes -> base64. Written here, independent of the module under test. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const PDF_BYTES = makeKnownPdfBytes();
const PDF_BASE64 = bytesToBase64(PDF_BYTES);
const PDF_FILENAME = "Invoice-INV-0042.pdf";

const PDF_ATTACHMENT = {
  filename: PDF_FILENAME,
  content: PDF_BASE64,
  contentType: "application/pdf",
};

const GMAIL_PARAMS = {
  from: "accountant@practice.co.uk",
  to: "client@example.com",
  subject: "Invoice INV-0042 from The Tax Network Group",
  html: "<p>Please find your invoice attached.</p>",
  text: "Please find your invoice attached.",
  attachments: [PDF_ATTACHMENT],
};

/** Split a multipart/mixed message into its parts, by its declared boundary. */
function mixedParts(mime: string): string[] {
  const match = mime.match(/Content-Type: multipart\/mixed; boundary="([^"]+)"/);
  expect(match, "message must declare a multipart/mixed boundary").not.toBeNull();
  const boundary = match![1];
  return mime.split(`--${boundary}`);
}

/** The part carrying a given attachment filename, split into headers and raw body. */
function attachmentPart(mime: string, filename: string): { headers: string; body: string } {
  const part = mixedParts(mime).find((p) => p.includes(`filename="${filename}"`));
  expect(part, `no part carrying filename="${filename}"`).toBeDefined();
  const separator = part!.indexOf("\r\n\r\n");
  expect(separator).toBeGreaterThan(-1);
  return {
    headers: part!.slice(0, separator),
    body: part!.slice(separator + 4).trim(),
  };
}

function expectSameBytes(actual: Uint8Array | null, expected: Uint8Array) {
  expect(actual).not.toBeNull();
  expect(actual!.length).toBe(expected.length);
  expect(Array.from(actual!)).toEqual(Array.from(expected));
}

// ===========================================================================
// Gmail MIME
// ===========================================================================

describe("Gmail MIME — the PDF is genuinely in the message", () => {
  const mime = buildGmailMimeMessage(GMAIL_PARAMS);

  it("is a multipart/mixed RFC 5322 message with the expected envelope headers", () => {
    expect(mime).toMatch(/^From: accountant@practice\.co\.uk\r\n/);
    expect(mime).toMatch(/\r\nTo: client@example\.com\r\n/);
    expect(mime).toMatch(/\r\nMIME-Version: 1\.0\r\n/);
    expect(mime).toMatch(/\r\nContent-Type: multipart\/mixed; boundary="[^"]+"\r\n/);
    // Headers are separated from the body by exactly one blank line.
    expect(mime).toMatch(/boundary="[^"]+"\r\n\r\n/);
    // ...and the message is properly terminated by the closing boundary.
    const boundary = mime.match(/multipart\/mixed; boundary="([^"]+)"/)![1];
    expect(mime.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it("wraps html and text in a multipart/alternative when both are present", () => {
    expect(mime).toMatch(/Content-Type: multipart\/alternative; boundary="[^"]+"/);
    expect(mime).toMatch(/Content-Type: text\/plain; charset="UTF-8"/);
    expect(mime).toMatch(/Content-Type: text\/html; charset="UTF-8"/);
  });

  it("emits no multipart/alternative when only one body is present", () => {
    const htmlOnly = buildGmailMimeMessage({ ...GMAIL_PARAMS, text: "" });
    expect(htmlOnly).not.toMatch(/multipart\/alternative/);
    expect(htmlOnly).toMatch(/Content-Type: text\/html; charset="UTF-8"/);
    // The attachment is still there — dropping the alternative must not drop the file.
    expect(htmlOnly).toContain(`filename="${PDF_FILENAME}"`);
  });

  it("gives the attachment part the required Content-Type, CTE and Content-Disposition", () => {
    const { headers } = attachmentPart(mime, PDF_FILENAME);
    expect(headers).toMatch(/Content-Type: application\/pdf; name="Invoice-INV-0042\.pdf"/);
    expect(headers).toMatch(/Content-Transfer-Encoding: base64/);
    expect(headers).toMatch(/Content-Disposition: attachment; filename="Invoice-INV-0042\.pdf"/);
  });

  it("DECODES BACK TO THE ORIGINAL PDF BYTES, exactly", () => {
    // The load-bearing assertion. Not "a field exists" — the actual file survives the encode.
    const { body } = attachmentPart(mime, PDF_FILENAME);
    expectSameBytes(decodeBase64(body), PDF_BYTES);
  });

  it("keeps the decoded payload a real PDF, marker and all", () => {
    const { body } = attachmentPart(mime, PDF_FILENAME);
    const decoded = decodeBase64(body)!;
    const asLatin1 = Array.from(decoded.subarray(0, 40))
      .map((b) => String.fromCharCode(b))
      .join("");
    expect(asLatin1.startsWith("%PDF-1.4")).toBe(true);
    expect(asLatin1).toContain("%AOS-ATTACHMENT-MARKER");
  });

  it("wraps the base64 payload at 76 characters, as RFC 2045 requires", () => {
    const { body } = attachmentPart(mime, PDF_FILENAME);
    const lines = body.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
    // All but the last line are full, i.e. it really is wrapped at 76 and not at random.
    for (const line of lines.slice(0, -1)) expect(line.length).toBe(76);
  });

  it("carries several attachments without confusing them", () => {
    const second = { filename: "Statement.txt", content: btoa("hello"), contentType: "text/plain" };
    const multi = buildGmailMimeMessage({
      ...GMAIL_PARAMS,
      attachments: [PDF_ATTACHMENT, second],
    });
    expectSameBytes(decodeBase64(attachmentPart(multi, PDF_FILENAME).body), PDF_BYTES);
    expectSameBytes(
      decodeBase64(attachmentPart(multi, "Statement.txt").body),
      new TextEncoder().encode("hello"),
    );
  });

  it("preserves cc, bcc and threading headers alongside attachments", () => {
    // These exist on the attachment-free path in gmail-send; adding attachments must not
    // quietly lose them.
    const threaded = buildGmailMimeMessage({
      ...GMAIL_PARAMS,
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      inReplyTo: "<abc@mail.gmail.com>",
    });
    expect(threaded).toMatch(/\r\nCc: cc@example\.com\r\n/);
    expect(threaded).toMatch(/\r\nBcc: bcc@example\.com\r\n/);
    expect(threaded).toMatch(/\r\nIn-Reply-To: <abc@mail\.gmail\.com>\r\n/);
    expect(threaded).toMatch(/\r\nReferences: <abc@mail\.gmail\.com>\r\n/);
  });

  it("RFC 2047-encodes a non-ASCII subject rather than emitting raw UTF-8 in a header", () => {
    const pounds = buildGmailMimeMessage({ ...GMAIL_PARAMS, subject: "Invoice for £1,250" });
    expect(pounds).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(pounds).not.toContain("Subject: Invoice for £1,250");
  });
});

describe("toGmailRawParam — the Gmail API `raw` field", () => {
  it("produces base64url with no +, / or = ", () => {
    // Gmail's `raw` field is base64url, unpadded. A stray '+' or '/' is silently mis-decoded
    // and the recipient gets a corrupt message.
    const raw = toGmailRawParam(buildGmailMimeMessage(GMAIL_PARAMS));
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw).not.toContain("=");
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("round-trips: decoding `raw` reproduces the MIME, whose attachment is still the PDF", () => {
    const mime = buildGmailMimeMessage(GMAIL_PARAMS);
    const raw = toGmailRawParam(mime);

    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decodedBytes = decodeBase64(padded + "=".repeat((4 - (padded.length % 4)) % 4))!;
    const decodedMime = new TextDecoder().decode(decodedBytes);

    expect(decodedMime).toBe(mime);
    expectSameBytes(decodeBase64(attachmentPart(decodedMime, PDF_FILENAME).body), PDF_BYTES);
  });
});

// ===========================================================================
// Outlook / Microsoft Graph
// ===========================================================================

describe("Outlook Graph payload — the PDF is genuinely in the message", () => {
  const graph = buildOutlookAttachments([PDF_ATTACHMENT]);

  it("is a Microsoft Graph fileAttachment with the right name and contentType", () => {
    expect(graph).toHaveLength(1);
    expect(graph[0]["@odata.type"]).toBe("#microsoft.graph.fileAttachment");
    expect(graph[0].name).toBe(PDF_FILENAME);
    expect(graph[0].contentType).toBe("application/pdf");
  });

  it("DECODES contentBytes BACK TO THE ORIGINAL PDF BYTES, exactly", () => {
    expectSameBytes(decodeBase64(graph[0].contentBytes), PDF_BYTES);
  });

  it("emits contentBytes unwrapped — Graph rejects embedded newlines", () => {
    expect(graph[0].contentBytes).not.toMatch(/[\r\n\s]/);
    // ...even when the producer handed us a wrapped payload.
    const wrapped = buildOutlookAttachments([{ ...PDF_ATTACHMENT, content: wrapBase64(PDF_BASE64) }]);
    expect(wrapped[0].contentBytes).not.toMatch(/[\r\n\s]/);
    expectSameBytes(decodeBase64(wrapped[0].contentBytes), PDF_BYTES);
  });

  it("returns an empty list for no attachments, never a placeholder", () => {
    expect(buildOutlookAttachments(null)).toEqual([]);
    expect(buildOutlookAttachments(undefined)).toEqual([]);
    expect(buildOutlookAttachments([])).toEqual([]);
  });
});

// ===========================================================================
// Validation — one test per rejection code
// ===========================================================================

describe("validateAttachments — every refusal has its own code", () => {
  const ok = (a: unknown) => validateAttachments(a, "gmail");
  const codeOf = (result: ReturnType<typeof ok>) => (result.ok ? null : result.code);

  it("accepts no attachments at all", () => {
    expect(ok(null)).toEqual({ ok: true });
    expect(ok(undefined)).toEqual({ ok: true });
    expect(ok([])).toEqual({ ok: true });
  });

  it("accepts the real invoice attachment", () => {
    expect(ok([PDF_ATTACHMENT])).toEqual({ ok: true });
    expect(validateAttachments([PDF_ATTACHMENT], "outlook")).toEqual({ ok: true });
  });

  describe("attachment_invalid_filename", () => {
    const cases: Array<[string, unknown]> = [
      ["empty", ""],
      ["whitespace only", "   "],
      ["missing", undefined],
      ["not a string", 42],
      ["forward-slash path separator", "invoices/Invoice.pdf"],
      ["backslash path separator", "invoices\\Invoice.pdf"],
      ["path traversal", "..Invoice.pdf"],
      ["parent traversal", "....pdf"],
      ["control character", "Invoice .pdf"],
      ["CRLF header injection", "Invoice.pdf\r\nBcc: attacker@example.com"],
      ["double quote", 'Invoice".pdf'],
      ["over 255 characters", `${"a".repeat(256)}.pdf`],
    ];

    for (const [label, filename] of cases) {
      it(`rejects a filename that is ${label}`, () => {
        expect(codeOf(ok([{ ...PDF_ATTACHMENT, filename }]))).toBe("attachment_invalid_filename");
      });
    }

    it("accepts a filename of exactly 255 characters", () => {
      expect(ok([{ ...PDF_ATTACHMENT, filename: "a".repeat(255) }])).toEqual({ ok: true });
    });
  });

  describe("attachment_invalid_base64", () => {
    const cases: Array<[string, unknown]> = [
      ["missing", undefined],
      ["null", null],
      ["not a string", 12345],
      ["an empty string", ""],
      ["not base64 at all", "this is not base64!!!"],
      ["a bad length", "QUJDR"],
      ["padding in the middle", "QU==JD=="],
      ["outside the base64 alphabet", "QUJ*"],
      ["decoding to zero bytes", "===="],
    ];

    for (const [label, content] of cases) {
      it(`rejects content that is ${label}`, () => {
        expect(codeOf(ok([{ ...PDF_ATTACHMENT, content }]))).toBe("attachment_invalid_base64");
      });
    }

    it("tolerates a line-wrapped payload, because that is still valid base64", () => {
      expect(ok([{ ...PDF_ATTACHMENT, content: wrapBase64(PDF_BASE64) }])).toEqual({ ok: true });
    });
  });

  describe("attachment_unsupported_type", () => {
    const cases: Array<[string, unknown]> = [
      ["missing", undefined],
      ["empty", ""],
      ["not a string", 7],
      ["has no subtype", "application"],
      ["has no type", "/pdf"],
      ["is just a word", "pdf"],
      ["has a stray space", "application/ pdf"],
      ["contains CRLF", "application/pdf\r\nX-Evil: 1"],
    ];

    for (const [label, contentType] of cases) {
      it(`rejects a contentType that ${label}`, () => {
        expect(codeOf(ok([{ ...PDF_ATTACHMENT, contentType }]))).toBe(
          "attachment_unsupported_type",
        );
      });
    }

    it("is NOT an allowlist — any well-formed type/subtype is accepted", () => {
      for (const contentType of [
        "application/pdf",
        "text/csv",
        "image/png",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/x-something-nobody-has-heard-of",
        "application/pdf; charset=binary",
      ]) {
        expect(ok([{ ...PDF_ATTACHMENT, contentType }]), contentType).toEqual({ ok: true });
      }
    });
  });

  describe("attachment_invalid_payload", () => {
    // A 5th code, beyond the four the brief names, for a malformed CONTAINER rather than a
    // malformed attachment. The drainer previously did `Array.isArray(x) ? x.length : 0`, so
    // a non-array `attachments` value counted as "no attachments" and was sent without it —
    // a silent drop. It is now a refusal.
    it("rejects an attachments value that is not an array", () => {
      expect(codeOf(ok({ filename: "x" }))).toBe("attachment_invalid_payload");
      expect(codeOf(ok("Invoice.pdf"))).toBe("attachment_invalid_payload");
    });

    it("rejects an element that is not an object", () => {
      expect(codeOf(ok(["Invoice.pdf"]))).toBe("attachment_invalid_payload");
      expect(codeOf(ok([null]))).toBe("attachment_invalid_payload");
      expect(codeOf(ok([["Invoice.pdf"]]))).toBe("attachment_invalid_payload");
    });
  });
});

// ===========================================================================
// Size limits — on DECODED bytes
// ===========================================================================

describe("attachment_too_large — provider limits on decoded bytes", () => {
  /** A base64 payload decoding to exactly `3 * groups` bytes. "QUJD" decodes to "ABC". */
  const payloadOfGroups = (groups: number) => "QUJD".repeat(groups);

  const attachmentOfGroups = (groups: number) => [
    { filename: "big.pdf", content: payloadOfGroups(groups), contentType: "application/pdf" },
  ];

  it("states the limits: Gmail 25 MB, Outlook simple fileAttachment 3 MB", () => {
    expect(GMAIL_MAX_TOTAL_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
    expect(OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES).toBe(3 * 1024 * 1024);
  });

  it("measures DECODED bytes, not the inflated base64 length", () => {
    // 4 base64 characters carry 3 bytes. Measuring the string length would overstate by 4/3
    // and refuse messages that are actually within the limit.
    expect(decodedByteLength(payloadOfGroups(1))).toBe(3);
    expect(decodedByteLength(payloadOfGroups(1000))).toBe(3000);
    expect(decodedByteLength(PDF_BASE64)).toBe(PDF_BYTES.length);
  });

  describe("outlook: 3 MB", () => {
    const underGroups = Math.floor(OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES / 3); // 1_048_576 -> 3_145_728 bytes

    it("passes just under the limit", () => {
      const groups = underGroups;
      expect(groups * 3).toBeLessThanOrEqual(OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES);
      expect(validateAttachments(attachmentOfGroups(groups), "outlook")).toEqual({ ok: true });
    });

    it("rejects just over the limit with attachment_too_large", () => {
      const groups = underGroups + 1;
      expect(groups * 3).toBeGreaterThan(OUTLOOK_MAX_TOTAL_ATTACHMENT_BYTES);
      const result = validateAttachments(attachmentOfGroups(groups), "outlook");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe("attachment_too_large");
      // The message must say WHY, because an upload session is the fix and it is not built.
      expect(result.ok === false && result.message).toMatch(/upload session/i);
    });

    it("sums across attachments rather than checking each in isolation", () => {
      const half = Math.floor(underGroups / 2) + 1;
      const two = [...attachmentOfGroups(half), ...attachmentOfGroups(half)];
      const result = validateAttachments(two, "outlook");
      expect(result.ok === false && result.code).toBe("attachment_too_large");
    });
  });

  describe("gmail: 25 MB", () => {
    const underGroups = Math.floor(GMAIL_MAX_TOTAL_ATTACHMENT_BYTES / 3); // 8_738_133 -> 26_214_399 bytes

    it("passes just under the limit", () => {
      const groups = underGroups;
      expect(groups * 3).toBeLessThanOrEqual(GMAIL_MAX_TOTAL_ATTACHMENT_BYTES);
      expect(validateAttachments(attachmentOfGroups(groups), "gmail")).toEqual({ ok: true });
    });

    it("rejects just over the limit with attachment_too_large", () => {
      const groups = underGroups + 1;
      expect(groups * 3).toBeGreaterThan(GMAIL_MAX_TOTAL_ATTACHMENT_BYTES);
      const result = validateAttachments(attachmentOfGroups(groups), "gmail");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe("attachment_too_large");
    });

    it("is a genuinely different ceiling from Outlook's", () => {
      // A 4 MB attachment is fine for Gmail and impossible for a Graph fileAttachment. If the
      // limits were ever collapsed into one number, this fails.
      const groups = Math.floor((4 * 1024 * 1024) / 3);
      expect(validateAttachments(attachmentOfGroups(groups), "gmail")).toEqual({ ok: true });
      const outlook = validateAttachments(attachmentOfGroups(groups), "outlook");
      expect(outlook.ok === false && outlook.code).toBe("attachment_too_large");
    });
  });
});

// ===========================================================================
// Purity — the property that makes every assertion above possible
// ===========================================================================

describe("_shared/attachments.ts stays importable outside Deno", () => {
  it("has no imports at all", () => {
    // Asserted on CODE, not prose — the file's own header comment explains that it must run
    // outside Deno, and would otherwise trip the `Deno.` check.
    const SRC = read("supabase/functions/_shared/attachments.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(SRC).not.toMatch(/^\s*import\s/m);
    expect(SRC).not.toMatch(/\bfrom\s+["'](npm:|jsr:|https:|node:)/);
    expect(SRC).not.toMatch(/\bDeno\./);
    // The whole file really is just this module — if the import ever returns undefined for
    // one of these, the byte-fidelity assertions above would vacuously pass.
    for (const fn of [buildGmailMimeMessage, buildOutlookAttachments, toGmailRawParam, validateAttachments]) {
      expect(typeof fn).toBe("function");
    }
  });
});

// ===========================================================================
// Wiring — the edge functions actually use it
// ===========================================================================

describe("gmail-send carries attachments", () => {
  const SRC = read("supabase/functions/gmail-send/index.ts");

  it("imports the shared, tested builders rather than rolling its own", () => {
    expect(SRC).toMatch(/from ["']\.\.\/_shared\/attachments\.ts["']/);
    expect(SRC).toMatch(/buildGmailMimeMessage/);
    expect(SRC).toMatch(/toGmailRawParam/);
    expect(SRC).toMatch(/validateAttachments/);
  });

  it("accepts attachments on the request body", () => {
    expect(SRC).toMatch(/attachments\?: EmailAttachment\[\]/);
  });

  it("validates for 'gmail' before it does any network work", () => {
    // Ordering is measured inside the request handler, not against the helper definitions
    // above it (refreshAccessToken is declared before serve() but only CALLED after).
    const handlerAt = SRC.indexOf("serve(async (req: Request)");
    const handler = SRC.slice(handlerAt);
    const validateAt = handler.indexOf("validateAttachments(body.attachments, 'gmail')");
    const refreshAt = handler.indexOf("await refreshAccessToken(");
    const sendAt = handler.indexOf("const sendResponse = await fetch(sendUrl");
    expect(validateAt).toBeGreaterThan(-1);
    expect(refreshAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(refreshAt);
    expect(validateAt).toBeLessThan(sendAt);
    // Rejection fails the request; it never continues without the attachment.
    expect(SRC).toMatch(/if \(!validation\.ok\) \{[\s\S]{0,200}status: 400/);
  });

  it("sends the built MIME through the Gmail `raw` field", () => {
    expect(SRC).toMatch(/raw: rawParam/);
    expect(SRC).toMatch(/hasAttachments\s*\n?\s*\?\s*toGmailRawParam\(/);
  });

  it("leaves the attachment-free path on the original builder, untouched", () => {
    // Preserving existing behaviour matters more than tidiness here: every quote, proposal
    // and engagement letter goes down this path today.
    expect(SRC).toMatch(/:\s*base64UrlEncode\(\s*\n?\s*createRawEmail\(/);
    expect(SRC).toMatch(/function createRawEmail\(/);
    // Threading, labels and the return shape survive.
    expect(SRC).toMatch(/sendBody\.threadId = body\.thread_id/);
    expect(SRC).toMatch(/labels: \['SENT'\]/);
    expect(SRC).toMatch(/message_id: sentMessage\.id/);
    expect(SRC).toMatch(/thread_id: sentMessage\.threadId/);
  });
});

describe("outlook-send carries attachments", () => {
  const SRC = read("supabase/functions/outlook-send/index.ts");

  it("imports the shared, tested builder", () => {
    expect(SRC).toMatch(/from ["']\.\.\/_shared\/attachments\.ts["']/);
    expect(SRC).toMatch(/buildOutlookAttachments/);
  });

  it("validates for 'outlook', not for 'gmail'", () => {
    // The 3 MB Graph ceiling is eight times lower than Gmail's. Validating against the wrong
    // provider would let an oversized message through to a Graph call that rejects it.
    expect(SRC).toMatch(/validateAttachments\(attachments, 'outlook'\)/);
    expect(SRC).not.toMatch(/validateAttachments\([^)]*'gmail'\)/);
  });

  it("puts them on the Graph message as `attachments`", () => {
    expect(SRC).toMatch(/attachments: buildOutlookAttachments\(attachments\)/);
    // Only when there is something to attach — an attachment-free send is unchanged.
    expect(SRC).toMatch(/\.\.\.\(hasAttachments && \{ attachments: buildOutlookAttachments/);
  });

  it("keeps the existing Graph call and return shape", () => {
    expect(SRC).toMatch(/https:\/\/graph\.microsoft\.com\/v1\.0\/me\/sendMail/);
    expect(SRC).toMatch(/saveToSentItems: true/);
    expect(SRC).toMatch(/message: 'Email sent successfully'/);
  });
});

describe("process-email-queue forwards attachments and holds specifically", () => {
  const SRC = read("supabase/functions/process-email-queue/index.ts");

  it("forwards queueRow.attachments to the mailbox function", () => {
    // The whole point: gmail-send/outlook-send can now carry the PDF, so it must be given it.
    expect(SRC).toMatch(/const attachments = Array\.isArray\(queueRow\.attachments\)/);
    expect(SRC).toMatch(/\.\.\.\(attachments\.length > 0 \? \{ attachments \} : \{\}\)/);
    // Inside the mailbox sender, on the invoke body.
    const start = SRC.indexOf("async function sendViaPracticeMailbox(");
    const end = SRC.indexOf("\n}\n", start);
    const body = SRC.slice(start, end);
    expect(body).toMatch(/functions\.invoke\(fnName, \{/);
    expect(body).toMatch(/attachments/);
  });

  it("has no blanket attachments_unsupported guard left", () => {
    // REMOVED DELIBERATELY. It existed only because neither mailbox sender accepted
    // attachments; both now do, so a blanket refusal would hold mail that is perfectly
    // sendable — the invoice email would never leave, which is the bug it was guarding
    // against, inverted.
    expect(SRC).not.toContain("attachments_unsupported");
    expect(SRC).not.toMatch(/attachmentCount/);
  });

  it("holds with the SPECIFIC code that validation returned", () => {
    expect(SRC).toMatch(/validateAttachments\(queueRow\.attachments, mailbox\.provider\)/);
    expect(SRC).toMatch(/attachmentValidation\.code/);
    expect(SRC).toMatch(/holdEmailQueueRow\(\s*\n\s*supabase,\s*\n\s*queueRow,\s*\n\s*messageId,\s*\n\s*attachmentValidation\.code/);
  });

  it("validates against the RESOLVED provider, so it must come after mailbox resolution", () => {
    // Ordering changed on purpose. The old blanket guard ran BEFORE resolvePracticeMailbox
    // because it needed nothing; the new one is provider-specific (25 MB vs 3 MB) and cannot
    // run until the mailbox is known. A missing mailbox still holds first, so nothing is sent.
    const resolveAt = SRC.indexOf("await resolvePracticeMailbox");
    const validateAt = SRC.indexOf("validateAttachments(queueRow.attachments");
    const sendAt = SRC.indexOf("await sendViaPracticeMailbox");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(validateAt).toBeGreaterThan(resolveAt);
    expect(sendAt).toBeGreaterThan(validateAt);
  });

  it("makes every attachment hold code NON-transient", () => {
    // Only mailbox_send_failed increments retry_count. A malformed or oversized attachment is
    // a defect in the enqueued payload, not a blip; inflating retry_count would walk the row
    // into the retry ceiling and bury the real reason behind "max retries exceeded".
    expect(SRC).toMatch(/const isTransient = code === 'mailbox_send_failed'/);
    expect(SRC).not.toMatch(/isTransient[^\n]*attachment_/);
    expect(SRC).toMatch(/\.\.\.\(isTransient \? \{ retry_count: priorRetries \+ 1 \} : \{\}\)/);
  });

  it("extends the HoldCode union with the validation codes", () => {
    expect(SRC).toMatch(
      /type HoldCode =\s*\|?\s*'blocked_mailbox_unavailable'\s*\|\s*'mailbox_send_failed'\s*\|\s*AttachmentRejectionCode/,
    );
    expect(SRC).toMatch(/import \{[\s\S]*AttachmentRejectionCode[\s\S]*\} from '\.\.\/_shared\/attachments\.ts'/);
  });

  it("still holds rather than fails, cancels or re-routes", () => {
    const routerAt = SRC.indexOf("if (isSystemEmail(queueRow.context)) {");
    const elseAt = SRC.indexOf("} else {", routerAt);
    const endAt = SRC.indexOf("if (!providerId) {", elseAt);
    const practiceBranch = SRC.slice(elseAt, endAt);
    expect(practiceBranch).not.toMatch(/status: '(failed|cancelled)'/);
    expect(practiceBranch).not.toMatch(/moveToDlq/);
    // Three hold sites: no mailbox, invalid attachment, mailbox send failed.
    expect([...practiceBranch.matchAll(/holdEmailQueueRow\(/g)].length).toBe(3);
  });
});
