import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DB_VOCABULARY, CONTRADICTORY_COLUMNS } from "@/lib/db-constants/vocabularies.generated";

/**
 * DEF-034 — two columns whose live CHECK constraints contradicted each other, and three
 * status literals no constraint permitted.
 *
 * THE DEFECT. A column may carry several live CHECK constraints; Postgres enforces all of
 * them, so the writable set is their INTERSECTION. Twice, a new vocabulary was added without
 * retiring the old one:
 *
 *   filings.status   — valid_status (2025-11-27) ∩ chk_filing_status (2026-06-20) left seven
 *     states unwritable, `submitted` among them. A filing could not be recorded as submitted.
 *   deadlines.status — deadlines_status_check (2025-11-27) ∩ chk_deadlines_status (2025-12-18)
 *     left only pending/overdue/cancelled writable. A deadline could not be completed.
 *
 * Owner rulings 2026-08-09: drop valid_status; drop chk_deadlines_status (here the NEWER
 * constraint was the leftover — app code, types and registry all use the older vocabulary).
 *
 * Found statically by scripts/generate-db-vocabulary.py, which computes the intersection that
 * nothing in the codebase had computed before.
 */
const root = resolve(__dirname, "../../../");
const MIG_NAME = "20260809120000_def_034_vocabulary_alignment.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${MIG_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

describe("DEF-034 — the repair", () => {
  it("retires exactly the two superseded constraints, and no others", () => {
    const drops = [...CODE.matchAll(/^ALTER TABLE public\.(\w+)\s+DROP CONSTRAINT (\w+);/gm)]
      .map((m) => `${m[1]}.${m[2]}`);
    expect(drops.sort()).toEqual([
      "deadlines.chk_deadlines_status",
      "filings.valid_status",
    ]);
  });

  it("widens nothing — no constraint is added to accommodate a caller", () => {
    // Widening a vocabulary to fit a typo is how both contradictions came to exist.
    expect(CODE).not.toMatch(/ADD CONSTRAINT/);
  });

  it("re-issues exactly the two functions with forbidden literals", () => {
    const created = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual([
      "lifecycle_accept_portal_invitation",
      "lifecycle_generate_deadlines_for_job",
    ]);
  });

  it("touches no column, index, policy, trigger or grant", () => {
    expect(CODE).not.toMatch(/ADD COLUMN|DROP COLUMN/);
    expect(CODE).not.toMatch(/CREATE INDEX|DROP INDEX/);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY/);
    expect(CODE).not.toMatch(/CREATE TRIGGER|DROP TRIGGER/);
    expect(CODE).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
  });

  it("modifies no data", () => {
    // The repair is to the schema and the function bodies. Rewriting rows to fit a
    // vocabulary would be a separate decision with a separate blast radius.
    const bodyStart = CODE.indexOf("CREATE OR REPLACE FUNCTION");
    const outsideBodies = CODE.slice(0, bodyStart);
    expect(outsideBodies).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\s+/m);
  });

  it("is exactly one transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });
});

describe("DEF-034 — reproduces before repairing, and asserts after", () => {
  const PRE = CODE.slice(0, CODE.indexOf("ALTER TABLE public.filings"));
  const POST = CODE.slice(CODE.lastIndexOf("DO $mig$"));

  it("refuses to re-apply if either constraint is already gone", () => {
    expect(PRE).toMatch(/valid_status is already absent/);
    expect(PRE).toMatch(/chk_deadlines_status is already absent/);
  });

  it("refuses to drop if the surviving constraint is missing", () => {
    // Dropping both would leave the column unconstrained — strictly worse than the
    // contradiction being repaired.
    expect(PRE).toMatch(/would leave filings\.status unconstrained/);
    expect(PRE).toMatch(/would leave deadlines\.status unconstrained/);
  });

  it("asserts the safety argument rather than trusting it", () => {
    // Every existing row already satisfies both constraints, so no row can be orphaned by
    // the drop. That argument is sound and still checked.
    expect(PRE).toMatch(/status outside chk_filing_status/);
    expect(PRE).toMatch(/status outside deadlines_status_check/);
  });

  it("reproduces both literal defects before repairing them (Gate 6)", () => {
    expect(PRE).toMatch(/no longer writes revoked_by_system/);
    expect(PRE).toMatch(/no longer writes deadlines\.status = ''open''/);
  });

  it("asserts the states the drop was for are genuinely writable", () => {
    // Asserting a constraint is absent is not the same as asserting a state can be written.
    expect(POST).toMatch(/still cannot be set to submitted/);
    expect(POST).toMatch(/still cannot be set to completed/);
  });

  it("asserts exactly one CHECK now governs filings.status", () => {
    expect(POST).toMatch(/CHECK constraints, expected exactly 1/);
  });

  it("asserts each body was repaired, not truncated", () => {
    expect(POST).toMatch(/still writes revoked_by_system/);
    expect(POST).toMatch(/lost its portal_access write entirely/);
    expect(POST).toMatch(/lost its deadlines write entirely/);
    expect(POST).toMatch(/does not write client_tasks\.visibility = internal_only/);
    expect(POST).toMatch(/does not write client_tasks\.status = not_started/);
  });

  it("asserts no overload was introduced — the DEF-002 failure mode", () => {
    expect(POST).toMatch(/more than one signature/);
  });
});

describe("DEF-034 — the outcome, measured from the generated vocabulary", () => {
  it("leaves no column contradicting itself", () => {
    expect(CONTRADICTORY_COLUMNS.map((v) => `${v.table}.${v.column}`)).toEqual([]);
  });

  it("makes filings.status = submitted writable — the filing critical path", () => {
    expect(DB_VOCABULARY["filings.status"]).toContain("submitted");
    expect(DB_VOCABULARY["filings.status"]).toContain("accepted");
    expect(DB_VOCABULARY["filings.status"]).toContain("ready_for_review");
  });

  it("makes deadlines.status = completed and in_progress writable", () => {
    expect(DB_VOCABULARY["deadlines.status"]).toContain("completed");
    expect(DB_VOCABULARY["deadlines.status"]).toContain("in_progress");
    expect(DB_VOCABULARY["deadlines.status"]).toContain("filed");
  });

  it("keeps the repaired literals inside their vocabularies", () => {
    expect(DB_VOCABULARY["portal_access.status"]).toContain("revoked");
    expect(DB_VOCABULARY["client_tasks.status"]).toContain("not_started");
    expect(DB_VOCABULARY["client_tasks.visibility"]).toContain("internal_only");
    expect(DB_VOCABULARY["deadlines.status"]).toContain("pending");
  });

  it("does not leave the old spellings writable — that would defeat the repair", () => {
    expect(DB_VOCABULARY["portal_access.status"]).not.toContain("revoked_by_system");
    expect(DB_VOCABULARY["client_tasks.visibility"]).not.toContain("internal");
    expect(DB_VOCABULARY["deadlines.status"]).not.toContain("open");
    // `complete` was the newer constraint's spelling of `completed`. Keeping both alive is
    // exactly the drift this work exists to end.
    expect(DB_VOCABULARY["deadlines.status"]).not.toContain("complete");
  });
});
