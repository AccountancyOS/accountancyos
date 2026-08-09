#!/usr/bin/env python3
"""
Static defect sweep -- DEF-026 class: a PL/pgSQL function writes a STRING LITERAL
into a column whose CHECK constraint forbids that value. Every call raises 23514.

Known instance: approve_bill_safe SET status='APPROVED' vs bills_status_check.

Method mirrors scripts/audit-phantom-columns.py: replay migrations in filename order
to build table -> col -> allowed literal set (last constraint definition wins,
DROP CONSTRAINT removes), extract the LAST definition of each function, then check
INSERT ... VALUES literals and UPDATE SET col='lit' against the allowed sets.

Regex-based: CANDIDATE FINDER, not an oracle. Every hit verified by hand.
"""
import re, os, json
from collections import OrderedDict

MIG = "supabase/migrations"
files = sorted(f for f in os.listdir(MIG) if f.endswith(".sql"))

def strip_comments(sql):
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql

def split_top_level(s, sep=","):
    out, depth, cur, i = [], 0, "", 0
    inq = False
    while i < len(s):
        ch = s[i]
        if inq:
            cur += ch
            if ch == "'":
                if i + 1 < len(s) and s[i+1] == "'":
                    cur += s[i+1]; i += 2; continue
                inq = False
            i += 1; continue
        if ch == "'":
            inq = True; cur += ch; i += 1; continue
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        if ch == sep and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
        i += 1
    if cur.strip(): out.append(cur)
    return out

def body_of_parens(sql, start):
    """start = index of '('. Returns (inner, index_after_close). Quote-aware."""
    depth, i, inq = 0, start, False
    while i < len(sql):
        ch = sql[i]
        if inq:
            if ch == "'":
                if i + 1 < len(sql) and sql[i+1] == "'":
                    i += 2; continue
                inq = False
            i += 1; continue
        if ch == "'":
            inq = True; i += 1; continue
        if ch == "(": depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return sql[start+1:i], i+1
        i += 1
    return None, len(sql)

# ------------------------------------------------------- CHECK expression parsing
# col IN ('a','b')   |   col = ANY (ARRAY['a','b'])   |   col = 'a'
IN_TERM = re.compile(
    r"\(?\s*\"?(\w+)\"?\s*(?:::\s*\w+)?\s*(?:=\s*ANY\s*\(\s*(?:ARRAY)?\s*\[|IN\s*\()", re.I)

LIT = re.compile(r"'((?:[^']|'')*)'")

def parse_check(expr):
    """Return {col: set(values)} if the whole expression is an AND-conjunction of
    membership tests we can read; else None (too complex to trust)."""
    e = expr.strip()
    while e.startswith("(") and body_of_parens(e, 0)[1] == len(e):
        e = e[1:-1].strip()
    # top-level OR => conditional constraint, not a flat allow-list. Bail.
    if re.search(r"\bOR\b", strip_strings(e), re.I):
        return None
    out = {}
    for m in IN_TERM.finditer(e):
        col = m.group(1).lower()
        if col in ("array", "any", "value"):
            continue
        open_idx = e.rfind("(", m.start(), m.end()) if "IN" in m.group(0).upper() else None
        # find the bracket/paren that opens the value list
        j = m.end() - 1
        opener = e[j]
        closer = ")" if opener == "(" else "]"
        depth, k, inq = 0, j, False
        inner = None
        while k < len(e):
            ch = e[k]
            if inq:
                if ch == "'":
                    if k + 1 < len(e) and e[k+1] == "'":
                        k += 2; continue
                    inq = False
                k += 1; continue
            if ch == "'":
                inq = True; k += 1; continue
            if ch in "([": depth += 1
            elif ch in ")]":
                depth -= 1
                if depth == 0:
                    inner = e[j+1:k]; break
            k += 1
        if inner is None:
            continue
        vals = set()
        ok = True
        for part in split_top_level(inner):
            p = part.strip()
            p = re.sub(r"::\s*[\w\.]+(\[\])?", "", p).strip()
            lm = LIT.fullmatch(p)
            if lm:
                vals.add(lm.group(1).replace("''", "'"))
            else:
                ok = False   # non-literal member (subquery, column ref)
        if ok and vals:
            out.setdefault(col, set())
            out[col] |= vals
    return out or None

def strip_strings(s):
    return re.sub(r"'(?:[^']|'')*'", "''", s)

# ------------------------------------------------------- migration replay
# table -> constraint_name -> {"cols": {col:set}, "mig": fn}
constraints = {}

CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
DROP_TBL = re.compile(
    r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?(\w+)\"?", re.I)
ALTER = re.compile(
    r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?\"?(\w+)\"?", re.I)

def register(tbl, cname, parsed, fn):
    if not parsed:
        return
    constraints.setdefault(tbl, OrderedDict())
    constraints[tbl][cname] = {"cols": parsed, "mig": fn}

def handle_check_text(tbl, chunk, fn, default_prefix):
    """Find CONSTRAINT n CHECK(...) / bare CHECK(...) inside chunk and register."""
    for m in re.finditer(r"(?:CONSTRAINT\s+\"?(\w+)\"?\s+)?\bCHECK\s*\(", chunk, re.I):
        inner, _ = body_of_parens(chunk, m.end() - 1)
        if inner is None:
            continue
        parsed = parse_check(inner)
        if not parsed:
            continue
        name = m.group(1)
        if name:
            register(tbl, name.lower(), parsed, fn)
        else:
            # postgres auto-name for a single-column check
            for col in parsed:
                register(tbl, f"{default_prefix}_{col}_check", {col: parsed[col]}, fn)

for fn in files:
    sql = strip_comments(open(os.path.join(MIG, fn), encoding="utf8", errors="replace").read())

    for m in CREATE_TABLE.finditer(sql):
        tbl = m.group(1).lower()
        inner, _ = body_of_parens(sql, m.end() - 1)
        if inner is None:
            continue
        handle_check_text(tbl, inner, fn, tbl)

    for m in DROP_TBL.finditer(sql):
        constraints.pop(m.group(1).lower(), None)

    # ALTER TABLE statements: split the file into statements first
    for stmt in split_top_level(sql, ";"):
        am = ALTER.search(stmt)
        if not am:
            continue
        tbl = am.group(1).lower()
        for d in re.finditer(r"DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?\"?(\w+)\"?", stmt, re.I):
            if tbl in constraints:
                constraints[tbl].pop(d.group(1).lower(), None)
        for a in re.finditer(r"ADD\s+CONSTRAINT\s+\"?(\w+)\"?\s+CHECK\s*\(", stmt, re.I):
            inner, _ = body_of_parens(stmt, a.end() - 1)
            if inner is None:
                continue
            register(tbl, a.group(1).lower(), parse_check(inner), fn)
        # ALTER TABLE t ADD CHECK (...)  (unnamed)
        for a in re.finditer(r"ADD\s+CHECK\s*\(", stmt, re.I):
            inner, _ = body_of_parens(stmt, a.end() - 1)
            if inner is None:
                continue
            p = parse_check(inner)
            if p:
                for col in p:
                    register(tbl, f"{tbl}_{col}_check", {col: p[col]}, fn)

# collapse to table -> col -> (allowed_set, [(cname, mig)])
allowed = {}
for tbl, cs in constraints.items():
    for cname, info in cs.items():
        for col, vals in info["cols"].items():
            slot = allowed.setdefault(tbl, {}).setdefault(col, {"vals": None, "src": []})
            slot["vals"] = set(vals) if slot["vals"] is None else (slot["vals"] & vals)
            slot["src"].append((cname, info["mig"]))

# LIVE OVERRIDE: production pg_constraint is authoritative. Git replay misses
# constraints added out-of-band and mis-handles several coexisting constraints on
# one column (real Postgres ANDs them, so the effective allow-list is the
# INTERSECTION). Sets below are already intersected per column.
LIVE = os.environ.get("LIVE_CHECKS")
if LIVE and os.path.exists(LIVE):
    for line in open(LIVE, encoding="utf8"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        tbl, col, vals = line.split("|", 2)
        vals = set(v for v in vals.split(",") if v != "")
        allowed.setdefault(tbl, {})[col] = {"vals": vals, "src": [("LIVE", "pg_constraint")]}

# ------------------------------------------------------- function bodies
FUNC = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
functions = OrderedDict()
for fn in files:
    sql = strip_comments(open(os.path.join(MIG, fn), encoding="utf8", errors="replace").read())
    for m in FUNC.finditer(sql):
        name = m.group(1)
        tail = sql[m.end():]
        dq = re.search(r"\$(\w*)\$", tail)
        if not dq:
            continue
        tag = dq.group(0)
        start = dq.end()
        end = tail.find(tag, start)
        if end == -1:
            continue
        functions[name] = (fn, tail[start:end])

# ------------------------------------------------------- checks
INSERT = re.compile(r"INSERT\s+INTO\s+(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
UPDATE = re.compile(r"UPDATE\s+(?:ONLY\s+)?(?:public\.)?\"?(\w+)\"?\s+SET\b", re.I)

def as_literal(tok):
    t = tok.strip()
    t = re.sub(r"::\s*[\w\.]+(\[\])?\s*$", "", t).strip()
    m = LIT.fullmatch(t)
    return m.group(1).replace("''", "'") if m else None

findings = []

for name, (mig, body) in functions.items():
    for m in INSERT.finditer(body):
        tbl = m.group(1).lower()
        if tbl not in allowed:
            continue
        inner, after = body_of_parens(body, m.end() - 1)
        if inner is None or re.search(r"\bSELECT\b", inner, re.I):
            continue
        cols = [c.strip().strip('"').lower() for c in split_top_level(inner)]
        if not all(re.fullmatch(r"\w+", c) for c in cols):
            continue
        rest = body[after:]
        vm = re.match(r"\s*VALUES\s*\(", rest, re.I)
        if not vm:
            continue
        vinner, _ = body_of_parens(rest, vm.end() - 1)
        if vinner is None:
            continue
        vals = split_top_level(vinner)
        if len(vals) != len(cols):
            continue
        for col, raw in zip(cols, vals):
            lit = as_literal(raw)
            if lit is None or col not in allowed[tbl]:
                continue
            aset = allowed[tbl][col]["vals"]
            if lit not in aset:
                findings.append({"kind": "insert", "function": name, "fn_mig": mig,
                                 "table": tbl, "column": col, "literal": lit,
                                 "allowed": sorted(aset), "src": allowed[tbl][col]["src"][-3:]})
    for m in UPDATE.finditer(body):
        tbl = m.group(1).lower()
        if tbl not in allowed:
            continue
        rest = body[m.end():]
        stop = re.search(r"\bWHERE\b|\bRETURNING\b|\bFROM\b|;", rest, re.I)
        setclause = rest[:stop.start()] if stop else rest[:800]
        for part in split_top_level(setclause):
            am = re.match(r"\s*\"?(\w+)\"?\s*=\s*([\s\S]+)$", part)
            if not am:
                continue
            col = am.group(1).lower()
            lit = as_literal(am.group(2))
            if lit is None or col not in allowed[tbl]:
                continue
            aset = allowed[tbl][col]["vals"]
            if lit not in aset:
                findings.append({"kind": "update", "function": name, "fn_mig": mig,
                                 "table": tbl, "column": col, "literal": lit,
                                 "allowed": sorted(aset), "src": allowed[tbl][col]["src"][-3:]})

print(json.dumps({
    "tables_with_checks": len(allowed),
    "constrained_columns": sum(len(v) for v in allowed.values()),
    "functions": len(functions),
    "candidate_count": len(findings),
    "findings": findings,
}, indent=1, default=str))
