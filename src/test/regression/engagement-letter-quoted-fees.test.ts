import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The engagement letter is the contract, so it must state the fees the proposal quoted.
 *
 * Two defects, both in wording rather than data. Each service line ended with a raw
 * vocabulary token — "(monthly)", "(now)" — and the fee paragraph knew only two buckets:
 * "One-off fees due now total X. Ongoing monthly fees total Y per month." Once total_now
 * came to mean one-off only (20260727170000), an annual fee appeared in NEITHER sentence,
 * so a fee the client had agreed to was silently absent from the document they signed.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");

const MIG_NAME = "20260727180000_engagement_letter_states_quoted_fees.sql";
const MIG = readFileSync(resolve(migDir, MIG_NAME), "utf8");

const latestDefinerOf = (fnName: string): string | undefined =>
  readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\b`).test(
        readFileSync(resolve(migDir, f), "utf8"),
      ),
    )
    .pop();

describe("the engagement letter states the quoted fees", () => {
  it("owns both functions that compose letter wording", () => {
    expect(latestDefinerOf("public_preview_engagement_letter")).toBe(MIG_NAME);
    expect(latestDefinerOf("public_sign_engagement_letter")).toBe(MIG_NAME);
  });

  it("writes a period a client can read, not an internal token", () => {
    expect(MIG).toMatch(/WHEN 'monthly' THEN 'per month'/);
    expect(MIG).toMatch(/WHEN 'annual'\s+THEN 'per year'/);
    expect(MIG).toMatch(/ELSE 'one-off'/);
    // The raw token render is gone.
    expect(MIG).not.toMatch(/COALESCE\(v_line->>'billing_frequency','annual'\)/);
  });

  it("lists every period the client is agreeing to", () => {
    expect(MIG).toMatch(/One-off fees due on acceptance/);
    expect(MIG).toMatch(/per month<\/li>/);
    expect(MIG).toMatch(/per year<\/li>/);
    // An annual fee must never be silently omitted, which is what the old two-bucket
    // sentence would now do.
    expect(MIG).not.toMatch(/Ongoing monthly fees total/);
  });

  it("says so explicitly when nothing is payable", () => {
    expect(MIG).toMatch(/No fees are payable under this engagement/);
  });

  it("gives variant templates an annual merge field without re-issuing the renderer", () => {
    expect(MIG).toMatch(/replace\(v_rendered, '\{\{total_annual\}\}'/);
    // render_engagement_letter_body is IMMUTABLE and shared; adding an argument would
    // mean a signature change or a second overload.
    expect(MIG).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.render_engagement_letter_body/,
    );
  });

  it("preserves the signing side effects it is built on", () => {
    // Reproduced from the live body — the letter row and the application update must
    // survive a wording change.
    expect(MIG).toMatch(/INSERT INTO public\.engagement_letters/);
    expect(MIG).toMatch(/contracts_signed_at = now\(\)/);
    expect(MIG).toMatch(/status = 'aml_pending'/);
    expect(MIG).toMatch(/lifecycle_require_onboarding_token/);
  });
});
