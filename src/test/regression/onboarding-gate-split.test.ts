import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proposal Phase 2 T2b — the onboarding activation gate is SPLIT:
 * signature-rule completion drives activation; billing_settled is decoupled (non-blocking).
 * Guards the migration 20260727130000_split_onboarding_gate.sql (re-issued from the live
 * bodies of lifecycle_onboarding_gates / _approve_onboarding / _evaluate_onboarding_activation).
 */
const migDir = resolve(__dirname, "../../../supabase/migrations");
const gateFile = readFileSync(
  resolve(migDir, "20260727130000_split_onboarding_gate.sql"),
  "utf8",
);

describe("onboarding gate split (Phase 2 T2b)", () => {
  it("lifecycle_onboarding_gates exposes activation_ready and reads the signatory rule", () => {
    expect(gateFile).toMatch(/FUNCTION public\.lifecycle_onboarding_gates/);
    expect(gateFile).toMatch(/'activation_ready'/);
    expect(gateFile).toMatch(/engagement_letter_signatories/);
    expect(gateFile).toMatch(/signing_rule/);
    // activation_ready must NOT include billing (billing is decoupled)
    expect(gateFile).toMatch(/v_activation_ready\s*:=\s*\(v_el_signed AND v_aml AND v_submitted AND v_open AND v_context\)/);
  });

  it("approve + evaluate gate on activation_ready, not all_pass", () => {
    // approve refusal keys on activation_ready
    expect(gateFile).toMatch(/lifecycle_approve_onboarding[\s\S]*?->>'activation_ready'/);
    // evaluate reads activation_ready
    expect(gateFile).toMatch(/lifecycle_evaluate_onboarding_activation[\s\S]*?->>'activation_ready'/);
    // billing_settled is still reported by the gates function (not removed, just not gating)
    expect(gateFile).toMatch(/'billing_settled'/);
  });
});
