import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  invoiceSendKey,
  engagementLetterKey,
  chaserKey,
  utcDateStamp,
} from "@/lib/email-idempotency";

/**
 * FUN-4 / Fix 10 — email-queue idempotency.
 *
 * These tests pin the deterministic key contract (so a duplicate producer call dedups but
 * genuinely separate events do not) and verify queueEmail routes through an ON CONFLICT DO
 * NOTHING upsert only when a key is supplied. They do not exercise the DB; the unique index and
 * the worker's atomic claim are asserted here at the contract level and verified live on deploy.
 */

describe("email idempotency keys (Fix 10)", () => {
  it("utcDateStamp matches the edge-function `toISOString().slice(0,10)` format", () => {
    expect(utcDateStamp(new Date("2026-07-06T09:30:00.000Z"))).toBe("2026-07-06");
    // Late-UTC time on the same date still buckets to that date.
    expect(utcDateStamp(new Date("2026-07-06T23:59:59.000Z"))).toBe("2026-07-06");
  });

  it("duplicate producer call for the same invoice + day yields the SAME key (deduped)", () => {
    const a = invoiceSendKey("inv-1", new Date("2026-07-06T09:00:00Z"));
    const b = invoiceSendKey("inv-1", new Date("2026-07-06T09:00:01Z")); // double-click 1s later
    expect(a).toBe(b);
    expect(a).toBe("invoice-send:inv-1:2026-07-06");
  });

  it("deliberate resend on a later day yields a DIFFERENT key (allowed)", () => {
    const day1 = invoiceSendKey("inv-1", new Date("2026-07-06T09:00:00Z"));
    const day2 = invoiceSendKey("inv-1", new Date("2026-07-07T09:00:00Z"));
    expect(day1).not.toBe(day2);
  });

  it("different invoices never collide", () => {
    const at = new Date("2026-07-06T09:00:00Z");
    expect(invoiceSendKey("inv-1", at)).not.toBe(invoiceSendKey("inv-2", at));
  });

  it("engagement-letter keys follow the same date-bucketed rule", () => {
    expect(engagementLetterKey("el-9", new Date("2026-07-06T10:00:00Z"))).toBe(
      "engagement-letter:el-9:2026-07-06",
    );
    expect(engagementLetterKey("el-9", new Date("2026-07-06T10:00:00Z"))).toBe(
      engagementLetterKey("el-9", new Date("2026-07-06T18:00:00Z")),
    );
  });

  it("separate scheduled chasers (distinct next_send_at) are DISTINCT events, not deduped", () => {
    const first = chaserKey("org-1", "run-1", "2026-07-06T09:00:00Z");
    const second = chaserKey("org-1", "run-1", "2026-07-13T09:00:00Z"); // next weekly chase
    expect(first).not.toBe(second);
  });

  it("a retried chaser tick for the SAME occurrence yields the SAME key (deduped)", () => {
    const k1 = chaserKey("org-1", "run-1", "2026-07-06T09:00:00Z");
    const k2 = chaserKey("org-1", "run-1", "2026-07-06T09:00:00Z");
    expect(k1).toBe(k2);
    expect(k1).toBe("chaser:org-1:run-1:2026-07-06T09:00:00Z");
  });
});

describe("queueEmail idempotency routing (Fix 10)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function mockSupabase() {
    const single = vi.fn().mockResolvedValue({ data: { id: "row-1" }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null }); // deduped
    const selectInsert = vi.fn(() => ({ single }));
    const selectUpsert = vi.fn(() => ({ maybeSingle }));
    const insert = vi.fn(() => ({ select: selectInsert }));
    const upsert = vi.fn(() => ({ select: selectUpsert }));
    const from = vi.fn(() => ({ insert, upsert }));
    return { client: { from }, insert, upsert };
  }

  it("uses upsert(onConflict, ignoreDuplicates) when an idempotency key is provided", async () => {
    const { client, insert, upsert } = mockSupabase();
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: client }));
    const { queueEmail } = await import("@/lib/email-service");

    const res = await queueEmail({
      organizationId: "org-1",
      toEmail: "c@example.com",
      subject: "Hi",
      bodyHtml: "<p>Hi</p>",
      idempotencyKey: "invoice-send:inv-1:2026-07-06",
    });

    expect(res.success).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
    const [payload, opts] = (upsert.mock.calls[0] as unknown) as [Record<string, unknown>, unknown];
    expect(payload.idempotency_key).toBe("invoice-send:inv-1:2026-07-06");
    expect(opts).toEqual({ onConflict: "idempotency_key", ignoreDuplicates: true });
  });

  it("falls back to a plain insert (no dedup) when no key is provided", async () => {
    const { client, insert, upsert } = mockSupabase();
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: client }));
    const { queueEmail } = await import("@/lib/email-service");

    const res = await queueEmail({
      organizationId: "org-1",
      toEmail: "c@example.com",
      subject: "Hi",
      bodyHtml: "<p>Hi</p>",
    });

    expect(res.success).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });
});
