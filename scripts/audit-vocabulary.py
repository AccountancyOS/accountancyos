#!/usr/bin/env python3
"""
Vocabulary audit — the root cause behind DEF-026/027/028/033 and the CHECK-violation cluster.

Those were not independent defects. They were one defect: the same concept has more than one
name, and nothing in the codebase declares which name wins. `performed_by` vs `actor_id`.
`payload` vs `metadata`. `VOID` vs `VOIDED`. `not_started` vs `NOT_STARTED`.

This script measures the drift rather than asserting it. It replays every migration and reports:

  1. STATUS CASING     — status vocabularies that mix UPPER_SNAKE and lower_snake across tables.
  2. RIVAL COLUMNS     — one concept, several column names, across tables (actor/created/performed).
  3. SPLIT VOCABULARY  — one column name whose allowed values differ table to table.
  4. DUPLICATE CHECKS  — two CHECK constraints on the same column with different allowed sets,
                         which is how a literal can be simultaneously legal and illegal.

Output is JSON. It asserts nothing about what the convention SHOULD be; it shows what it IS,
so the convention can be chosen from evidence and then enforced by test.
"""
import re
import os
import json
import sys
from collections import defaultdict

MIG_DIR = "supabase/migrations"

# ---------------------------------------------------------------------------------------
# Replay: table -> columns, and every CHECK constraint that pins a column to a literal set.
# ---------------------------------------------------------------------------------------

CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(", re.I)
ADD_COLUMN = re.compile(
    r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?(\w+)\s+(.*?);", re.I | re.S)
ADD_COL_ONE = re.compile(r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)", re.I)
DROP_COL_ONE = re.compile(r"DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)", re.I)

# CHECK (col IN ('a','b')) / CHECK (col = ANY (ARRAY['a','b'])) — with or without casts.
CHECK_IN = re.compile(
    r"CHECK\s*\(\s*\(?\s*(\w+)\s*(?:::\s*text\s*)?"
    r"(?:IN\s*\(|=\s*ANY\s*\(\s*(?:\(\s*)?ARRAY\s*\[)([^\]\)]*)", re.I)
CONSTRAINT_NAME = re.compile(r"CONSTRAINT\s+(\w+)\s+CHECK", re.I)
LITERAL = re.compile(r"'([^']*)'")


def strip_comments(sql):
    """
    Remove `--` line comments and `/* */` blocks, but NEVER inside a string literal.

    Stripping only comments that start a line is not enough: a trailing comment such as
    `journal_type TEXT DEFAULT 'MANUAL', -- MANUAL, REVERSING, YEAR_END` survives, and the
    CREATE TABLE splitter then reads `MANUAL`, `REVERSING` and `YEAR_END` as column names.
    Inflated column sets do not create false "missing column" findings — they do the more
    dangerous thing and MASK real ones.

    Naively stripping every `--` would corrupt any literal containing one, so this scans.
    """
    out, i, n = [], 0, len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'":
            out.append(ch)
            i += 1
            while i < n:
                out.append(sql[i])
                if sql[i] == "'":
                    if i + 1 < n and sql[i + 1] == "'":   # escaped quote
                        out.append(sql[i + 1])
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            continue
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            while i < n and sql[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and sql[i + 1] == "*":
            end = sql.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def split_top_level(s):
    """Split a CREATE TABLE body on commas that are not inside parentheses."""
    out, depth, cur = [], 0, []
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return out


def body_of(src, open_paren_idx):
    depth, i = 0, open_paren_idx
    while i < len(src):
        if src[i] == "(":
            depth += 1
        elif src[i] == ")":
            depth -= 1
            if depth == 0:
                return src[open_paren_idx + 1:i]
        i += 1
    return ""


DROP_CONSTRAINT = re.compile(r"DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\w+)", re.I)


def replay():
    """
    Replay migrations IN ORDER, applying adds AND drops.

    Tracking drops is not optional. 51 DROP CONSTRAINT statements exist across the history,
    and a replay that ignores them reports long-dead constraints as live — which inverts the
    conclusion, turning a superseded constraint into an apparent contradiction.

    Constraints are keyed by (table, name). An unnamed inline CHECK in CREATE TABLE takes
    Postgres's auto-generated name, `<table>_<column>_check`, which is exactly the name the
    later DROP statements use — so the two must agree or drops silently miss.
    """
    tables = defaultdict(set)          # table -> {column}
    live = {}                          # (table, constraint) -> {column, allowed, migration}
    files = sorted(f for f in os.listdir(MIG_DIR) if f.endswith(".sql"))

    for fn in files:
        src = open(os.path.join(MIG_DIR, fn), encoding="utf8", errors="replace").read()
        # Strip comments so commented-out DDL is never replayed and trailing comments never
        # leak into a CREATE TABLE column list.
        src = strip_comments(src)

        # Build a position-ordered event list so a drop-then-re-add in one file resolves
        # the way Postgres would rather than the way the regexes happen to be ordered.
        events = []

        for m in CREATE_TABLE.finditer(src):
            events.append((m.start(), "create_table", m))
        for m in ADD_COLUMN.finditer(src):
            events.append((m.start(), "alter_table", m))

        for _, kind, m in sorted(events, key=lambda e: e[0]):
            if kind == "create_table":
                table = m.group(1)
                body = body_of(src, m.end() - 1)
                for part in split_top_level(body):
                    part = part.strip()
                    if not part:
                        continue
                    head = part.split()[0].upper() if part.split() else ""
                    if head not in ("CONSTRAINT", "PRIMARY", "FOREIGN",
                                    "UNIQUE", "CHECK", "EXCLUDE"):
                        tables[table].add(part.split()[0].strip('"'))
                    for c in CHECK_IN.finditer(part):
                        allowed = sorted(set(LITERAL.findall(c.group(2))))
                        if not allowed:
                            continue
                        nm = CONSTRAINT_NAME.search(part)
                        name = nm.group(1) if nm else f"{table}_{c.group(1)}_check"
                        live[(table, name)] = {"table": table, "constraint": name,
                                               "column": c.group(1), "allowed": allowed,
                                               "migration": fn}
            else:
                table, rest = m.group(1), m.group(2)
                for c in ADD_COL_ONE.finditer(rest):
                    tables[table].add(c.group(1).strip('"'))
                for c in DROP_COL_ONE.finditer(rest):
                    tables[table].discard(c.group(1).strip('"'))
                # Drops first: an ALTER that drops and re-adds the same name is a redefinition.
                for c in DROP_CONSTRAINT.finditer(rest):
                    live.pop((table, c.group(1)), None)
                for c in CHECK_IN.finditer(rest):
                    allowed = sorted(set(LITERAL.findall(c.group(2))))
                    if not allowed:
                        continue
                    nm = CONSTRAINT_NAME.search(rest)
                    name = nm.group(1) if nm else f"{table}_{c.group(1)}_check"
                    live[(table, name)] = {"table": table, "constraint": name,
                                           "column": c.group(1), "allowed": allowed,
                                           "migration": fn}

    return tables, list(live.values())


# ---------------------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------------------

def casing(v):
    if re.fullmatch(r"[A-Z0-9_]+", v):
        return "UPPER"
    if re.fullmatch(r"[a-z0-9_]+", v):
        return "lower"
    return "mixed"


def find_status_casing(checks):
    """Which status vocabularies are UPPER, which lower, and which mix within one table."""
    by_col = defaultdict(list)
    for c in checks:
        by_col[(c["table"], c["column"])].append(c)

    upper, lower, mixed = [], [], []
    for (table, col), cs in sorted(by_col.items()):
        vals = sorted({v for c in cs for v in c["allowed"]})
        kinds = {casing(v) for v in vals}
        row = {"table": table, "column": col, "allowed": vals,
               "constraints": sorted({c["constraint"] for c in cs})}
        if kinds == {"UPPER"}:
            upper.append(row)
        elif kinds == {"lower"}:
            lower.append(row)
        else:
            mixed.append(row)
    return upper, lower, mixed


def find_duplicate_checks(checks):
    """Two live CHECKs on the same column with different allowed sets — the DEF-026 shape."""
    by_col = defaultdict(list)
    for c in checks:
        by_col[(c["table"], c["column"])].append(c)

    out = []
    for (table, col), cs in sorted(by_col.items()):
        names = {c["constraint"] for c in cs}
        if len(names) < 2:
            continue
        sets = {c["constraint"]: c["allowed"] for c in cs}
        distinct = {tuple(v) for v in sets.values()}
        if len(distinct) > 1:
            union = sorted({v for vs in sets.values() for v in vs})
            effective = sorted(set.intersection(*(set(v) for v in sets.values())))
            out.append({
                "table": table, "column": col,
                "constraints": sets,
                "declared_union": union,
                "effectively_allowed": effective,
                "unreachable": sorted(set(union) - set(effective)),
            })
    return out


def find_split_vocabulary(checks):
    """One column NAME, different allowed values across tables. `status` is the obvious one."""
    by_name = defaultdict(dict)
    for c in checks:
        by_name[c["column"]].setdefault(c["table"], set()).update(c["allowed"])

    out = []
    for col, per_table in sorted(by_name.items()):
        if len(per_table) < 2:
            continue
        kinds = {casing(v) for vs in per_table.values() for v in vs}
        if len(kinds) > 1:
            out.append({
                "column": col,
                "tables": {t: sorted(v) for t, v in sorted(per_table.items())},
                "casings_in_use": sorted(kinds),
            })
    return out


# One concept, several column names. Each group is a concept; the names are what we found
# it called. This list is curated deliberately — a purely mechanical guess would produce
# noise, and the point is to decide a canonical name, not to flag every similar string.
CONCEPTS = {
    "who performed the action": ["actor_id", "performed_by", "created_by", "user_id",
                                 "updated_by", "submitted_by", "approved_by", "posted_by"],
    "free-form structured detail": ["metadata", "payload", "details", "data", "context"],
    "soft-delete / enabled flag": ["is_active", "active", "is_enabled", "enabled",
                                   "is_archived", "archived", "deleted_at", "is_deleted"],
    "when it happened": ["created_at", "occurred_at", "performed_at", "logged_at",
                         "recorded_at", "timestamp"],
    "why": ["reason", "notes", "note", "comment", "description", "memo"],
}


def find_rival_columns(tables):
    out = []
    for concept, names in CONCEPTS.items():
        present = defaultdict(list)
        for table, cols in tables.items():
            hits = sorted(n for n in names if n in cols)
            if len(hits) > 1:
                present[tuple(hits)].append(table)
        # Also: the same concept spelled differently across tables.
        spread = defaultdict(list)
        for table, cols in tables.items():
            for n in names:
                if n in cols:
                    spread[n].append(table)
        if len(spread) > 1:
            out.append({
                "concept": concept,
                "names_in_use": {n: len(t) for n, t in sorted(spread.items(),
                                                             key=lambda x: -len(x[1]))},
                "tables_carrying_two_or_more": {", ".join(k): sorted(v)
                                                for k, v in sorted(present.items())},
            })
    return out


def main():
    if not os.path.isdir(MIG_DIR):
        sys.exit(f"run from the repo root: {MIG_DIR} not found")

    tables, checks = replay()

    upper, lower, mixed = find_status_casing(checks)
    report = {
        "tables": len(tables),
        "check_constraints": len(checks),
        "status_casing": {
            "upper_only": len(upper),
            "lower_only": len(lower),
            "mixed_within_one_column": mixed,
            "upper_columns": upper,
            "lower_columns": lower,
        },
        "duplicate_checks_same_column": find_duplicate_checks(checks),
        "split_vocabulary_across_tables": find_split_vocabulary(checks),
        "rival_column_names": find_rival_columns(tables),
    }
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
