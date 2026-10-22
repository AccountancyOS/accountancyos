#!/usr/bin/env python3
"""
Static defect sweep — find functions that reference columns which do not exist.

DEF-027 (create_customer_safe inserted 4 phantom columns) and DEF-028
(stamp_portal_provenance selected a phantom column) were both findable from git alone,
by comparing what a function body writes against what the table actually has.
Neither needed execution. This finds that whole class in one pass instead of one
per fix-cycle.

Method: replay every migration in filename order to build table -> columns, extract the
LAST definition of each function, then check its INSERT column lists and UPDATE SET
targets against the reconstructed schema.

Regex-based, so it is a CANDIDATE FINDER, not an oracle. Every hit is verified by hand.
"""
import re, os, sys, json
from collections import OrderedDict

MIG = "supabase/migrations"
files = sorted(f for f in os.listdir(MIG) if f.endswith(".sql"))

# ---------------------------------------------------------------- schema replay
schema = {}          # table -> set(cols)
created_in = {}      # table -> migration

CONSTRAINT_KW = {
    "constraint","primary","foreign","unique","check","exclude","like","index"
}

def strip_comments(sql):
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql

def split_top_level(s):
    """Split on commas not inside parens."""
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        if ch == "," and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
    if cur.strip(): out.append(cur)
    return out

def body_of_parens(sql, start):
    """Given index of '(', return (inner, index_after_close)."""
    depth = 0
    for i in range(start, len(sql)):
        if sql[i] == "(": depth += 1
        elif sql[i] == ")":
            depth -= 1
            if depth == 0:
                return sql[start+1:i], i+1
    return None, len(sql)

CREATE_TABLE = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
ADD_COL  = re.compile(r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?\"?(\w+)\"?([\s\S]*?);", re.I)
DROP_TBL = re.compile(r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?(\w+)\"?", re.I)

for fn in files:
    raw = open(os.path.join(MIG, fn), encoding="utf8", errors="replace").read()
    sql = strip_comments(raw)

    # CREATE TABLE
    for m in CREATE_TABLE.finditer(sql):
        tbl = m.group(1).lower()
        inner, _ = body_of_parens(sql, m.end()-1)
        if inner is None: continue
        cols = set()
        for part in split_top_level(inner):
            part = part.strip()
            if not part: continue
            first = part.split()[0].strip('"').lower()
            if first in CONSTRAINT_KW: continue
            if re.match(r"^\w+$", first) or re.match(r'^"?\w+"?$', first):
                cols.add(first)
        if tbl not in schema:
            schema[tbl] = set()
            created_in[tbl] = fn
        schema[tbl] |= cols

    # ALTER TABLE ... (ADD/DROP/RENAME COLUMN)
    for m in ADD_COL.finditer(sql):
        tbl = m.group(1).lower()
        rest = m.group(2)
        if tbl not in schema:
            continue
        for a in re.finditer(r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?(\w+)\"?", rest, re.I):
            schema[tbl].add(a.group(1).lower())
        for d in re.finditer(r"DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?\"?(\w+)\"?", rest, re.I):
            schema[tbl].discard(d.group(1).lower())
        for r in re.finditer(r"RENAME\s+COLUMN\s+\"?(\w+)\"?\s+TO\s+\"?(\w+)\"?", rest, re.I):
            schema[tbl].discard(r.group(1).lower()); schema[tbl].add(r.group(2).lower())

    for m in DROP_TBL.finditer(sql):
        schema.pop(m.group(1).lower(), None)

# ---------------------------------------------------------------- function bodies
FUNC = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?(\w+)\"?\s*\(", re.I)

functions = OrderedDict()   # name -> (migration, body)

for fn in files:
    raw = open(os.path.join(MIG, fn), encoding="utf8", errors="replace").read()
    sql = strip_comments(raw)
    for m in FUNC.finditer(sql):
        name = m.group(1)
        # find the dollar-quoted body after this point
        tail = sql[m.end():]
        dq = re.search(r"\$(\w*)\$", tail)
        if not dq: continue
        tag = dq.group(0)
        start = dq.end()
        end = tail.find(tag, start)
        if end == -1: continue
        functions[name] = (fn, tail[start:end])

# ---------------------------------------------------------------- checks
INSERT = re.compile(r"INSERT\s+INTO\s+(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
UPDATE = re.compile(r"UPDATE\s+(?:public\.)?\"?(\w+)\"?\s+SET\s+([\s\S]{0,600}?)(?:\bWHERE\b|\bRETURNING\b|;)", re.I)

findings = []

for name, (mig, body) in functions.items():
    # INSERT column lists
    for m in INSERT.finditer(body):
        tbl = m.group(1).lower()
        if tbl not in schema:      # unknown table (may be a CTE / temp) - skip
            continue
        inner, _ = body_of_parens(body, m.end()-1)
        if inner is None: continue
        # column list only: bail if it looks like a subquery
        if re.search(r"\bSELECT\b", inner, re.I): continue
        cols = [c.strip().strip('"').lower() for c in split_top_level(inner)]
        cols = [c for c in cols if re.match(r"^\w+$", c)]
        missing = [c for c in cols if c not in schema[tbl]]
        if missing:
            findings.append({
                "kind": "insert_phantom_column", "function": name, "migration": mig,
                "table": tbl, "missing": missing,
            })
    # UPDATE SET targets
    for m in UPDATE.finditer(body):
        tbl = m.group(1).lower()
        if tbl not in schema: continue
        setclause = m.group(2)
        targets = re.findall(r"(?:^|,)\s*\"?(\w+)\"?\s*=", setclause)
        missing = [t.lower() for t in targets if t.lower() not in schema[tbl]]
        if missing:
            findings.append({
                "kind": "update_phantom_column", "function": name, "migration": mig,
                "table": tbl, "missing": sorted(set(missing)),
            })

print(json.dumps({
    "tables": len(schema),
    "functions": len(functions),
    "findings": findings,
}, indent=1))
