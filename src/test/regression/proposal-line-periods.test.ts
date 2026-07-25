import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proposal Phase 1 — Task 1 (FOUNDATION) guard.
 *
 * A proposal (quote) must be able to carry the EXACT compliance period per line, and
 * the single-source job engine must honour it. This locks two things into the migration
 * set so a future change can't silently drop them:
 *   1. quote_lines gains additive period columns (period_start / period_end / period_label).
 *   2. lifecycle_materialize_jobs CONSUMES the line's period (ql.period_start / ql.period_label)
 *      rather than only computing a period from today's date.
 *
 * Static checks on the concatenated migration set (mirrors
 * src/test/regression/job-creation-single-source.test.ts).
 */
const root = resolve(__dirname, "../../../");

const migDir = resolve(root, "supabase/migrations");
const migAll = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(migDir, f), "utf8"))
  .join("\n");

describe("proposal quote_lines carry exact periods", () => {
  it("the migration set adds the three additive period columns to quote_lines", () => {
    // Anchored on the quote_lines ALTER so unrelated period_start columns on other
    // tables (jobs/deadlines) can't produce a false positive.
    expect(migAll).toMatch(
      /ALTER TABLE\s+(?:public\.)?quote_lines\s+ADD COLUMN(?: IF NOT EXISTS)? period_start\b/i,
    );
    expect(migAll).toMatch(/ADD COLUMN(?: IF NOT EXISTS)? period_end\b/i);
    expect(migAll).toMatch(/ADD COLUMN(?: IF NOT EXISTS)? period_label\b/i);
  });

  it("lifecycle_materialize_jobs consumes the line's explicit period", () => {
    // The engine loop must reference the line period so a per-line period wins over the
    // computed fallback. We assert both the start date and the label are read off the line.
    expect(migAll).toMatch(/FUNCTION public\.lifecycle_materialize_jobs/);
    expect(migAll).toMatch(/v_line\.period_start/);
    expect(migAll).toMatch(/v_line\.period_label/);
  });
});
