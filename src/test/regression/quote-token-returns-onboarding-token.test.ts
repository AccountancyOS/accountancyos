import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Repair: "Preparing your secure onboarding link…" forever after accepting a proposal.
 *
 * public_get_quote_by_token returned the onboarding application id but not its access
 * token, and PublicQuoteView refuses to navigate without BOTH (a tokenless /onboard/:id
 * trips the strict token guard). The onboarding rows themselves were fine — only the read
 * path was broken, and only on live: the repo's own copy of the function has returned the
 * token since June, so this was drift.
 *
 * These assertions pin the contract that the client depends on.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");

const MIG_NAME = "20260727160000_quote_token_returns_onboarding_token.sql";
const MIG = readFileSync(resolve(migDir, MIG_NAME), "utf8");
const PAGE = readFileSync(resolve(root, "src/pages/PublicQuoteView.tsx"), "utf8");

/** The body Lovable actually executed is re-filed under its own generated name. */
const bodyOf = (sql: string) => sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION")).trim();

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

describe("public_get_quote_by_token returns the onboarding access token", () => {
  it("owns the live body of the function", () => {
    const latest = latestDefinerOf("public_get_quote_by_token")!;
    // Either the reviewed file itself, or the Lovable-applied twin carrying an
    // identical body — but never some other, later redefinition.
    if (latest !== MIG_NAME) {
      expect(bodyOf(readFileSync(resolve(migDir, latest), "utf8"))).toBe(bodyOf(MIG));
    }
  });

  it("returns the token the client has always read", () => {
    expect(MIG).toMatch(/'onboarding_access_token', v_access_token/);
    // Still returns the id — the payload is added to, never reshaped.
    expect(MIG).toMatch(/'onboarding_application_id', v_onboarding_id/);
  });

  it("sources the token on both paths: existing row and lazy creation", () => {
    expect(MIG).toMatch(
      /SELECT id, access_token INTO v_onboarding_id, v_access_token\s+FROM onboarding_applications/,
    );
    expect(MIG).toMatch(/RETURNING id, access_token INTO v_onboarding_id, v_access_token/);
  });

  it("self-heals a row created before the token default existed", () => {
    expect(MIG).toMatch(/v_access_token IS NULL OR v_access_token = ''/);
    expect(MIG).toMatch(/SET access_token = public\.gen_onboarding_access_token\(\)/);
  });

  it("preserves the rest of the live behaviour", () => {
    // Lazy creation of the application on an accepted quote...
    expect(MIG).toMatch(/INSERT INTO onboarding_applications/);
    // ...and the accepted-snapshot backfill.
    expect(MIG).toMatch(/UPDATE quotes SET accepted_snapshot = v_snapshot/);
    // No table, policy or trigger is touched by a read-path repair.
    expect(MIG).not.toMatch(/CREATE TRIGGER|ALTER TABLE|CREATE POLICY/);
  });

  it("matches what the client requires before it will navigate", () => {
    // The page needs both, and says so — this is the contract being repaired.
    expect(PAGE).toMatch(/onboarding_access_token/);
    expect(PAGE).toMatch(/appId && appToken/);
  });
});
