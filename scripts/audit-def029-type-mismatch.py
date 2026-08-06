#!/usr/bin/env python3
"""
DEF-029 class sweep: text-yielding expression written into a non-text column
without a cast -> SQLSTATE 42804.

Reuses the migration-replay + last-function-definition approach from
audit-phantom-columns.py, but additionally records DECLARED COLUMN TYPES and
pairs INSERT column lists with VALUES expressions positionally.

CANDIDATE FINDER, not an oracle. Every hit must be verified by hand.
"""
import re, os, sys, json
from collections import OrderedDict

MIG = sys.argv[1] if len(sys.argv) > 1 else "supabase/migrations"
LIVE_JSON = sys.argv[2] if len(sys.argv) > 2 else None
files = sorted(f for f in os.listdir(MIG) if f.endswith(".sql"))

CONSTRAINT_KW = {
    "constraint","primary","foreign","unique","check","exclude","like","index"
}

def strip_comments(sql):
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql

def split_top_level(s):
    out, depth, cur = [], 0, ""
    inq = None
    i = 0
    while i < len(s):
        ch = s[i]
        if inq:
            cur += ch
            if ch == inq:
                inq = None
            i += 1
            continue
        if ch in ("'", '"'):
            inq = ch; cur += ch; i += 1; continue
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        if ch == "," and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
        i += 1
    if cur.strip(): out.append(cur)
    return out

def body_of_parens(sql, start):
    depth = 0
    inq = None
    i = start
    while i < len(sql):
        ch = sql[i]
        if inq:
            if ch == inq: inq = None
            i += 1; continue
        if ch in ("'", '"'):
            inq = ch; i += 1; continue
        if ch == "(": depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return sql[start+1:i], i+1
        i += 1
    return None, len(sql)

# ------------------------------------------------------- schema replay w/ types
schema = {}        # table -> OrderedDict(col -> type)

TYPE_RE = re.compile(
    r"^\s*(?:\"?(\w+)\"?)\s+"
    r"(uuid|numeric(?:\s*\([^)]*\))?|decimal(?:\s*\([^)]*\))?|integer|int4|int8|bigint|smallint|int|serial|bigserial|"
    r"boolean|bool|date|timestamptz|timestamp\s+with\s+time\s+zone|timestamp(?:\s*\([^)]*\))?\s*(?:without\s+time\s+zone)?|"
    r"jsonb|json|text|varchar(?:\s*\([^)]*\))?|character\s+varying(?:\s*\([^)]*\))?|char(?:\s*\([^)]*\))?|"
    r"citext|inet|bytea|interval|time(?:tz)?|double\s+precision|real|float8|float4|tsvector|\w+)\b",
    re.I)

def norm_type(t):
    t = re.sub(r"\s+", " ", t.strip().lower())
    t = re.sub(r"\s*\([^)]*\)", "", t)
    m = {
        "decimal":"numeric","int4":"integer","int":"integer","int8":"bigint",
        "bool":"boolean","timestamp with time zone":"timestamptz",
        "timestamp without time zone":"timestamp","timestamp":"timestamp",
        "character varying":"varchar","serial":"integer","bigserial":"bigint",
        "double precision":"double precision","float8":"double precision",
        "float4":"real",
    }
    return m.get(t, t)

CREATE_TABLE = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
ALTER = re.compile(r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?\"?(\w+)\"?([\s\S]*?);", re.I)
DROP_TBL = re.compile(r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?(\w+)\"?", re.I)

col_history = {}   # (table,col) -> list of (migration, type)

for fn in files:
    raw = open(os.path.join(MIG, fn), encoding="utf8", errors="replace").read()
    sql = strip_comments(raw)

    for m in CREATE_TABLE.finditer(sql):
        tbl = m.group(1).lower()
        inner, _ = body_of_parens(sql, m.end()-1)
        if inner is None: continue
        cols = OrderedDict()
        for part in split_top_level(inner):
            part = part.strip()
            if not part: continue
            first = part.split()[0].strip('"').lower()
            if first in CONSTRAINT_KW: continue
            tm = TYPE_RE.match(part)
            if tm:
                cols[tm.group(1).lower()] = norm_type(tm.group(2))
            elif re.match(r"^\w+$", first):
                cols[first] = "?"
        if tbl not in schema:
            schema[tbl] = OrderedDict()
        for c, t in cols.items():
            schema[tbl][c] = t
            col_history.setdefault((tbl,c), []).append((fn, t))

    for m in ALTER.finditer(sql):
        tbl = m.group(1).lower()
        rest = m.group(2)
        if tbl not in schema: continue
        for a in re.finditer(r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\"?\w+\"?\s+[^,;]+)", rest, re.I):
            tm = TYPE_RE.match(a.group(1))
            if tm:
                schema[tbl][tm.group(1).lower()] = norm_type(tm.group(2))
                col_history.setdefault((tbl,tm.group(1).lower()), []).append((fn, norm_type(tm.group(2))))
        for d in re.finditer(r"DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?\"?(\w+)\"?", rest, re.I):
            schema[tbl].pop(d.group(1).lower(), None)
        for r in re.finditer(r"RENAME\s+COLUMN\s+\"?(\w+)\"?\s+TO\s+\"?(\w+)\"?", rest, re.I):
            old = schema[tbl].pop(r.group(1).lower(), "?")
            schema[tbl][r.group(2).lower()] = old
        for t in re.finditer(r"ALTER\s+COLUMN\s+\"?(\w+)\"?\s+(?:SET\s+DATA\s+)?TYPE\s+([^,;]+)", rest, re.I):
            nt = norm_type(re.split(r"\s+USING\s+", t.group(2), flags=re.I)[0])
            schema[tbl][t.group(1).lower()] = nt
            col_history.setdefault((tbl,t.group(1).lower()), []).append((fn, nt))

    for m in DROP_TBL.finditer(sql):
        schema.pop(m.group(1).lower(), None)

# --------------------------------------------------------------- function bodies
FUNC = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?(\w+)\"?\s*\(", re.I)

functions = OrderedDict()   # (name, nargs) -> (migration, args, body)

for fn in files:
    raw = open(os.path.join(MIG, fn), encoding="utf8", errors="replace").read()
    sql = strip_comments(raw)
    for m in FUNC.finditer(sql):
        name = m.group(1)
        args, after = body_of_parens(sql, m.end()-1)
        tail = sql[after:]
        dq = re.search(r"\$(\w*)\$", tail)
        if not dq: continue
        tag = dq.group(0)
        start = dq.end()
        end = tail.find(tag, start)
        if end == -1: continue
        nargs = len([a for a in split_top_level(args or "") if a.strip()])
        functions[(name, nargs)] = (fn, args or "", tail[start:end])

# Live mode: replace the git-derived function set with the LIVE pg_proc bodies.
if LIVE_JSON:
    live = json.load(open(LIVE_JSON, encoding="utf8"))["functions"]
    functions = OrderedDict()
    for f in live:
        d = strip_comments(f.get("definition") or "")
        m = FUNC.search(d)
        if not m: continue
        args, after = body_of_parens(d, m.end()-1)
        tail = d[after:]
        dq = re.search(r"AS\s+\$(\w*)\$", tail, re.I)
        if not dq: continue
        tag = "$" + dq.group(1) + "$"
        start = dq.end()
        end = tail.rfind(tag)
        if end <= start: continue
        nargs = len([a for a in split_top_level(args or "") if a.strip()])
        functions[(f["name"], f.get("arguments") or nargs)] = ("LIVE", args or "", tail[start:end])

# --------------------------------------------------------------- type inference
NONTEXT = {"uuid","numeric","integer","bigint","smallint","boolean","date",
           "timestamptz","timestamp","jsonb","json","interval","double precision","real"}

def strip_parens(e):
    e = e.strip()
    while e.startswith("(") :
        inner, after = body_of_parens(e, 0)
        if inner is None: break
        if after == len(e):
            e = inner.strip()
        else:
            break
    return e

def top_level_cast(e):
    """Return cast type if expr ends with a top-level ::type."""
    depth = 0; inq = None; last = None
    i = 0
    while i < len(e):
        ch = e[i]
        if inq:
            if ch == inq: inq = None
            i += 1; continue
        if ch in ("'", '"'):
            inq = ch; i += 1; continue
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        elif ch == ":" and depth == 0 and i+1 < len(e) and e[i+1] == ":":
            last = i
            i += 2; continue
        i += 1
    if last is None: return None
    tail = e[last+2:].strip()
    tm = re.match(r"^\s*(?:public\.)?(\w+(?:\s+\w+)?)\s*(?:\([^)]*\))?\s*(\[\])?\s*$", tail)
    if not tm: return None
    return norm_type(tm.group(1))

JSON_TEXT_OP = re.compile(r"(->>|#>>)")

def has_toplevel_json_text(e):
    """Is there a top-level (depth 0) ->> or #>> operator?"""
    depth = 0; inq = None; i = 0
    while i < len(e):
        ch = e[i]
        if inq:
            if ch == inq: inq = None
            i += 1; continue
        if ch in ("'", '"'):
            inq = ch; i += 1; continue
        if ch == "(": depth += 1
        elif ch == ")": depth -= 1
        elif depth == 0 and e.startswith("->>", i):
            return True
        elif depth == 0 and e.startswith("#>>", i):
            return True
        i += 1
    return False

WRAPPERS = ("coalesce","nullif","greatest","least")
TEXT_FUNCS = ("trim","btrim","ltrim","rtrim","upper","lower","initcap","concat",
              "concat_ws","substring","substr","replace","format","left","right",
              "regexp_replace","to_char","md5","encode","string_agg","lpad","rpad","nullif")

def infer(e, textvars, depth=0):
    """Return ('text'|'known:<type>'|'unknown', why)."""
    if depth > 12: return ("unknown", "")
    e = strip_parens(e)
    if not e: return ("unknown","")
    c = top_level_cast(e)
    if c: return ("cast:"+c, c)
    low = e.lower()
    # CASE expression
    if low.startswith("case"):
        # analyse THEN/ELSE branches
        branches = re.findall(r"\bTHEN\b([\s\S]*?)(?=\bWHEN\b|\bELSE\b|\bEND\b)", e, re.I)
        branches += re.findall(r"\bELSE\b([\s\S]*?)(?=\bEND\b)", e, re.I)
        for b in branches:
            k, w = infer(b, textvars, depth+1)
            if k == "text": return ("text", "CASE branch: "+w)
        return ("unknown","")
    m = re.match(r"^(\w+)\s*\(", e)
    if m:
        fname = m.group(1).lower()
        inner, after = body_of_parens(e, m.end()-1)
        if inner is not None and after >= len(e.rstrip()):
            if fname in WRAPPERS:
                for a in split_top_level(inner):
                    k, w = infer(a, textvars, depth+1)
                    if k == "text":
                        return ("text", f"{fname}() over {w}")
                return ("unknown","")
            if fname in TEXT_FUNCS:
                return ("text", f"{fname}() returns text")
            return ("unknown","")
    if has_toplevel_json_text(e):
        return ("text", e.strip())
    # bare identifier -> declared variable
    idm = re.match(r"^\"?(\w+)\"?$", e)
    if idm:
        v = idm.group(1).lower()
        if v in textvars:
            return ("text", f"variable {v} declared {textvars[v]}")
        return ("unknown","")
    # concatenation: text on non-json targets; jsonb||jsonb and array||array are legal
    if "||" in e:
        return ("concat", "|| concatenation")
    return ("unknown","")

def declared_textvars(args, body):
    """plpgsql variables (and function params) declared text/varchar."""
    out = {}
    for a in split_top_level(args or ""):
        a = a.strip()
        am = re.match(r"^(?:IN|OUT|INOUT|VARIADIC)?\s*(\w+)\s+([\w\s]+?)(?:\s+DEFAULT\b|\s*=|$)", a, re.I)
        if am:
            t = norm_type(am.group(2))
            if t in ("text","varchar","citext","char","character"):
                out[am.group(1).lower()] = t
    dec = re.split(r"\bBEGIN\b", body, 1, flags=re.I)[0]
    for line in dec.split(";"):
        lm = re.match(r"^\s*(\w+)\s+((?:text|varchar|citext|character\s+varying)\b[^;]*)$", line.strip(), re.I)
        if lm:
            out[lm.group(1).lower()] = "text"
    return out

# --------------------------------------------------------------- checks
INSERT = re.compile(r"INSERT\s+INTO\s+(?:public\.)?\"?(\w+)\"?\s*\(", re.I)
findings = []
candidates_examined = 0
skipped = {"unknown_table":0, "collist_not_plain":0, "arity_mismatch":0,
           "insert_select":0, "no_values":0}

def record(kind, why, name, nargs, mig, tbl, col, ctype, expr, stmt):
    """kind is 'text' or 'concat'. jsonb/json/array targets tolerate ||."""
    if kind == "concat":
        if ctype in ("jsonb","json") or ctype.endswith("[]"):
            return
        why = "|| yields text"
    findings.append({
        "function": f"{name}({nargs})", "migration": mig,
        "table": tbl, "column": col, "column_type": ctype,
        "expr": re.sub(r"\s+"," ",expr.strip())[:220],
        "why": why[:160], "stmt": stmt,
    })

for (name, nargs), (mig, args, body) in functions.items():
    textvars = declared_textvars(args, body)

    for m in INSERT.finditer(body):
        tbl = m.group(1).lower()
        if tbl not in schema:
            skipped["unknown_table"] += 1; continue
        collist, after = body_of_parens(body, m.end()-1)
        if collist is None: continue
        if re.search(r"\bSELECT\b", collist, re.I):
            skipped["collist_not_plain"] += 1; continue
        cols = [c.strip().strip('"').lower() for c in split_top_level(collist)]
        if not all(re.match(r"^\w+$", c) for c in cols):
            skipped["collist_not_plain"] += 1; continue
        rest = body[after:]

        rows = []   # list of expression lists
        vm = re.match(r"\s*VALUES\s*", rest, re.I)
        if vm:
            pos = vm.end()
            while pos < len(rest) and rest[pos:pos+1] == "(":
                vals, nxt = body_of_parens(rest, pos)
                if vals is None: break
                rows.append(split_top_level(vals))
                mnext = re.match(r"\s*,\s*", rest[nxt:])
                if not mnext: break
                pos = nxt + mnext.end()
            if not rows:
                skipped["no_values"] += 1
        else:
            sm = re.match(r"\s*\(?\s*SELECT\s+", rest, re.I)
            if sm:
                # INSERT ... SELECT <exprs> FROM ... : take the select list only
                seg = rest[sm.end():]
                depth = 0; inq = None; cut = None; i = 0
                while i < len(seg):
                    ch = seg[i]
                    if inq:
                        if ch == inq: inq = None
                        i += 1; continue
                    if ch in ("'", '"'): inq = ch; i += 1; continue
                    if ch == "(": depth += 1
                    elif ch == ")":
                        depth -= 1
                        if depth < 0: cut = i; break
                    elif depth == 0 and re.match(r"\s(FROM|WHERE|RETURNING|ON\s+CONFLICT)\s", seg[i:i+16], re.I):
                        cut = i; break
                    elif depth == 0 and ch == ";": cut = i; break
                    i += 1
                sel = seg[:cut if cut is not None else len(seg)]
                cand = split_top_level(sel)
                if len(cand) == len(cols):
                    rows.append(cand)
                else:
                    skipped["insert_select"] += 1
            else:
                skipped["no_values"] += 1

        for exprs in rows:
            if len(exprs) != len(cols):
                skipped["arity_mismatch"] += 1; continue
            for col, expr in zip(cols, exprs):
                ctype = schema[tbl].get(col)
                if ctype is None or ctype not in NONTEXT: continue
                candidates_examined += 1
                kind, why = infer(expr, textvars)
                if kind in ("text","concat"):
                    record(kind, why, name, nargs, mig, tbl, col, ctype, expr, "INSERT")
                elif kind.startswith("cast:"):
                    ct = kind.split(":",1)[1]
                    if ct in ("text","varchar","citext") and ctype in NONTEXT:
                        record("text", f"explicit ::{ct} into {ctype}", name, nargs,
                               mig, tbl, col, ctype, expr, "INSERT")

    # UPDATE ... SET
    for m in re.finditer(r"UPDATE\s+(?:public\.)?\"?(\w+)\"?\s+SET\b", body, re.I):
        tbl = m.group(1).lower()
        if tbl not in schema: continue
        seg = body[m.end():]
        # cut at WHERE / RETURNING / ; at depth 0
        depth = 0; inq=None; cut=len(seg); i=0
        while i < len(seg):
            ch = seg[i]
            if inq:
                if ch == inq: inq=None
                i+=1; continue
            if ch in ("'",'"'): inq=ch; i+=1; continue
            if ch=="(": depth+=1
            elif ch==")":
                depth-=1
                if depth<0: cut=i; break
            elif depth==0 and ch==";": cut=i; break
            elif depth==0 and re.match(r"\s(WHERE|RETURNING|FROM)\s", seg[i:i+12], re.I):
                cut=i; break
            i+=1
        setclause = seg[:cut]
        for assign in split_top_level(setclause):
            am = re.match(r"\s*\"?(\w+)\"?\s*=\s*([\s\S]+)$", assign)
            if not am: continue
            col = am.group(1).lower(); expr = am.group(2)
            ctype = schema[tbl].get(col)
            if ctype is None or ctype not in NONTEXT: continue
            candidates_examined += 1
            kind, why = infer(expr, textvars)
            if kind in ("text","concat"):
                record(kind, why, name, nargs, mig, tbl, col, ctype, expr, "UPDATE")
            elif kind.startswith("cast:"):
                ct = kind.split(":",1)[1]
                if ct in ("text","varchar","citext") and ctype in NONTEXT:
                    record("text", f"explicit ::{ct} into {ctype}", name, nargs,
                           mig, tbl, col, ctype, expr, "UPDATE")

print(json.dumps({
    "mode": "LIVE" if LIVE_JSON else "git",
    "tables": len(schema),
    "functions": len(functions),
    "candidate_assignments_examined": candidates_examined,
    "skipped": skipped,
    "n_findings": len(findings),
    "findings": findings,
}, indent=1))
