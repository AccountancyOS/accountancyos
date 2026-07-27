import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 2 Task 2d-1 — ONE implementation of the engagement-letter signature rule.
 *
 * Static-content guard (same shape as engagement-letter-signatories.test.ts). The rule
 * ('all' = every required signatory signed / 'any' = at least one) must exist exactly
 * once, in `public.el_signature_progress`. T2b had it inline inside
 * `lifecycle_onboarding_gates`; T2d-2 adds a second caller (the per-signatory sign RPC),
 * so any re-inlining is drift and fails here.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");

const migFiles = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const MIG_NAME = "20260727140000_el_signature_rule_sot.sql";
const MIG = readFileSync(resolve(migDir, MIG_NAME), "utf8");

const checkConstants = readFileSync(
  resolve(root, "src/lib/db-constants/check-constraints.ts"),
  "utf8",
);

/** The migration that most recently (re)defines a function owns its live body. */
const latestDefinerOf = (fnName: string): string | undefined =>
  migFiles
    .filter((f) =>
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\b`).test(
        readFileSync(resolve(migDir, f), "utf8"),
      ),
    )
    .pop();

describe("engagement-letter signature rule single source of truth (Phase 2 T2d-1)", () => {
  it("defines el_signature_progress as a STABLE SECURITY DEFINER rule evaluator", () => {
    expect(MIG).toMatch(
      /CREATE OR REPLACE FUNCTION public\.el_signature_progress\(p_engagement_letter_id uuid\)[\s\S]*?STABLE SECURITY DEFINER/,
    );
    // Reports enough for both callers: existence, rule, counts, satisfied.
    for (const key of [
      "has_signatories",
      "signing_rule",
      "required_total",
      "required_signed",
      "satisfied",
    ]) {
      expect(MIG).toContain(`'${key}'`);
    }
  });

  it("counts only required signatories and defaults an absent rule to 'all'", () => {
    expect(MIG).toMatch(
      /count\(\*\) FILTER \(WHERE required\)[\s\S]*?count\(\*\) FILTER \(WHERE required AND signed_at IS NOT NULL\)/,
    );
    expect(MIG).toMatch(/v_rule := COALESCE\(v_rule, 'all'\)/);
    // 'any' => >= 1 signed; 'all' => every required row signed; no rows => never satisfied.
    expect(MIG).toMatch(/WHEN v_total = 0\s+THEN false/);
    expect(MIG).toMatch(/WHEN v_rule\s+= 'any'\s+THEN v_signed >= 1/);
    expect(MIG).toMatch(/ELSE\s+v_signed = v_total/);
  });

  it("re-points lifecycle_onboarding_gates at the shared evaluator", () => {
    // This migration owns the live gate body...
    expect(latestDefinerOf("lifecycle_onboarding_gates")).toBe(MIG_NAME);
    expect(MIG).toMatch(/v_sig := public\.el_signature_progress\(v_letter_id\)/);
    // ...and no longer re-implements the rule inline (the T2b variables are gone).
    expect(MIG).not.toMatch(/v_sig_rule/);
    expect(MIG).not.toMatch(/v_req_total/);
    expect(MIG).not.toMatch(/v_req_signed/);
  });

  it("keeps the gate's legacy single-signer fallback and billing split intact", () => {
    // Letters with no signatory rows still gate on signed_at + contracts_signed_at.
    expect(MIG).toMatch(
      /el\.signed_at IS NOT NULL[\s\S]*?AND a\.contracts_signed_at IS NOT NULL/,
    );
    // T2b's split survives the re-issue: activation excludes billing_settled.
    expect(MIG).toMatch(
      /v_activation_ready := \(v_el_signed AND v_aml AND v_submitted AND v_open AND v_context\)/,
    );
    expect(MIG).toMatch(/'billing_settled', v_billing/);
  });

  it("widens engagement_letters_status_check rather than replacing its values", () => {
    expect(MIG).toMatch(
      /CHECK \(status IN \('draft', 'sent', 'partially_signed', 'signed'\)\)/,
    );
    // Located by constrained column, so a differently-named live CHECK cannot survive
    // and keep rejecting the new value.
    expect(MIG).toMatch(/c\.conkey\s+= ARRAY\[v_attnum\]/);
  });

  it("puts partially_signed on the engagement letter, never on quotes", () => {
    expect(checkConstants).toMatch(
      /ENGAGEMENT_LETTER_STATUSES = \[\s*"draft",\s*"sent",\s*"partially_signed",\s*"signed",\s*\]/,
    );
    // The T2a-era forward-looking quote constant is retired — writing the token to
    // quotes.status would violate the live quotes_status_check.
    expect(checkConstants).not.toMatch(/export const PROPOSAL_STATUSES/);
    expect(checkConstants).toMatch(
      /QUOTE_STATUSES = \["draft", "sent", "accepted", "rejected", "expired", "superseded"\]/,
    );
  });
});
