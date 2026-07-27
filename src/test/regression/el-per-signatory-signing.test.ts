import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 2 Task 2d-2 — the per-signatory signing protocol.
 *
 * Static-content guard. The invariants worth freezing are the ones that silently break
 * the activation gate if someone edits these RPCs later:
 *   - the signing rule is CALLED, never re-implemented (T2d-1 owns it);
 *   - signing writes the APPLICATION side (contracts_signed_at), the historic drift
 *     defect in the emailed-link path;
 *   - a status advance can never REGRESS an application past its current step;
 *   - the shared letter-level link cannot half-sign a per-signatory letter;
 *   - the public signing page reads through an RPC, never straight off an RLS'd table.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");

const MIG_NAME = "20260727150000_el_per_signatory_signing.sql";
const MIG = readFileSync(resolve(migDir, MIG_NAME), "utf8");

/** The migration that most recently (re)defines a function owns its live body. */
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

/** Body of one function definition within the migration. */
const bodyOf = (fnName: string): string => {
  const start = MIG.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  expect(start, `${fnName} is defined in ${MIG_NAME}`).toBeGreaterThan(-1);
  const end = MIG.indexOf("$function$;", start);
  return MIG.slice(start, end);
};

describe("per-signatory engagement-letter signing (Phase 2 T2d-2)", () => {
  it("defines the public read + per-signatory sign RPCs and grants them to anon", () => {
    expect(MIG).toMatch(
      /CREATE OR REPLACE FUNCTION public\.public_get_engagement_letter_for_signing\(p_token text\)[\s\S]*?STABLE SECURITY DEFINER/,
    );
    expect(MIG).toMatch(
      /CREATE OR REPLACE FUNCTION public\.public_sign_engagement_letter_as_signatory\([\s\S]*?SECURITY DEFINER/,
    );
    for (const fn of [
      "public_get_engagement_letter_for_signing(text)",
      "public_sign_engagement_letter_as_signatory(text, jsonb)",
      "public_sign_engagement_letter_by_token(text, jsonb)",
    ]) {
      expect(MIG).toContain(
        `GRANT EXECUTE ON FUNCTION public.${fn} TO anon, authenticated;`,
      );
    }
  });

  it("calls the shared signature rule instead of re-implementing it", () => {
    // Every branch decision goes through T2d-1's evaluator...
    expect(MIG).toMatch(/public\.el_signature_progress\(v_letter\.id\)/);
    // ...so no local re-derivation of the rule may appear here.
    expect(MIG).not.toMatch(/signing_rule\s*=\s*'any'/);
    expect(MIG).not.toMatch(/count\(\*\) FILTER \(WHERE required/);
  });

  it("resolves either a signatory token or the letter-level token", () => {
    const read = bodyOf("public_get_engagement_letter_for_signing");
    expect(read).toMatch(
      /FROM public\.engagement_letter_signatories\s+WHERE signature_token = v_uuid/,
    );
    expect(read).toMatch(
      /FROM public\.engagement_letters WHERE signature_token = trim\(p_token\)/,
    );
    // A non-uuid token must degrade to "letter token", not raise.
    expect(read).toMatch(/EXCEPTION WHEN invalid_text_representation THEN\s+v_uuid := NULL/);
    // Flags a shared link used on a per-signatory letter.
    expect(read).toMatch(/'requires_personal_link'/);
  });

  it("is idempotent per signatory and never records a second signature", () => {
    const sign = bodyOf("public_sign_engagement_letter_as_signatory");
    expect(sign).toMatch(/IF v_sig\.signed_at IS NOT NULL THEN[\s\S]*?'already_signed', true/);
    // Row locks taken in a fixed order so concurrent signatories serialise.
    expect(sign).toMatch(
      /engagement_letter_signatories[\s\S]*?FOR UPDATE[\s\S]*?engagement_letters[\s\S]*?FOR UPDATE/,
    );
  });

  it("writes the application side once the rule is satisfied", () => {
    const sign = bodyOf("public_sign_engagement_letter_as_signatory");
    expect(sign).toMatch(/IF v_satisfied THEN/);
    expect(sign).toMatch(/contracts_signed_at = COALESCE\(contracts_signed_at, now\(\)\)/);
    // Partial state until then — the letter, never the quote.
    expect(sign).toMatch(/'partially_signed'/);
    expect(sign).not.toMatch(/UPDATE public\.quotes/);
  });

  it("never regresses an onboarding application to an earlier step", () => {
    // Both signing paths advance only from a pre-signature status.
    const guard =
      /status IN \('draft','in_progress','engagement_pending'\) THEN 'aml_pending'/g;
    expect(MIG.match(guard)?.length).toBe(2);
    // ...and neither signs a closed application.
    expect(MIG).toMatch(/status IN \('approved','rejected','cancelled'\)/);
  });

  it("stops the shared letter link from half-signing a per-signatory letter", () => {
    expect(latestDefinerOf("public_sign_engagement_letter_by_token")).toBe(MIG_NAME);
    const legacy = bodyOf("public_sign_engagement_letter_by_token");
    expect(legacy).toMatch(
      /IF COALESCE\(\(v_progress->>'has_signatories'\)::boolean, false\) THEN[\s\S]*?'requires_personal_link', true/,
    );
    // The historic defect: this path set letter.signed_at and nothing else.
    expect(legacy).toMatch(/UPDATE public\.onboarding_applications/);
    expect(legacy).toMatch(/contracts_signed_at = COALESCE\(contracts_signed_at, now\(\)\)/);
  });

  it("leaves the in-portal signing path and the lifecycle functions alone", () => {
    expect(MIG).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.public_sign_engagement_letter\(/,
    );
    expect(MIG).not.toMatch(/CREATE OR REPLACE FUNCTION public\.lifecycle_/);
    expect(MIG).not.toMatch(/CREATE OR REPLACE FUNCTION public\.public_accept_quote_by_token/);
  });
});
