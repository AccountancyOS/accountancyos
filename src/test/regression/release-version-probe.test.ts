import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guards the pilot instrumentation on companies-house-sync so a later edit
// cannot silently break identity reporting or leak secrets through the probe.

const INDEX_PATH = resolve(
  __dirname,
  "../../../supabase/functions/companies-house-sync/index.ts",
);
const VERSION_PATH = resolve(
  __dirname,
  "../../../supabase/functions/companies-house-sync/VERSION.ts",
);
const SHARED_PATH = resolve(
  __dirname,
  "../../../supabase/functions/_shared/release-version.ts",
);

describe("companies-house-sync release identity", () => {
  const src = readFileSync(INDEX_PATH, "utf8");

  it("imports handleVersionProbe and RELEASE", () => {
    expect(src).toMatch(/handleVersionProbe/);
    expect(src).toMatch(/from ["']\.\/VERSION\.ts["']/);
    expect(src).toMatch(/from ["']\.\.\/_shared\/release-version\.ts["']/);
  });

  it("calls logColdStartIdentity at module top level", () => {
    // module-level call must precede serve()
    const topLevel = src.slice(0, src.indexOf("serve("));
    expect(topLevel).toMatch(/logColdStartIdentity\(\s*["']companies-house-sync["']/);
  });

  it("dispatches the version probe before any secret read or auth check", () => {
    const probeIdx = src.indexOf("handleVersionProbe(req");
    const secretIdx = src.indexOf('Deno.env.get("CH_PROD_API_KEY")');
    const authIdx = src.indexOf('supabase.auth.getUser(');
    expect(probeIdx).toBeGreaterThan(-1);
    expect(secretIdx).toBeGreaterThan(probeIdx);
    expect(authIdx).toBeGreaterThan(probeIdx);
  });

  it("VERSION.ts declares the required identity fields", () => {
    const v = readFileSync(VERSION_PATH, "utf8");
    for (const key of [
      "RELEASE_SHA",
      "RELEASE_ID",
      "ARTIFACT_CHECKSUM",
      "RELEASE_BUILD_AT",
    ]) {
      expect(v).toMatch(new RegExp(`${key}:`));
    }
  });

  it("shared probe response contains only safe fields", () => {
    const shared = readFileSync(SHARED_PATH, "utf8");
    // Response shape is fixed to these keys — must not accidentally grow to
    // include env values, request data, or secret names.
    const bannedTokens = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "CH_PROD_API_KEY",
      "Deno.env",
      "req.headers",
      "req.json",
    ];
    for (const tok of bannedTokens) {
      expect(shared).not.toContain(tok);
    }
    expect(shared).toMatch(/release_sha/);
    expect(shared).toMatch(/release_id/);
    expect(shared).toMatch(/artifact_checksum/);
    expect(shared).toMatch(/build_at/);
    expect(shared).toMatch(/cache-control/i);
  });
});