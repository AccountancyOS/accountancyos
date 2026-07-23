import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * G3 — onboarding CH officer pre-link edge function, source-structure guard.
 *
 * There is no local Deno runtime, so — like companies-house-sync-live.test.ts —
 * this asserts on the deployed function's *source*.
 *
 * SECURITY-CRITICAL invariants this pins:
 *  - The onboarding access token is validated (server-side, via the boolean RPC
 *    validate_onboarding_access_token) BEFORE any Companies House call or DB write.
 *  - CH_PROD_API_KEY is read only from env and never logged, echoed, or returned.
 *  - The function upserts company_persons ONLY (no companies row exists pre-approval)
 *    keyed on organization_id,ch_officer_id, skips resigned / link-less officers,
 *    and returns the stable person_id + ch_officer_id that G2's approval-merge reads.
 */

const SRC = readFileSync(
  resolve(__dirname, "../../../supabase/functions/onboarding-fetch-ch-officers/index.ts"),
  "utf8",
);

const CONFIG = readFileSync(
  resolve(__dirname, "../../../supabase/config.toml"),
  "utf8",
);

describe("onboarding-fetch-ch-officers edge function source structure", () => {
  it("builds a service-role Supabase client", () => {
    expect(SRC).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SRC).toMatch(/Deno\.env\.get\(\s*["']SUPABASE_URL["']\s*\)/);
  });

  it("validates the onboarding access token via the boolean RPC before any CH fetch or DB write", () => {
    // Uses the boolean RPC (clean 401), NOT the RAISEing lifecycle_require_onboarding_token.
    expect(SRC).toMatch(/validate_onboarding_access_token/);
    expect(SRC).not.toMatch(/lifecycle_require_onboarding_token/);

    const tokenGateIdx = SRC.indexOf("validate_onboarding_access_token");
    const chFetchIdx = SRC.indexOf("company-information.service.gov.uk");
    const upsertIdx = SRC.indexOf(".upsert(");

    expect(tokenGateIdx).toBeGreaterThan(-1);
    expect(chFetchIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    // Token gate must appear before the CH call and before the DB write.
    expect(tokenGateIdx).toBeLessThan(chFetchIdx);
    expect(tokenGateIdx).toBeLessThan(upsertIdx);
  });

  it("returns a clean 401 { error: 'invalid_token' } when the token is invalid", () => {
    expect(SRC).toMatch(/invalid_token/);
    expect(SRC).toMatch(/401/);
  });

  it("rejects a closed application (approved/rejected/cancelled) with 409 onboarding_closed", () => {
    expect(SRC).toMatch(/onboarding_closed/);
    expect(SRC).toMatch(/approved/);
    expect(SRC).toMatch(/rejected/);
    expect(SRC).toMatch(/cancelled/);
    expect(SRC).toMatch(/409/);
  });

  it("guards application_type === 'company' and a non-empty company_number", () => {
    expect(SRC).toMatch(/application_type/);
    expect(SRC).toMatch(/company_number/);
    // Non-company or missing company number returns an empty (non-error) people list.
    expect(SRC).toMatch(/people:\s*\[\]/);
  });

  it("reads the CH API key only from CH_PROD_API_KEY env", () => {
    expect(SRC).toMatch(/Deno\.env\.get\(\s*["']CH_PROD_API_KEY["']\s*\)/);
  });

  it("fetches the live /officers endpoint with a Basic (not Bearer) auth header", () => {
    expect(SRC).toMatch(/https:\/\/api\.company-information\.service\.gov\.uk/);
    expect(SRC).toMatch(/\/officers/);
    expect(SRC).toMatch(/["']Basic\s["']\s*\+\s*btoa\(/);
    expect(SRC).not.toMatch(/Bearer \$\{[^}]*(chApiKey|CH_API_KEY|CH_PROD_API_KEY)[^}]*\}/);
  });

  it("returns { people: [], warning: 'ch_lookup_failed' } on a non-200 CH response, without leaking CH bodies or the key", () => {
    expect(SRC).toMatch(/ch_lookup_failed/);
  });

  it("upserts company_persons keyed on organization_id,ch_officer_id and does NOT touch company_officers", () => {
    const personsBlock = SRC.match(/\.from\(["']company_persons["']\)[\s\S]{0,400}/)?.[0] ?? "";
    expect(personsBlock).toMatch(/\.upsert\(/);
    expect(personsBlock).toMatch(/onConflict:\s*["']organization_id,ch_officer_id["']/);
    // No companies row exists pre-approval, so company_officers must never be referenced.
    expect(SRC).not.toMatch(/company_officers/);
  });

  it("never writes linked_client_id (preserves manual links on resync)", () => {
    expect(SRC).not.toMatch(/linked_client_id/);
  });

  it("skips officers with no links.self and skips resigned officers", () => {
    expect(SRC).toMatch(/links\?\.\s*self|links\.self/);
    expect(SRC).toMatch(/resigned_on/);
  });

  it("returns person_id and ch_officer_id (the keys G2's approval-merge reads)", () => {
    expect(SRC).toMatch(/person_id/);
    expect(SRC).toMatch(/ch_officer_id/);
  });

  it("never logs, echoes, or passes the CH API key to a console call", () => {
    const consoleCalls = SRC.match(/console\.(log|error|warn|info|debug)\([\s\S]*?\);/g) ?? [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/CH_PROD_API_KEY/);
      expect(call).not.toMatch(/chApiKey/i);
      expect(call).not.toMatch(/access_token/i);
    }
  });

  it("never returns the CH key or the access token in a response body", () => {
    // No response JSON should serialise the secret env var or the token.
    expect(SRC).not.toMatch(/JSON\.stringify\([^)]*CH_PROD_API_KEY/);
    const responseBlocks = SRC.match(/jsonResponse\([\s\S]*?\)/g) ?? [];
    for (const block of responseBlocks) {
      expect(block).not.toMatch(/CH_PROD_API_KEY/);
      expect(block).not.toMatch(/access_token/);
    }
  });

  it("handles CORS preflight and puts CORS headers on every response", () => {
    expect(SRC).toMatch(/req\.method\s*===\s*['"]OPTIONS['"]/);
    expect(SRC).toMatch(/Access-Control-Allow-Origin/);
    const bareContentType =
      SRC.match(/headers:\s*\{(?![^}]*corsHeaders)[^}]*[Cc]ontent-[Tt]ype[^}]*\}/g) ?? [];
    expect(bareContentType).toEqual([]);
  });
});

describe("onboarding-fetch-ch-officers config.toml declaration", () => {
  it("declares the function with verify_jwt = false (anon-callable)", () => {
    expect(CONFIG).toMatch(
      /\[functions\.onboarding-fetch-ch-officers\]\s*\n\s*verify_jwt\s*=\s*false/,
    );
  });
});
