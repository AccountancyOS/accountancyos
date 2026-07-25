import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Accounts-prep Increment 2, Task 1: draft TB-snapshot lifecycle RPCs.
 * Static migration-content guard (matching the repo's regression-test style,
 * e.g. job-creation-single-source.test.ts) that the draft-snapshot engine stays
 * ledger-sourced and status-constrained.
 */
const migAll = readdirSync(resolve(__dirname, "../../../supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(__dirname, "../../../supabase/migrations", f), "utf8"))
  .join("\n");

describe("tb snapshot draft lifecycle", () => {
  it("defines create_tb_snapshot sourced from the ledger SoT", () => {
    expect(migAll).toMatch(/FUNCTION public\.create_tb_snapshot/);
    expect(migAll).toMatch(/create_tb_snapshot[\s\S]*?get_trial_balance_from_ledger/);
  });
  it("defines regenerate_tb_snapshot and supersession", () => {
    expect(migAll).toMatch(/FUNCTION public\.regenerate_tb_snapshot/);
    expect(migAll).toMatch(/status\s*=\s*'superseded'/);
  });
  it("constrains snapshot status", () => {
    expect(migAll).toMatch(/status[\s\S]{0,80}IN \('draft'[\s\S]{0,60}'superseded'/);
  });
});
