import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DB_VOCABULARY } from "@/lib/db-constants/vocabularies.generated";

/**
 * DEF-035 — five status literals that no CHECK constraint permits.
 *
 * Every statement repaired here raises 23514 on EVERY call today, so each of these paths has
 * never once succeeded. That is what makes the change behaviour-preserving in the only sense
 * that matters: no statement that currently succeeds can behave differently afterwards,
 * because none of them currently succeeds.
 *
 * The fifth is not a rename. `queue_filing_for_submission` already inserts filing_queue with
 * status 'queued' correctly; the additional `filings.status = 'queued'` UPDATE was a duplicate
 * of that fact in a column whose vocabulary forbids it. Because that UPDATE aborted the
 * transaction, the filing_queue INSERT was rolled back with it — which is why no filing_queue
 * row has ever existed and the CT submission pipeline has never had work to find.
 */
const root = resolve(__dirname, "../../../");
const MIG_NAME = "20260809140000_def_035_status_literal_repairs.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${MIG_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const FUNCS = [
  "create_job_from_template",
  "approve_filing_safe",
  "queue_filing_for_submission",
];

describe("DEF-035 — the repair", () => {
  it("re-issues exactly the three affected functions", () => {
    const created = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION (?:public\.)?(\w+)/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual([...FUNCS].sort());
  });

  it("widens no vocabulary — the repair is to the caller, never to the constraint", () => {
    expect(CODE).not.toMatch(/ADD CONSTRAINT|DROP CONSTRAINT/);
    expect(CODE).not.toMatch(/ADD COLUMN|DROP COLUMN/);
    expect(CODE).not.toMatch(/CREATE INDEX|CREATE POLICY|CREATE TRIGGER/);
    expect(CODE).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
  });

  it("modifies no data", () => {
    const firstBody = CODE.indexOf("CREATE OR REPLACE FUNCTION");
    expect(CODE.slice(0, firstBody)).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\s+/m);
  });

  it("is exactly one transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("removes every forbidden literal from the executable SQL", () => {
    const bodies = CODE.slice(CODE.indexOf("CREATE OR REPLACE FUNCTION"));
    const assertions = bodies.slice(bodies.lastIndexOf("DO $mig$"));
    const justBodies = bodies.slice(0, bodies.lastIndexOf("DO $mig$"));
    expect(justBodies).not.toMatch(/'not_started'/);
    expect(justBodies).not.toMatch(/'medium'/);
    expect(justBodies).not.toMatch(/'approved_by_client'/);
    // The assertions may name them; that is how they detect a failed repair.
    expect(assertions).toMatch(/approved_by_client/);
  });

  it("writes the replacement literals", () => {
    expect(CODE).toMatch(/'blank', 'normal'/);
    expect(CODE).toMatch(/'todo'/);
    expect(CODE).toMatch(/status = 'approved'/);
  });

  it("deletes the duplicate filings.status write rather than renaming it", () => {
    const bodies = CODE.slice(
      CODE.indexOf("CREATE OR REPLACE FUNCTION"),
      CODE.lastIndexOf("DO $mig$"),
    );
    const queueFn = bodies.slice(bodies.indexOf("queue_filing_for_submission"));
    expect(queueFn).not.toMatch(/UPDATE public\.filings/);
    // ...while keeping the statement the function exists to perform.
    expect(queueFn).toMatch(/INSERT INTO public\.filing_queue/);
    expect(queueFn).toMatch(/'queued'/);
    expect(queueFn).toMatch(/idempotency_key/);
  });
});

describe("DEF-035 — reproduces before repairing, and asserts after", () => {
  const PRE = CODE.slice(0, CODE.indexOf("CREATE OR REPLACE FUNCTION"));
  const POST = CODE.slice(CODE.lastIndexOf("DO $mig$"));

  it("reproduces each defect before repairing it (Gate 6)", () => {
    expect(PRE).toMatch(/no longer writes not_started\/medium/);
    expect(PRE).toMatch(/no longer writes approved_by_client/);
    expect(PRE).toMatch(/no longer updates filings/);
  });

  it("asserts every replacement value is ALREADY legal before rewriting anything", () => {
    // Cheaper to check up front than to discover it in a post-assertion after three bodies
    // have been re-issued.
    expect(PRE).toMatch(/jobs\.status does not permit blank/);
    expect(PRE).toMatch(/jobs\.priority does not permit normal/);
    expect(PRE).toMatch(/job_tasks\.status does not permit todo/);
    expect(PRE).toMatch(/filings\.status does not permit approved/);
  });

  it("asserts the bodies were repaired, not truncated", () => {
    expect(POST).toMatch(/lost its jobs INSERT/);
    expect(POST).toMatch(/lost its job_tasks INSERT/);
    expect(POST).toMatch(/lost its filings UPDATE entirely/);
    expect(POST).toMatch(/lost its filing_queue INSERT/);
    expect(POST).toMatch(/lost its idempotency key/);
  });

  it("asserts no vocabulary was widened as a shortcut", () => {
    // The tempting wrong fix for all five: widen the constraint to admit the bad value.
    expect(POST).toMatch(/chk_jobs_status was widened/);
    expect(POST).toMatch(/jobs_priority_check was widened/);
    expect(POST).toMatch(/chk_filing_status was widened/);
  });

  it("asserts no overload was introduced — the DEF-002 failure mode", () => {
    expect(POST).toMatch(/more than one signature/);
  });
});

describe("DEF-035 — the replacements are legal, measured from the generated vocabulary", () => {
  it("every replacement value is permitted by its constraint", () => {
    expect(DB_VOCABULARY["jobs.status"]).toContain("blank");
    expect(DB_VOCABULARY["jobs.priority"]).toContain("normal");
    expect(DB_VOCABULARY["job_tasks.status"]).toContain("todo");
    expect(DB_VOCABULARY["filings.status"]).toContain("approved");
    expect(DB_VOCABULARY["filing_queue.status"]).toContain("queued");
  });

  it("the values being removed remain illegal — this migration widened nothing", () => {
    expect(DB_VOCABULARY["jobs.status"]).not.toContain("not_started");
    expect(DB_VOCABULARY["jobs.priority"]).not.toContain("medium");
    expect(DB_VOCABULARY["job_tasks.status"]).not.toContain("not_started");
    expect(DB_VOCABULARY["filings.status"]).not.toContain("approved_by_client");
    // The ruling this encodes: queue and transport state never live on the filing.
    expect(DB_VOCABULARY["filings.status"]).not.toContain("queued");
  });
});
