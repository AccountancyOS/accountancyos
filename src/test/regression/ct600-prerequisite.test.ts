import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proposal Phase 1 T6b-2 guard: a corporation_tax (CT600) job must be wired to
 * depend on the same company's company_accounts job for the same accounts year via
 * jobs.prerequisite_job_id, established inside the canonical materialize engine.
 *
 * Static-content check on the migration set (mirrors job-creation-single-source.test.ts):
 * the NEWEST migration that (re)defines lifecycle_materialize_jobs must contain the
 * prerequisite-linking UPDATE. We check the newest definer because older migrations
 * legitimately predate the linking behaviour.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");

function newestDefiningMaterialize(): string {
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) =>
      /FUNCTION public\.lifecycle_materialize_jobs/.test(
        readFileSync(resolve(migDir, f), "utf8"),
      ),
    )
    .sort(); // timestamp-prefixed → lexical sort == chronological
  expect(files.length).toBeGreaterThan(0);
  return readFileSync(resolve(migDir, files[files.length - 1]), "utf8");
}

describe("CT600 depends on Accounts via prerequisite_job_id (T6b-2)", () => {
  const body = newestDefiningMaterialize();

  it("the latest materialize engine links CT600 to the Accounts job via prerequisite_job_id", () => {
    // The linking UPDATE must target prerequisite_job_id…
    expect(body).toMatch(/prerequisite_job_id\s*=\s*acc\.id/);
    // …matching a corporation_tax job to a company_accounts job…
    expect(body).toMatch(/service_type\s*=\s*'corporation_tax'/);
    expect(body).toMatch(/service_type\s*=\s*'company_accounts'/);
    // …on the same accounts year-end (period_end match)…
    expect(body).toMatch(/acc\.period_end\s*=\s*ct\.period_end/);
    // …and it must be idempotent (only writes when the link differs).
    expect(body).toMatch(/prerequisite_job_id\s+IS DISTINCT FROM\s+acc\.id/);
  });

  it("the link is guarded so a NULL period_end cannot cross-link two years", () => {
    expect(body).toMatch(/ct\.period_end\s+IS NOT NULL/);
  });
});
