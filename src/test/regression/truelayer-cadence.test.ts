import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cutover B / B4 — TrueLayer scheduled sync runs every 2 hours (owner decision, 2026-11-11).
 * Manual refresh stays on demand. The change is a migration on the single-project path.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");
const FILE = "20261111140100_truelayer_sync_every_2h.sql";
const sql = readFileSync(resolve(migDir, FILE), "utf8");
const code = sql.replace(/^\s*--.*$/gm, "");

describe("TrueLayer sync cadence migration", () => {
  it("is the first migration after the London baseline", () => {
    const migrations = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    expect(migrations.indexOf(FILE)).toBe(migrations.indexOf("20261111140000_london_baseline.sql") + 1);
  });

  it("changes only the schedule, via cron.alter_job, to every two hours", () => {
    expect(code).toMatch(/cron\.alter_job\(job_id := v_jobid, schedule := '0 \*\/2 \* \* \*'\)/);
    expect(code).not.toMatch(/cron\.schedule\(|cron\.unschedule\(|active :=|command :=/);
    expect(code).not.toMatch(/\bUPDATE\s+cron\.job\b/i);
  });

  it("is idempotent: it only alters when the schedule differs", () => {
    expect(code).toMatch(/IF v_schedule IS DISTINCT FROM '0 \*\/2 \* \* \*' THEN/);
  });

  it("refuses when the job is missing and asserts the end state", () => {
    expect(code).toMatch(/does not exist/);
    expect(code).toMatch(/schedule is not 0 \*\/2 \* \* \* after alter/);
    expect(code).toMatch(/command or active flag changed unexpectedly/);
  });

  it("leaves the baseline's 30-minute schedule in place (the baseline is immutable history)", () => {
    const baseline = readFileSync(resolve(migDir, "20261111140000_london_baseline.sql"), "utf8");
    expect(baseline).toMatch(/SELECT cron\.schedule\('truelayer-sync-scheduled', '\*\/30 \* \* \* \*'/);
  });
});
