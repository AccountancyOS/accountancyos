import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cutover B / B5 — lint is a hard CI gate (owner decision 2026-11-11: "freeze & block new").
 *
 * 985 pre-existing `no-explicit-any` violations were recorded with ESLint's bulk suppressions
 * (eslint-suppressions.json). ESLint itself then fails on any NEW violation and on any recorded
 * suppression that is no longer needed. This test adds the ratchet: the file may only ever shrink,
 * and may only ever suppress that one rule.
 */
const root = resolve(__dirname, "../../../");
type Suppressions = Record<string, Record<string, { count: number }>>;
const suppressions = JSON.parse(readFileSync(resolve(root, "eslint-suppressions.json"), "utf8")) as Suppressions;

const CEILING = 985; // recorded 2026-11-11. Lower this when you remove `any`s; never raise it.

describe("lint gate", () => {
  it("suppresses only @typescript-eslint/no-explicit-any", () => {
    const rules = new Set(Object.values(suppressions).flatMap((r) => Object.keys(r)));
    expect([...rules]).toEqual(["@typescript-eslint/no-explicit-any"]);
  });

  it("never grows: the suppressed count stays at or below the recorded ceiling", () => {
    const total = Object.values(suppressions).reduce(
      (n, r) => n + (r["@typescript-eslint/no-explicit-any"]?.count ?? 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(CEILING);
  });

  it("suppresses nothing in edge functions (they are linted by Deno tooling, not this config)", () => {
    expect(Object.keys(suppressions).filter((f) => f.startsWith("supabase/functions/"))).toEqual([]);
  });

  it("keeps the rule an error — the suppressions file is the only allowance", () => {
    const config = readFileSync(resolve(root, "eslint.config.js"), "utf8");
    expect(config).not.toMatch(/no-explicit-any["']?\s*:\s*["']?(off|warn|0|1)/);
  });

  it("CI runs lint and fails on it", () => {
    const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/run: npm run lint/);
    expect(ci).not.toMatch(/--pass-on-unpruned-suppressions/);
  });
});
