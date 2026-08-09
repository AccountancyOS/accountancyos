import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vocabulary enforcement over the APPLICATION surface — src/** and supabase/functions/**.
 *
 * WHY THIS EXISTS. The migration-scoped sweep (vocabulary-registry.test.ts) covers CHECK
 * constraints and PL/pgSQL bodies. It has never looked at application code, and application
 * code is where most real transitions happen. Extending it found 58 violations in 710 files,
 * including whole subsystems that cannot have worked:
 *
 *   - Every HMRC CT600 artefact write names an artefact_type outside the vocabulary, so no
 *     submission, acknowledgement, poll or delete XML has ever been stored.
 *   - The automation workflow engine writes lowercase (`running`, `waiting`, `failed`) at a
 *     column constrained to UPPER (`RUNNING`, `WAITING`, `FAILED`).
 *   - CoSec register events write `officer_appointed`/`officer_resigned`/`shares_allotted`
 *     where the vocabulary is `appointment`/`resignation`/`allotment`.
 *   - `bookkeeping-kpi.ts` still filters bills and invoices on `VOID`. That is DEF-026's
 *     original defect, repaired in the UI and still live in a reader.
 *
 * READERS ARE PART OF THE CONTRACT. A legal writer and an impossible reader break a workflow
 * just as completely as an invalid write — and the reader fails silently, returning zero rows
 * rather than raising. The case that proves it: `filing_queue.status` permits
 * queued/processing/completed/failed/cancelled, and both CT pollers select
 * `.eq('status','pending')`. Nothing legal ever writes `pending`, so the pollers can never
 * find work. A CT600 can be submitted to HMRC and acknowledged, and the poll job that would
 * reconcile it is never created. No error, no log, no test — until this one.
 */

const root = resolve(__dirname, "../../../");

interface Finding {
  kind: string;
  file: string;
  line: number;
  table: string;
  column: string;
  literal: string;
  allowed: string[];
  snippet: string;
}

function sweep(): Finding[] {
  const out = execFileSync("python3", ["scripts/audit-app-vocabulary.py"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out).findings as Finding[];
}

/**
 * Identity of a finding, deliberately excluding the line number: line numbers churn on
 * unrelated edits, but the defect is the same defect. Moving a bad literal down a file must
 * not read as "fixed one, introduced one".
 */
const key = (f: Finding) => [f.kind, f.file, f.table, f.column, f.literal].join("|");

const baseline = JSON.parse(
  readFileSync(resolve(root, "src/test/regression/fixtures/app-vocabulary-baseline.json"), "utf8"),
) as { count: number; known: string[] };

/**
 * THE RATCHET. The baseline may only ever shrink.
 *
 * Pinned as a literal, deliberately. Reading the ceiling from the baseline file itself would
 * make it self-justifying: anyone appending an entry would also move the limit, and the
 * "baseline that may only shrink" would quietly become a baseline that grows. Lowering this
 * number is part of fixing a defect. Raising it requires an owner ruling and is the only
 * reason to touch this line.
 */
const BASELINE_CEILING = 51;

describe("vocabulary — application write surface", () => {
  const findings = sweep();

  it("introduces no new invalid literal", () => {
    const known = new Set(baseline.known);
    const added = findings
      .filter((f) => !known.has(key(f)))
      .map((f) => `${f.file}:${f.line} — ${f.table}.${f.column} = '${f.literal}' (allowed: ${f.allowed.join(", ")})`);

    expect(
      added.sort(),
      "a new value was written to, or read from, a constrained column that cannot hold it. " +
        "Import the vocabulary from src/lib/db-constants/vocabularies.generated.ts instead of " +
        "hardcoding the literal.",
    ).toEqual([]);
  });

  it("never grows the baseline — the ratchet", () => {
    // Distinct from the test above. That one catches a new *finding*; this one catches a new
    // *baseline entry*, which is how a finding gets silenced rather than fixed. Both are
    // needed: without this, the documented way to make the suite green is to append a line.
    expect(
      baseline.known.length,
      `the baseline may only shrink. It has ${baseline.known.length} entries against a ceiling ` +
        `of ${BASELINE_CEILING}. If a violation was fixed, lower BASELINE_CEILING to match. ` +
        `Raising it silences a defect and requires an owner ruling.`,
    ).toBeLessThanOrEqual(BASELINE_CEILING);

    // The file's own self-reported count must agree, or the ratchet can be evaded by editing
    // one and not the other.
    expect(baseline.count).toBe(baseline.known.length);
  });

  it("has no duplicate baseline entries", () => {
    // A duplicated key would let one real fix appear to satisfy two baselined defects.
    expect(new Set(baseline.known).size).toBe(baseline.known.length);
  });

  it("keeps the baseline honest — every recorded violation still exists", () => {
    // A baseline that outlives its defects is worse than none: it silently grants permission
    // for the value to come back.
    const seen = new Set(findings.map(key));
    const stale = baseline.known.filter((k) => !seen.has(k));
    expect(
      stale,
      "fixed — regenerate src/test/regression/fixtures/app-vocabulary-baseline.json",
    ).toEqual([]);
  });

  it("scans both application roots, not just one", () => {
    // A sweep that silently stopped covering the edge functions would report zero findings and
    // look like success. Assert the surface, not only the result.
    const roots = new Set(findings.map((f) => f.file.split("/").slice(0, 2).join("/")));
    expect([...roots]).toContain("supabase/functions");
    expect([...roots].some((r) => r.startsWith("src/"))).toBe(true);
  });

  it("treats impossible readers as findings, not only writers", () => {
    expect(findings.some((f) => f.kind === "read_impossible_literal")).toBe(true);
  });

  it("still catches the filing_queue reader that stops the CT pipeline", () => {
    // The specific defect this sweep was built to make visible. If it ever stops being
    // reported, either it was fixed (remove it from the baseline) or the detector regressed.
    const pollers = findings.filter(
      (f) =>
        f.table === "filing_queue" &&
        f.column === "status" &&
        f.literal === "pending" &&
        f.kind === "read_impossible_literal",
    );
    expect(pollers.map((f) => f.file).sort()).toEqual([
      "supabase/functions/hmrc-ct-delete/index.ts",
      "supabase/functions/hmrc-ct-poll/index.ts",
    ]);
  });
});

describe("vocabulary — the parser's known blind spots stay closed", () => {
  it("passes every parser regression fixture", () => {
    // Each fixture is a bug found in production data. They matter more than they look: an
    // inflated column set never produces a FALSE finding, it MASKS a real one, so these
    // failures are invisible by construction and only fixtures catch them.
    const out = execFileSync("python3", ["scripts/test-vocabulary-parser.py"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(out).toMatch(/parser fixtures passed/);
  });

  it("keeps every blind-spot fixture, so a regression cannot be hidden by deleting one", () => {
    const src = readFileSync(resolve(root, "scripts/test-vocabulary-parser.py"), "utf8");
    for (const anchor of [
      "trailing comment does not leak",
      "comma inside a string literal",
      "UNIQUE written without a space",
      "escaped quote",
      "block comments are removed",
      "DROP CONSTRAINT retires a constraint",
      "drop-then-re-add",
      "auto name",
      "= ANY (ARRAY",
      "two live constraints on one column",
    ]) {
      expect(src, `fixture removed: ${anchor}`).toContain(anchor);
    }
  });

  it("produces no column name that is not a valid SQL identifier", () => {
    // The symptom every blind spot shared. Zero is the only acceptable count.
    const out = execFileSync(
      "python3",
      [
        "-c",
        [
          "import importlib.util,re",
          "spec=importlib.util.spec_from_file_location('av','scripts/audit-vocabulary.py')",
          "m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
          "t,_=m.replay()",
          "bad=[(k,x) for k,v in t.items() for x in v if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',x)]",
          "print(len(bad), bad[:5])",
        ].join("\n"),
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    expect(out.trim().startsWith("0 ")).toBe(true);
  });
});
