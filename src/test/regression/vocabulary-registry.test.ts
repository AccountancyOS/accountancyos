import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  DB_CHECK_VOCABULARIES,
  DB_VOCABULARY,
  CONTRADICTORY_COLUMNS,
  assertVocabulary,
} from "@/lib/db-constants/vocabularies.generated";
import { CHECK_CONSTRAINT_REGISTRY } from "@/lib/db-constants/check-constraints";

/**
 * Vocabulary registry — the enforcement half of the generated vocabulary.
 *
 * THE DEFECT CLASS. DEF-026 (bills UI filtered on `VOID` after the constraint moved to
 * `VOIDED`), DEF-027/028/033 (functions naming columns that do not exist) and the
 * CHECK-violation cluster (functions writing status literals no constraint permits) are one
 * defect wearing four numbers: the same concept has more than one name, and nothing failed
 * when the names diverged. Each was found only after it had shipped, one per fix-cycle,
 * because a runtime error masks the next one.
 *
 * The cure is not to fix them individually. It is to make divergence fail the build.
 * `vocabularies.generated.ts` is derived from the migrations; these tests assert that
 * (a) it is current, (b) the hand-written registry agrees with it, and (c) the schema does
 * not contradict itself.
 */

const root = resolve(__dirname, "../../../");

/**
 * KNOWN VIOLATIONS — a baseline that may only shrink, never grow.
 *
 * These are real defects, found by this test on the day it was written (2026-08-09). They are
 * listed rather than fixed because each needs an owner ruling on what the state machine
 * MEANS, and guessing would encode a wrong answer into the schema. A blanket `.skip` would
 * hide the whole class again; this keeps every one of them named, while letting the 19th
 * violation fail the build the moment it is introduced.
 *
 * Removing an entry here is the definition of done for the corresponding repair.
 * Adding one requires an owner ruling. See docs/audits/2026-08-09-vocabulary-audit.md.
 */
const KNOWN_SCHEMA_CONTRADICTIONS = [
  // Both are the same shape: a November-2025 constraint that was never dropped when its
  // replacement landed, so Postgres enforces both and the difference is unwritable.
  "deadlines.status",
  "filings.status",
] as const;

const KNOWN_LITERAL_VIOLATIONS = [
  // filings.status — blocked on the filing-vocabulary ruling. `queued` in particular may
  // belong on filing_queue.status rather than filings.status; writing submission state onto
  // the filing record conflates the projection with the HMRC transport layer.
  "approve_filing_safe: filings.status = 'approved_by_client'",
  "queue_filing_for_submission: filings.status = 'queued'",
  "regress_filing_status: filings.status = 'ready_for_approval'",
  // jobs.* — the job vocabulary moved from a generic lifecycle (not_started/in_progress) to
  // workflow stages (records_requested/accountant_review/...). These callers were never
  // migrated. Which stage each generic state maps to is a workflow decision.
  "create_job_from_template: jobs.status = 'not_started'",
  "process_questionnaire_submission: jobs.status = 'in_progress'",
  "create_job_from_template: jobs.priority = 'medium'",
  "create_job_from_template: job_tasks.status = 'not_started'",
  "lifecycle_generate_jobs_for_service: jobs.automation_source = 'canonical_spine_v1'",
  // Straightforward renames, held only so the whole class lands under one ruling.
  "lifecycle_accept_portal_invitation: portal_access.status = 'revoked_by_system'",
  "lifecycle_generate_deadlines_for_job: client_tasks.status = 'pending'",
  "lifecycle_generate_deadlines_for_job: client_tasks.visibility = 'internal'",
  "lifecycle_generate_deadlines_for_job: deadlines.status = 'open'",
  "on_cgt_disposal_date_changed: deadlines.deadline_type = 'filing'",
] as const;

/** Registry entries that offer values the schema rejects — all downstream of the above. */
const KNOWN_REGISTRY_DIVERGENCE = new Set([
  "filings.status",
  "deadlines.status",
  "email_queue.status",
]);

describe("vocabulary registry — generated from the schema", () => {
  it("is regenerable and current", () => {
    // If this fails, a migration changed a CHECK constraint and the registry was not
    // regenerated. That gap is exactly how the hand-written registry came to claim
    // email_queue.status permits `cancelled`.
    expect(() =>
      execFileSync("python3", ["scripts/generate-db-vocabulary.py", "--check"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("covers materially more of the schema than the hand-written registry did", () => {
    // Not a vanity metric: the hand-written registry covered 20 columns, so 176 constrained
    // columns had no declared vocabulary at all and every write to them was a guess.
    expect(DB_CHECK_VOCABULARIES.length).toBeGreaterThan(150);
    expect(DB_CHECK_VOCABULARIES.length).toBeGreaterThan(
      CHECK_CONSTRAINT_REGISTRY.length * 5,
    );
  });

  it("exposes the intersection, not one arbitrary constraint", () => {
    for (const v of DB_CHECK_VOCABULARIES) {
      for (const value of v.allowed) {
        for (const c of v.constraints) {
          expect(
            c.values.includes(value),
            `${v.table}.${v.column}: "${value}" is in allowed but ${c.name} forbids it`,
          ).toBe(true);
        }
      }
    }
  });

  it("classifies as unreachable exactly those values no write can use", () => {
    for (const v of DB_CHECK_VOCABULARIES) {
      for (const value of v.unreachable) {
        expect(v.allowed).not.toContain(value);
        // Unreachable means *some* constraint declares it — otherwise it is simply absent.
        expect(v.constraints.some((c) => c.values.includes(value))).toBe(true);
      }
    }
  });
});

describe("vocabulary registry — the hand-written registry must not lie", () => {
  /**
   * `check-constraints.ts` calls itself "the single source of truth". It is hand-maintained,
   * so it can only ever be a claim about the schema. Every claim is checked here.
   */
  for (const entry of CHECK_CONSTRAINT_REGISTRY) {
    it(`${entry.table}.${entry.column} — named constraint is live and values agree`, () => {
      const gen = DB_CHECK_VOCABULARIES.find(
        (v) => v.table === entry.table && v.column === entry.column,
      );
      expect(gen, `${entry.table}.${entry.column} has no CHECK constraint in the schema`)
        .toBeDefined();

      expect(
        gen!.constraints.map((c) => c.name),
        `constraint "${entry.constraint}" is not live on ${entry.table}.${entry.column}`,
      ).toContain(entry.constraint);

      // Every value the registry offers to app code must actually be writable. A value the
      // registry lists but the schema rejects becomes a 23514 at runtime — DEF-026's shape.
      const notWritable = entry.values.filter((v) => !gen!.allowed.includes(v));
      const key = `${entry.table}.${entry.column}`;
      if (KNOWN_REGISTRY_DIVERGENCE.has(key)) {
        // Baselined: this entry is known to diverge, and the divergence is downstream of an
        // unresolved schema contradiction. Assert it is still divergent so the baseline is
        // removed when the repair lands, rather than quietly outliving it.
        expect(notWritable.length, `${key} no longer diverges — drop it from the baseline`)
          .toBeGreaterThan(0);
        return;
      }
      expect(
        notWritable,
        `${key}: registry offers ${JSON.stringify(notWritable)}, ` +
          `which the schema rejects. Writable: ${JSON.stringify(gen!.allowed)}`,
      ).toEqual([]);
    });
  }
});

describe("vocabulary registry — the schema must not contradict itself", () => {
  it("has no column whose live constraints make declared values unwritable", () => {
    // A column carrying two CHECK constraints with different allowed sets is a half-applied
    // design change: someone added the new vocabulary without retiring the old one. The
    // states in the difference are declared, referenced by code, and impossible to write.
    const found = CONTRADICTORY_COLUMNS.map((v) => `${v.table}.${v.column}`);
    const unexpected = found.filter(
      (k) => !KNOWN_SCHEMA_CONTRADICTIONS.includes(k as never),
    );
    expect(
      unexpected,
      "a new self-contradicting column appeared: two live CHECK constraints on one column " +
        "make the difference between them unwritable. Drop the superseded constraint in the " +
        "same migration that adds its replacement.",
    ).toEqual([]);
  });

  it("still has every baselined contradiction — the baseline must not outlive the repair", () => {
    const found = CONTRADICTORY_COLUMNS.map((v) => `${v.table}.${v.column}`);
    const stale = KNOWN_SCHEMA_CONTRADICTIONS.filter((k) => !found.includes(k));
    expect(stale, "fixed — remove these from KNOWN_SCHEMA_CONTRADICTIONS").toEqual([]);
  });
});

describe("vocabulary registry — status literals in SQL functions must be writable", () => {
  /**
   * The CHECK-violation cluster: a live PL/pgSQL function assigns a status literal that no
   * constraint permits, so every call raises 23514. Statically visible; invisible at runtime
   * until the path is exercised — and several of these paths (filing approval, job creation)
   * had never been exercised.
   *
   * Delegated to scripts/audit-check-violations.py rather than re-scanning the SQL here.
   * That script resolves each function to its LAST definition, which is the distinction that
   * matters: `bills.status = 'VOID'` appears in migrations from 2025-12, but only inside
   * function bodies that were later replaced. Scanning raw migration text instead would
   * report every superseded definition as a live defect and drown the real ones.
   */
  it("no live function assigns a status literal the schema forbids", () => {
    const out = execFileSync("python3", ["scripts/audit-check-violations.py"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const findings = JSON.parse(out).findings as Array<{
      function: string;
      table: string;
      column: string;
      literal: string;
    }>;

    const found = [
      ...new Set(
        findings.map((f) => `${f.function}: ${f.table}.${f.column} = '${f.literal}'`),
      ),
    ].sort();

    const unexpected = found
      .filter((k) => !KNOWN_LITERAL_VIOLATIONS.includes(k as never))
      .map((k) => {
        const m = k.match(/: (\w+)\.(\w+) =/);
        const allowed = m ? (DB_VOCABULARY[`${m[1]}.${m[2]}`] ?? []) : [];
        return `${k} (allowed: ${allowed.join(", ")})`;
      });

    expect(
      unexpected,
      "a function assigns a status literal no CHECK constraint permits — every call will " +
        "raise 23514. Import the vocabulary from vocabularies.generated.ts instead of " +
        "hardcoding the literal.",
    ).toEqual([]);
  });

  it("still has every baselined literal violation", () => {
    const out = execFileSync("python3", ["scripts/audit-check-violations.py"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    const found = new Set(
      (JSON.parse(out).findings as Array<Record<string, string>>).map(
        (f) => `${f.function}: ${f.table}.${f.column} = '${f.literal}'`,
      ),
    );
    const stale = KNOWN_LITERAL_VIOLATIONS.filter((k) => !found.has(k));
    expect(stale, "fixed — remove these from KNOWN_LITERAL_VIOLATIONS").toEqual([]);
  });
});

describe("vocabulary registry — assertVocabulary", () => {
  it("accepts a writable value", () => {
    const sample = DB_CHECK_VOCABULARIES.find((v) => v.allowed.length > 0)!;
    expect(() =>
      assertVocabulary(sample.table, sample.column, sample.allowed[0]),
    ).not.toThrow();
  });

  it("rejects an unwritable value and names the legal set", () => {
    const sample = DB_CHECK_VOCABULARIES.find((v) => v.allowed.length > 0)!;
    expect(() => assertVocabulary(sample.table, sample.column, "__not_a_status__")).toThrow(
      /Allowed:/,
    );
  });

  it("stays silent on columns that carry no constraint, rather than guessing", () => {
    // Enforcing a vocabulary we never derived would reject legitimate writes.
    expect(() => assertVocabulary("no_such_table", "no_such_column", "anything")).not.toThrow();
  });
});
