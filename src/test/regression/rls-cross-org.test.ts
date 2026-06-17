import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Non-negotiable #3: RLS isolation is proven with real user JWTs in the
 * smoke script. This test guards that the smoke check stays in place.
 */
const smoke = readFileSync(resolve(__dirname, "../../../scripts/smoke-test.ts"), "utf8");

describe("RLS cross-org isolation (smoke contract)", () => {
  it("signs in as Org A and Org B users (no service role)", () => {
    expect(smoke).toMatch(/signInWithPassword/);
    expect(smoke).toMatch(/SMOKE_RLS_ORG_A_EMAIL/);
    expect(smoke).toMatch(/SMOKE_RLS_ORG_B_EMAIL/);
  });

  it("asserts Org A cannot read Org B clients", () => {
    expect(smoke).toMatch(/cannot see Org B clients|leaked Org B client/);
  });

  it("asserts Org A cannot write to Org B rows", () => {
    expect(smoke).toMatch(/rls:cross-org write blocked/);
  });
});