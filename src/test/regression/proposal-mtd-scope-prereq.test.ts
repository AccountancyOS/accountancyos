import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proposal Phase 1 — Task 6a (SAFE ADDITIVE half) guard.
 *
 * Three additive, low-risk migration changes must stay locked into the migration set
 * so a future change can't silently drop them. This does NOT cover the canonical
 * deadline bridge or any function change — that is a separate later task.
 *   1. services_catalog gains an MTD annual/final-declaration service (code
 *      `mtd_itsa_final`) referencing the canonical rule `mtd_itsa_final_declaration`,
 *      inserted per organization that has the `sa_mtd` service.
 *   2. the mis-scoped `sole_trader_accounts` catalog row is corrected to
 *      entity_scope='individual' (it was 'company').
 *   3. jobs gains a nullable, self-referencing `prerequisite_job_id` column (CT600←Accounts
 *      dependency link; no behaviour change until a caller sets it).
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

describe("proposal MTD-final service + sole_trader scope fix + CT600 prerequisite", () => {
  it("the migration set inserts the MTD final-declaration service referencing the canonical rule", () => {
    // The new catalog row must use code `mtd_itsa_final`…
    expect(migAll).toMatch(/mtd_itsa_final\b/);
    // …and bind to the existing canonical deadline rule so the bridge (later task) can fire.
    expect(migAll).toMatch(/mtd_itsa_final_declaration/);
    // Inserted into services_catalog, idempotently.
    expect(migAll).toMatch(/INSERT INTO\s+(?:public\.)?services_catalog/i);
  });

  it("the migration set fixes the mis-scoped sole_trader_accounts entity_scope", () => {
    // Anchored to a single UPDATE statement (no semicolon span) so an unrelated
    // entity_scope='individual' elsewhere in the set can't join to a later
    // sole_trader_accounts mention and produce a false positive.
    expect(migAll).toMatch(
      /UPDATE\s+(?:public\.)?services_catalog\s+SET\s+entity_scope\s*=\s*'individual'\s+WHERE[^;]*sole_trader_accounts/i,
    );
  });

  it("the migration set adds a nullable prerequisite_job_id column to jobs", () => {
    expect(migAll).toMatch(
      /ALTER TABLE\s+(?:public\.)?jobs\s+ADD COLUMN(?: IF NOT EXISTS)? prerequisite_job_id\b/i,
    );
  });
});
