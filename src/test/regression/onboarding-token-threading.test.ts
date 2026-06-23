import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sprint 1 — onboarding access-token threading (IDOR fix, Increment 3a).
 *
 * Locks the end-to-end delivery so a refactor (incl. parallel Lovable pushes)
 * cannot silently un-thread the token or re-introduce the security regression of
 * leaking the secret to Stripe.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");
const ONB = read("src/pages/PublicOnboarding.tsx");
const QV = read("src/pages/PublicQuoteView.tsx");
const STRIPE = read("supabase/functions/onboarding-stripe-checkout/index.ts");

describe("onboarding access-token threading", () => {
  it("PublicOnboarding passes p_access_token to every public onboarding RPC", () => {
    for (const rpc of [
      "public_get_onboarding",
      "public_preview_engagement_letter",
      "public_sign_engagement_letter",
      "public_record_aml_upload",
      "public_skip_billing",
      "public_submit_onboarding_for_review",
    ]) {
      expect(ONB, `expected ${rpc} call`).toContain(rpc);
    }
    const tokenArgs = ONB.match(/p_access_token:\s*getAccessToken\(\)/g) ?? [];
    expect(tokenArgs.length, "p_access_token threaded into all 6 onboarding RPCs").toBeGreaterThanOrEqual(6);
  });

  it("persists the token to sessionStorage so it survives the Stripe round-trip", () => {
    expect(ONB).toMatch(/getAccessToken/);
    expect(ONB).toMatch(/sessionStorage/);
  });

  it("does NOT route the access token through Stripe (no third-party secret leak)", () => {
    // The Stripe checkout invoke body must not carry the token.
    expect(ONB).not.toMatch(/onboarding-stripe-checkout[\s\S]{0,150}access_token/);
    // The edge function must not append the token to its redirect URLs.
    expect(STRIPE).not.toMatch(/billing=success[^`]*token=/);
    expect(STRIPE).not.toMatch(/billing=cancelled[^`]*token=/);
  });

  it("PublicQuoteView builds the /onboard URL carrying the token", () => {
    expect(QV).toMatch(/onboardPath/);
    expect(QV).toMatch(/\?token=/);
    expect(QV).toMatch(/onboarding_access_token/);
  });
});
