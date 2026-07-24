import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Consolidation guard: job + deadline creation must stay SINGLE-SOURCE.
 * Locks the work in docs/consolidation-audit-and-plan.md so a future change can't
 * silently re-introduce a second job/deadline engine (the cause of the duplicate-job
 * bug). Static checks on the frontend + the migration set.
 */
const root = resolve(__dirname, "../../../");
const dialog = readFileSync(resolve(root, "src/components/jobs/CreateJobDialog.tsx"), "utf8");

const migDir = resolve(root, "supabase/migrations");
const migAll = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(migDir, f), "utf8"))
  .join("\n");

describe("job/deadline creation single source", () => {
  it("manual Add Job routes through the canonical RPC, not a raw jobs INSERT", () => {
    expect(dialog).toMatch(/lifecycle_create_manual_job/);
    // No direct table write from the dialog — must go through the engine RPC.
    expect(dialog).not.toMatch(/\.from\(\s*["'`]jobs["'`]\s*\)\s*\.insert/);
  });

  it("the canonical engine, shared core and manual RPC all exist", () => {
    expect(migAll).toMatch(/FUNCTION public\.lifecycle_upsert_job_with_deadlines/);
    expect(migAll).toMatch(/FUNCTION public\.lifecycle_materialize_jobs/);
    expect(migAll).toMatch(/FUNCTION public\.lifecycle_create_manual_job/);
  });

  it("the rollover trigger routes through the canonical core", () => {
    expect(migAll).toMatch(/FUNCTION public\.tg_job_completed_rollover/);
    // rollover must call the shared core, not re-implement job creation
    expect(migAll).toMatch(/tg_job_completed_rollover[\s\S]*?lifecycle_upsert_job_with_deadlines/);
  });

  it("the LATEST lifecycle_approve_onboarding routes through the canonical engine, never a raw jobs INSERT", () => {
    // Guards against the live-vs-git divergence repaired in
    // 20260724113000_repair_approve_onboarding_canonical_engine_divergence.sql:
    // onboarding approval must materialize jobs+deadlines via lifecycle_materialize_jobs,
    // not hand-roll an inline `INSERT INTO jobs (...) 'template'` (which produced
    // deadline-less jobs). We check the NEWEST migration that (re)defines the function,
    // since older migrations legitimately still contain the retired inline body.
    const approveFiles = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /FUNCTION public\.lifecycle_approve_onboarding/.test(
          readFileSync(resolve(migDir, f), "utf8"),
        ),
      )
      .sort(); // filenames are timestamp-prefixed → lexical sort == chronological
    expect(approveFiles.length).toBeGreaterThan(0);

    const latest = readFileSync(
      resolve(migDir, approveFiles[approveFiles.length - 1]),
      "utf8",
    );
    // Must delegate to the single-source engine…
    expect(latest).toMatch(/lifecycle_materialize_jobs/);
    // …and must NOT re-introduce an inline jobs INSERT inside approve.
    expect(latest).not.toMatch(/INSERT INTO jobs/i);
  });
});
