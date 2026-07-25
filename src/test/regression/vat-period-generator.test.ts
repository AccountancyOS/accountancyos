import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proposal Phase 1 — Task 5a guard: the VAT period generator must exist as a single
 * pure calculator function in the migration set.
 *
 * Static-content check (mirrors job-creation-single-source.test.ts): a proposal's VAT
 * step generates one job-dedup period per selected UK VAT return period, so the
 * frequency/stagger arithmetic lives in ONE canonical DB function
 * (public.generate_vat_periods) rather than being re-derived per caller. This locks
 * the function's existence and its handling of all three UK VAT frequencies + stagger.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");
const migAll = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(migDir, f), "utf8"))
  .join("\n");

describe("VAT period generator (proposal Phase 1 T5a)", () => {
  it("the migration set defines the canonical generate_vat_periods function", () => {
    expect(migAll).toMatch(/FUNCTION public\.generate_vat_periods/);
    // Pure calculator: returns the period tuple, never writes vat_periods.
    expect(migAll).toMatch(
      /generate_vat_periods[\s\S]*?RETURNS TABLE\s*\(\s*period_start date/i,
    );
  });

  it("handles all three UK VAT frequencies", () => {
    // The single-function body must branch on monthly / quarterly / annual.
    expect(migAll).toMatch(/generate_vat_periods[\s\S]*?'monthly'/);
    expect(migAll).toMatch(/generate_vat_periods[\s\S]*?'quarterly'/);
    expect(migAll).toMatch(/generate_vat_periods[\s\S]*?'annual'/);
  });

  it("derives quarterly periods from the VAT stagger group", () => {
    expect(migAll).toMatch(/generate_vat_periods[\s\S]*?p_stagger/);
  });
});
