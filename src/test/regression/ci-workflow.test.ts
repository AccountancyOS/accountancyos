import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cutover B / B5 — CI must actually test something, and a failure must be a failure.
 * Static contract over .github/workflows/ci.yml.
 */
const root = resolve(__dirname, "../../../");
// Contract checks read the workflow without comment lines, so prose explaining a rule never trips it.
const yml = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8").replace(/^\s*#.*$/gm, "");

function jobBlock(name: string): string {
  const start = yml.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name} exists`).toBeGreaterThan(-1);
  const rest = yml.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("CI workflow", () => {
  it("runs on every push and pull request", () => {
    expect(yml).toMatch(/^on:\n\s+push:\n\s+pull_request:/m);
  });

  it("never lets a step fail silently", () => {
    expect(yml).not.toMatch(/continue-on-error/);
    expect(yml).not.toMatch(/\|\|\s*true/);
    expect(yml).not.toMatch(/if:\s*false/);
  });

  it("pins every action to a full commit SHA", () => {
    const uses = yml.match(/uses:\s*\S+/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
  });

  it("uses npm only", () => {
    expect(yml).not.toMatch(/\bbun\b|bunx|setup-bun/);
  });

  it("app job: npm ci -> typecheck -> lint -> build -> test, in that order", () => {
    const app = jobBlock("app");
    const order = ["npm ci", "npx tsc --noEmit -p tsconfig.app.json", "npm run lint", "npm run build", "npm test"]
      .map((cmd) => app.indexOf(`run: ${cmd}`));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("app job builds against London with the publishable key only", () => {
    const app = jobBlock("app");
    expect(app).toMatch(/VITE_SUPABASE_URL: https:\/\/ezsvdsjdtardkxfswjvq\.supabase\.co/);
    expect(app).toMatch(/VITE_SUPABASE_PUBLISHABLE_KEY: sb_publishable_/);
    expect(yml).not.toMatch(/sb_secret_|eyJ[A-Za-z0-9_-]{20,}/);
  });

  it("database job rebuilds from migrations locally and runs pgTAP", () => {
    const db = jobBlock("database");
    expect(db).toMatch(/run: supabase start\b/);
    expect(db).toMatch(/run: supabase db reset --local --yes/);
    expect(db).toMatch(/run: supabase test db/);
  });

  it("never writes to a remote database", () => {
    expect(yml).not.toMatch(/supabase db push|db reset --linked|--linked|migration repair|functions deploy/);
  });

  it("edge-functions job type-checks every function and runs the shared-module Deno tests", () => {
    const edge = jobBlock("edge-functions");
    expect(edge).toMatch(/for dir in supabase\/functions\/\*\//);
    expect(edge).toContain('deno check ${args[@]+"${args[@]}"} "$dir/index.ts"'); // empty-array safe under set -u
    expect(edge).toMatch(/run: deno test --allow-env supabase\/functions\/_shared\//);
    expect(edge).toMatch(/DENO_NO_PACKAGE_JSON: "1"/);
    expect(edge).toMatch(/set -euo pipefail/);
  });

  it("keeps the live smoke test manual-only", () => {
    expect(jobBlock("smoke")).toMatch(/if: github\.event_name == 'workflow_dispatch'/);
  });
});
