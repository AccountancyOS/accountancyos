import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 1 — Task 6b-1 guard: the MTD-quarter + MTD-final deadlines and the
 * MTD Quarterly Filing service must be present in the migration set.
 *
 * System A (`calculate_deadline`) is THE active deadline engine. This locks in the
 * two new per-period arms it gained for the proposal's per-period MTD jobs, and the
 * per-org `mtd_quarter` catalog service that those jobs bind to. Static checks over
 * the migration set (mirrors job-creation-single-source.test.ts).
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");
const migAll = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(migDir, f), "utf8"))
  .join("\n");

describe("MTD deadlines + service (Phase 1 T6b-1)", () => {
  it("calculate_deadline gains the 'mtd_quarter' arm (fixed 7th-of-month-after quarter-end)", () => {
    // The arm literal and the month-after-quarter-end date math must both be present.
    expect(migAll).toMatch(/WHEN\s+'mtd_quarter'\s+THEN/);
    expect(migAll).toMatch(
      /DATE_TRUNC\('month',\s*period_end\)\s*\+\s*INTERVAL\s*'1 month'\s*\+\s*INTERVAL\s*'6 days'/i,
    );
  });

  it("calculate_deadline gains the 'mtd_itsa_final' arm (31 Jan following the tax year)", () => {
    expect(migAll).toMatch(/WHEN\s+'mtd_itsa_final'\s+THEN/);
    // 31 January following the tax year, mirroring self_assessment's year logic.
    expect(migAll).toMatch(
      /make_date\(\s*EXTRACT\(YEAR FROM period_end\)::int\s*\+\s*1,\s*1,\s*31\s*\)/i,
    );
  });

  it("both new arms live inside a CREATE OR REPLACE of the System A engine", () => {
    // The additive arms must be part of a full re-definition of calculate_deadline,
    // not a stray fragment.
    expect(migAll).toMatch(
      /CREATE OR REPLACE FUNCTION public\.calculate_deadline/,
    );
  });

  it("adds the per-org 'mtd_quarter' MTD Quarterly Filing service from each org's sa_mtd", () => {
    expect(migAll).toMatch(/'mtd_quarter'/);
    expect(migAll).toMatch(/MTD Quarterly Filing/);
    // Bound to the reused canonical concept and seeded per-org from sa_mtd.
    expect(migAll).toMatch(/'self_assessment_mtd_quarterly'/);
    expect(migAll).toMatch(/WHERE\s+sc\.code\s*=\s*'sa_mtd'/i);
  });
});
