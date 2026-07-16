import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  vatSubmitIdempotencyKey,
  reconciliationCheckRequired,
} from "@/lib/vat-submit-idempotency";

/**
 * T1-4 regression: hmrc-vat-submit must be able to detect a duplicate VAT submission on BOTH the
 * filingId path and the snapshotId path (the one the UI actually calls), and must not let a client
 * switch off the reconciliation gate in production.
 */

const SNAPSHOT = {
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  snapshot_hash: "abc123",
};

describe("vatSubmitIdempotencyKey", () => {
  it("is identical for the same snapshot regardless of the correlation id", () => {
    const a = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: SNAPSHOT,
      correlationId: "VAT-111-aaa",
    });
    const b = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: SNAPSHOT,
      correlationId: "VAT-222-bbb",
    });

    // A double-click generates a fresh correlation id each time; the key must still collide so the
    // duplicate is caught rather than POSTed to HMRC twice.
    expect(a.key).toBe(b.key);
    expect(a.deterministic).toBe(true);
  });

  it("preserves the existing key format so already-stored keys still match", () => {
    const { key } = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: SNAPSHOT,
      correlationId: "VAT-111-aaa",
    });

    expect(key).toBe("org-1::HMRC::VAT::co-1::2026-01-01::2026-03-31::abc123");
  });

  it("falls back to 'org' when there is no company, matching the existing format", () => {
    const { key } = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: null,
      snapshot: SNAPSHOT,
      correlationId: "VAT-111-aaa",
    });

    expect(key).toBe("org-1::HMRC::VAT::org::2026-01-01::2026-03-31::abc123");
  });

  it("changes when the snapshot content changes", () => {
    const a = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: SNAPSHOT,
      correlationId: "VAT-111-aaa",
    });
    const b = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: { ...SNAPSHOT, snapshot_hash: "different" },
      correlationId: "VAT-111-aaa",
    });

    // A genuinely amended return must be submittable, so a different snapshot must not collide.
    expect(a.key).not.toBe(b.key);
  });

  it("is not deterministic without a snapshot, so no duplicate check can be claimed", () => {
    const a = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: null,
      correlationId: "VAT-111-aaa",
    });
    const b = vatSubmitIdempotencyKey({
      organizationId: "org-1",
      companyId: "co-1",
      snapshot: null,
      correlationId: "VAT-222-bbb",
    });

    expect(a.deterministic).toBe(false);
    expect(a.key).not.toBe(b.key);
  });
});

describe("reconciliationCheckRequired", () => {
  it("ignores a client-supplied skip in production", () => {
    // skipReconciliationCheck arrives in the request body, so a direct invoke could otherwise
    // switch the gate off for a real HMRC filing.
    expect(
      reconciliationCheckRequired({ environment: "production", skipRequested: true }),
    ).toBe(true);
  });

  it("honours the skip in sandbox so transport testing still works", () => {
    expect(
      reconciliationCheckRequired({ environment: "sandbox", skipRequested: true }),
    ).toBe(false);
  });

  it("runs the check by default in sandbox", () => {
    expect(
      reconciliationCheckRequired({ environment: "sandbox", skipRequested: false }),
    ).toBe(true);
  });
});

/**
 * There is no Deno test harness in this repo, so these are source-structure assertions against the
 * actual edge function — the same convention as hmrc-vat-submit-token.test.ts. They pin the
 * control-flow guarantees that the pure model above only documents.
 */
export const VAT_SUBMIT_SRC = readFileSync(
  resolve(process.cwd(), "supabase/functions/hmrc-vat-submit/index.ts"),
  "utf8",
);

export function vatSubmitSourceFindings(src: string) {
  const accessCheckIdx = src.indexOf("Access denied to organization");
  const precheckIdx = src.indexOf(".eq('idempotency_key', idempotencyKey)");
  const postIdx = src.indexOf("organisations/vat/");
  return {
    /** The old pre-check keyed off filings.idempotency_key — a key never written to filing_submissions. */
    usesStaleFilingKey: /filing\.idempotency_key/.test(src),
    /** The pre-check must query the key that is actually inserted. */
    prechecksComputedKey: precheckIdx !== -1,
    /** Must run after the org access check, so it can't probe other orgs' submissions. */
    prechecksAfterAccessCheck:
      accessCheckIdx !== -1 && precheckIdx !== -1 && accessCheckIdx < precheckIdx,
    /** Must run before we POST to HMRC. */
    prechecksBeforePost: precheckIdx !== -1 && postIdx !== -1 && precheckIdx < postIdx,
    /** The reconciliation gate must not be gated on the filingId path only. */
    reconGatedOnFilingIdOnly: /!skipReconciliationCheck && filing\?\.id/.test(src),
    /** A client-supplied skip must not disable the gate for a real HMRC filing. */
    reconForcedInProduction:
      /environment === 'production' \? true : !skipReconciliationCheck/.test(src),
  };
}

describe("hmrc-vat-submit duplicate + reconciliation gates (T1-4)", () => {
  const f = vatSubmitSourceFindings(VAT_SUBMIT_SRC);

  it("no longer pre-checks the stale filings.idempotency_key", () => {
    expect(f.usesStaleFilingKey).toBe(false);
  });

  it("pre-checks the same key it writes to filing_submissions", () => {
    expect(f.prechecksComputedKey).toBe(true);
  });

  it("pre-checks only after the org access check", () => {
    expect(f.prechecksAfterAccessCheck).toBe(true);
  });

  it("pre-checks before POSTing to HMRC", () => {
    expect(f.prechecksBeforePost).toBe(true);
  });

  it("runs the reconciliation gate on the snapshotId path too", () => {
    expect(f.reconGatedOnFilingIdOnly).toBe(false);
  });

  it("ignores a client-supplied reconciliation skip in production", () => {
    expect(f.reconForcedInProduction).toBe(true);
  });
});
