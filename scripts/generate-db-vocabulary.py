#!/usr/bin/env python3
"""
Generate the canonical DB vocabulary from the migrations, so it cannot drift.

WHY THIS EXISTS. `src/lib/db-constants/check-constraints.ts` was written as "the single
source of truth for every constrained status/enum-like column". It is hand-maintained, and
it has drifted: it covers 20 of ~198 constrained columns, and several of the 20 disagree
with the constraint they claim to mirror (it declares `email_queue.status` permits
`cancelled`, which no live constraint allows, and omits `draft`, `queued` and `ignored`,
which they do). A hand-maintained mirror of the schema will always drift, because nothing
fails when it does.

This emits the vocabulary from the migrations themselves. The regression test regenerates
and diffs, so drift becomes a failing build rather than a runtime 23514.

THE INTERSECTION IS THE POINT. Several columns carry more than one live CHECK constraint.
Postgres enforces ALL of them, so the genuinely writable set is the INTERSECTION, not the
union and not whichever constraint someone happened to read. `filings.status` declares 13
values across two live constraints but only 6 satisfy both — and `approve_filing_safe`
writes one of the 7 that cannot be written. Nothing in the codebase computed that until now.

Usage:  python3 scripts/generate-db-vocabulary.py            # write the file
        python3 scripts/generate-db-vocabulary.py --check    # exit 1 if it would change
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "src", "lib", "db-constants",
                   "vocabularies.generated.ts")


def load_replay():
    """Reuse the audit script's replay so there is exactly one parser, not two."""
    path = os.path.join(HERE, "audit-vocabulary.py")
    spec = importlib.util.spec_from_file_location("audit_vocabulary", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def ts_str(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build():
    mod = load_replay()
    _tables, checks = mod.replay()

    by_col = {}
    for c in checks:
        by_col.setdefault((c["table"], c["column"]), []).append(c)

    entries = []
    for (table, column), cs in sorted(by_col.items()):
        cs = sorted(cs, key=lambda x: x["constraint"])
        sets = [set(c["allowed"]) for c in cs]
        allowed = sorted(set.intersection(*sets))
        union = sorted(set.union(*sets))
        entries.append({
            "table": table,
            "column": column,
            "constraints": [{"name": c["constraint"], "values": c["allowed"],
                             "migration": c["migration"]} for c in cs],
            "allowed": allowed,
            "unreachable": sorted(set(union) - set(allowed)),
        })
    return entries


HEADER = '''/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source:     supabase/migrations/*.sql (replayed in order, honouring DROP CONSTRAINT)
 * Generator:  scripts/generate-db-vocabulary.py
 * Regenerate: python3 scripts/generate-db-vocabulary.py
 * Enforced by: src/test/regression/vocabulary-registry.test.ts
 *
 * This is the canonical vocabulary of every CHECK-constrained column in the database.
 * It replaces guesswork and hand-copied string literals, which produced DEF-026 (the bills
 * UI filtered on `VOID` after the constraint had moved to `VOIDED`) and the CHECK-violation
 * cluster (functions writing status literals no constraint permits).
 *
 * READ `allowed`, NOT `constraints[n].values`.
 *
 * A column may carry several live CHECK constraints. Postgres enforces every one of them,
 * so the writable set is their INTERSECTION. Reading a single constraint is how a value
 * comes to look legal while being rejected at runtime — `unreachable` lists exactly those
 * values: declared by at least one constraint, forbidden by another, writable by nobody.
 * A non-empty `unreachable` is a schema defect, not a feature.
 */

export interface DbCheckConstraint {
  /** Exact Postgres constraint name. */
  readonly name: string;
  /** Values this one constraint permits. */
  readonly values: readonly string[];
  /** Migration that last defined it. */
  readonly migration: string;
}

export interface DbColumnVocabulary {
  readonly table: string;
  readonly column: string;
  /** Every live CHECK constraint on this column. */
  readonly constraints: readonly DbCheckConstraint[];
  /** Values permitted by ALL live constraints. This is what you may write. */
  readonly allowed: readonly string[];
  /** Declared by one constraint, forbidden by another. Writable by nobody. */
  readonly unreachable: readonly string[];
}

'''

FOOTER = '''
/** Lookup by `"table.column"` — the values you may actually write. */
export const DB_VOCABULARY: Readonly<Record<string, readonly string[]>> =
  Object.freeze(
    Object.fromEntries(
      DB_CHECK_VOCABULARIES.map((v) => [`${v.table}.${v.column}`, v.allowed]),
    ),
  );

/** Columns whose live constraints contradict each other. Should be empty; see the test. */
export const CONTRADICTORY_COLUMNS: readonly DbColumnVocabulary[] =
  DB_CHECK_VOCABULARIES.filter((v) => v.unreachable.length > 0);

/**
 * Assert a value is writable, at the point of writing, with a message that names the
 * legal set. Cheaper than a 23514 from Postgres, which names the constraint but not the
 * vocabulary, and arrives after the transaction has already done work.
 */
export function assertVocabulary(
  table: string,
  column: string,
  value: string,
): void {
  const allowed = DB_VOCABULARY[`${table}.${column}`];
  if (!allowed) return; // Column carries no CHECK constraint; nothing to enforce.
  if (!allowed.includes(value)) {
    throw new Error(
      `${table}.${column} cannot be "${value}". Allowed: ${allowed.join(", ")}.`,
    );
  }
}
'''


def render(entries):
    lines = [HEADER, "export const DB_CHECK_VOCABULARIES: readonly DbColumnVocabulary[] = ["]
    for e in entries:
        lines.append("  {")
        lines.append(f"    table: {ts_str(e['table'])},")
        lines.append(f"    column: {ts_str(e['column'])},")
        lines.append("    constraints: [")
        for c in e["constraints"]:
            vals = ", ".join(ts_str(v) for v in c["values"])
            lines.append(
                f"      {{ name: {ts_str(c['name'])}, values: [{vals}], "
                f"migration: {ts_str(c['migration'])} }},")
        lines.append("    ],")
        lines.append(f"    allowed: [{', '.join(ts_str(v) for v in e['allowed'])}],")
        lines.append(f"    unreachable: [{', '.join(ts_str(v) for v in e['unreachable'])}],")
        lines.append("  },")
    lines.append("] as const;")
    lines.append(FOOTER)
    return "\n".join(lines)


def main():
    if not os.path.isdir("supabase/migrations"):
        sys.exit("run from the repo root")

    entries = build()
    text = render(entries)

    if "--check" in sys.argv:
        current = open(OUT, encoding="utf8").read() if os.path.exists(OUT) else ""
        if current != text:
            sys.exit("vocabularies.generated.ts is stale — run "
                     "`python3 scripts/generate-db-vocabulary.py`")
        print(f"up to date: {len(entries)} constrained columns")
        return

    if "--json" in sys.argv:
        print(json.dumps(entries, indent=1))
        return

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as fh:
        fh.write(text)
    bad = [e for e in entries if e["unreachable"]]
    print(f"wrote {OUT}: {len(entries)} constrained columns, "
          f"{len(bad)} with contradictory constraints")
    for e in bad:
        print(f"  CONTRADICTION {e['table']}.{e['column']}: "
              f"unreachable {e['unreachable']}")


if __name__ == "__main__":
    main()
