import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Companies House live-sync source-structure guard.
 *
 * There is no local Deno runtime, so this asserts on the deployed function's
 * *source* the way the rest of this repo pins Deno edge-function behaviour
 * (see process-email-queue-contract.test.ts for the pattern).
 *
 * What broke in production: `companies-house-sync` was still generating
 * sandbox mock data for the `sync` action (search/profile had partial live
 * wiring, but `sync` always called `generateMockCompanyProfile` etc, and any
 * CH API failure could throw uncaught). This guards the fix: the function
 * must talk to the real Companies House Public Data API, never throw on a
 * bad CH response, promote officers into the person spine, and never leak
 * the CH API key.
 */

const SRC = readFileSync(
  resolve(__dirname, "../../../supabase/functions/companies-house-sync/index.ts"),
  "utf8",
);

describe("companies-house-sync live-API source structure", () => {
  it("reads the CH API key only from CH_PROD_API_KEY", () => {
    expect(SRC).toMatch(/Deno\.env\.get\(\s*["']CH_PROD_API_KEY["']\s*\)/);
  });

  it("builds the CH Authorization header as Basic (key as username, empty password) — not Bearer", () => {
    // Mirrors src/lib/companies-house-live.ts chBasicAuthHeader exactly:
    // "Basic " + btoa(key + ":")
    expect(SRC).toMatch(/["']Basic\s["']\s*\+\s*btoa\(/);
    // The CH auth header must never be built as a Bearer token.
    expect(SRC).not.toMatch(/Bearer \$\{[^}]*(chApiKey|CH_API_KEY|CH_PROD_API_KEY)[^}]*\}/);
  });

  it("fetches the live Companies House Public Data API", () => {
    expect(SRC).toMatch(/https:\/\/api\.company-information\.service\.gov\.uk/);
  });

  it("has no sandbox mock-data generators left", () => {
    expect(SRC).not.toMatch(/generateMock/);
    expect(SRC).not.toMatch(/\[CH Sandbox\]/);
  });

  it("never throws uncaught on a non-2xx CH response — returns a clean { error, ch_status }", () => {
    expect(SRC).toMatch(/ch_status/);
    // No raw `throw` inside the CH sync path (the old mock function threw
    // Error() on missing company / access-denied / CH failure and relied on
    // the outer handler to catch it — the specific failure mode we're fixing).
    expect(SRC).not.toMatch(/throw new Error/);
  });

  it("promotes officers into company_persons keyed on ch_officer_id, without touching linked_client_id", () => {
    const personsUpsertBlock = SRC.match(
      /\.from\(["']company_persons["']\)[\s\S]{0,400}/,
    )?.[0] ?? "";
    expect(personsUpsertBlock).toMatch(/\.upsert\(/);
    expect(personsUpsertBlock).toMatch(/onConflict:\s*["']ch_officer_id["']/);
    // linked_client_id must never be written by the upsert payload builder —
    // a manual person<->SA-client link must survive a resync. (Explanatory
    // comments are fine; only the payload-construction code is checked.)
    const personUpsertPayloadBuilder =
      SRC.match(/function mapChOfficerToPerson[\s\S]*?\n}\n/)?.[0] ?? "";
    expect(personUpsertPayloadBuilder).not.toMatch(/linked_client_id/);
  });

  it("promotes officers into company_officers keyed on ch_appointment_id", () => {
    const officersUpsertBlock = SRC.match(
      /\.from\(["']company_officers["']\)[\s\S]{0,400}/,
    )?.[0] ?? "";
    expect(officersUpsertBlock).toMatch(/\.upsert\(/);
    expect(officersUpsertBlock).toMatch(/onConflict:\s*["']ch_appointment_id["']/);
  });

  it("persists accounts.next_made_up_to / next_due to the new company columns, non-fatally", () => {
    expect(SRC).toMatch(/accounts_next_made_up_to/);
    expect(SRC).toMatch(/accounts_next_due/);
    // The persistAccountsDatesNonFatal write must be wrapped in try/catch so a
    // schema-not-found error (pre-migration) never aborts the sync.
    const persistFn = SRC.match(
      /async\s+function\s+persistAccountsDatesNonFatal[\s\S]*?\n}\n/,
    )?.[0] ?? "";
    expect(persistFn).toMatch(/try\s*\{/);
    expect(persistFn).toMatch(/catch/);
  });

  it("keeps the existing scalar-diff staging and CS01-deadline creation", () => {
    expect(SRC).toMatch(/companies_house_diff_staging/);
    expect(SRC).toMatch(/CS01/);
  });

  it("keeps the service-role auth gate", () => {
    expect(SRC).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SRC).toMatch(/auth\.getUser/);
  });

  it("never logs, echoes, or otherwise passes the CH API key to a console call", () => {
    // Capture the full console statement to its terminator (;), not just to the
    // first ), so that a key leaked after an inner ) is still caught.
    // E.g.: console.error(`CH failed (status ${status}): key=${chApiKey}`)
    // Old [^)]* would stop at (status) and miss the key; [\s\S]*?); captures the whole call.
    const consoleCalls = SRC.match(/console\.(log|error|warn|info|debug)\([\s\S]*?\);/g) ?? [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/CH_PROD_API_KEY/);
      expect(call).not.toMatch(/chApiKey/i);
      expect(call).not.toMatch(/chAuthHeader/i);
    }
  });

  it("responds to CORS preflight and includes CORS headers on every response", () => {
    expect(SRC).toMatch(/req\.method\s*===\s*['"]OPTIONS['"]/);
    expect(SRC).toMatch(/Access-Control-Allow-Origin/);
    const bareContentType =
      SRC.match(/headers:\s*\{(?![^}]*corsHeaders)[^}]*[Cc]ontent-[Tt]ype[^}]*\}/g) ?? [];
    expect(bareContentType).toEqual([]);
  });
});
