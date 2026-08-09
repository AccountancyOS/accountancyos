#!/usr/bin/env python3
"""
Vocabulary sweep over the APPLICATION write and read surface: src/** and supabase/functions/**.

WHY THIS EXISTS. The existing sweeps (audit-check-violations.py, audit-phantom-columns.py) read
`supabase/migrations` and nothing else. That is roughly a third of the surface that writes to
constrained columns, and it is not the interesting third: most real filing transitions happen in
the HMRC and Companies House edge functions, which no detector had ever looked at.

READERS ARE PART OF THE CONTRACT. A legal writer and an impossible reader break a workflow just
as completely as an invalid write, and the reader fails *silently* — it returns zero rows rather
than raising. The motivating case: `filing_queue.status` permits
queued/processing/completed/failed/cancelled, and both CT pollers select `.eq('status','pending')`.
Nothing legal ever writes 'pending', so the poller can never find work. No error, no log, no test.
That is why `read_impossible_literal` is reported at the same severity as a bad write.

WHAT IT UNDERSTANDS
  writes    .insert({...}) / .update({...}) / .upsert({...}) with an inline object literal
            .insert([{...}]) array form
            .insert(IDENT) / .update(IDENT) where IDENT was built earlier in the file
            IDENT.col = 'literal'   (the mutate-then-pass pattern, e.g. ch-submit's filingUpdate)
            ternaries: status: ok ? 'accepted' : 'rejected'  -> both branches checked
  reads     .eq('col','lit')  .neq(...)  .in('col',[...])  .not('col','in','(a,b)')
            .filter('col','eq','lit')  .match({col: 'lit'})

SCOPE RESOLUTION. Supabase calls are chained from `.from("table")`. This associates each call
with the nearest preceding `.from(...)` in the same file, up to the next `.from(...)`. That is a
heuristic, not a parser.

THIS IS A CANDIDATE FINDER, NOT AN ORACLE — the same standing as the other sweeps in this repo.
Every finding is meant to be read before it is acted on, and the regression test carries an
explicit baseline so a new finding fails the build while known ones stay visible.

Usage:  python3 scripts/audit-app-vocabulary.py            # JSON report
        python3 scripts/audit-app-vocabulary.py --summary  # human-readable
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROOTS = [os.path.join(ROOT, "src"), os.path.join(ROOT, "supabase", "functions")]
EXTS = (".ts", ".tsx")

# Directories whose contents describe the defect rather than commit it.
SKIP_DIRS = {"node_modules", "dist", "build", ".git"}
SKIP_FILE_PARTS = (
    os.path.join("src", "test") + os.sep,          # tests assert on bad values deliberately
    os.path.join("src", "integrations", "supabase") + os.sep,  # generated types
    "db-constants" + os.sep,                        # the registry itself
)


# ---------------------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------------------

def load_vocabulary():
    """table.column -> set(allowed). Derived from the migrations by the same generator the
    TypeScript registry uses, so there is one source of truth, not two."""
    out = subprocess.run(
        [sys.executable, os.path.join(HERE, "generate-db-vocabulary.py"), "--json"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    vocab = {}
    for e in json.loads(out.stdout):
        vocab[f"{e['table']}.{e['column']}"] = set(e["allowed"])
    return vocab


# ---------------------------------------------------------------------------------------
# Source handling
# ---------------------------------------------------------------------------------------

def strip_comments_js(src):
    """
    Remove // and /* */ comments without touching string or template literals.

    Necessary in both directions: a commented-out `.eq('status','pending')` must not be
    reported, and a literal containing `//` (a URL) must not truncate the line.
    """
    out, i, n = [], 0, len(src)
    while i < n:
        ch = src[i]
        if ch in "'\"`":
            quote = ch
            out.append(ch)
            i += 1
            while i < n:
                if src[i] == "\\":
                    out.append(src[i])
                    if i + 1 < n:
                        out.append(src[i + 1])
                    i += 2
                    continue
                out.append(src[i])
                if src[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            while i < n and src[i] != "\n":
                out.append(" ")
                i += 1
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            end = src.find("*/", i + 2)
            stop = n if end == -1 else end + 2
            # Preserve newlines so line numbers stay correct.
            out.append("".join("\n" if c == "\n" else " " for c in src[i:stop]))
            i = stop
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def line_of(src, idx):
    return src.count("\n", 0, idx) + 1


def balanced(src, start, opener="{", closer="}"):
    """Return (text, end_index) for the balanced block beginning at src[start] == opener."""
    if start >= len(src) or src[start] != opener:
        return None, start
    depth, i, n = 0, start, len(src)
    while i < n:
        c = src[i]
        if c in "'\"`":
            q = c
            i += 1
            while i < n:
                if src[i] == "\\":
                    i += 2
                    continue
                if src[i] == q:
                    break
                i += 1
        elif c == opener:
            depth += 1
        elif c == closer:
            depth -= 1
            if depth == 0:
                return src[start:i + 1], i + 1
        i += 1
    return None, start


# `key: 'literal'` and `key: cond ? 'a' : 'b'`
KV = re.compile(r"""(?<![\w.])(['"]?)(\w+)\1\s*:\s*([^,}\n]+)""")
STRLIT = re.compile(r"""^\s*(['"])([^'"]*)\1\s*$""")
TERNARY = re.compile(r"""\?\s*(['"])([^'"]*)\1\s*:\s*(['"])([^'"]*)\3""")


def literals_from_value(expr):
    """Literal string values an object-literal entry can take. A ternary contributes both."""
    m = STRLIT.match(expr)
    if m:
        return [m.group(2)]
    t = TERNARY.search(expr)
    if t:
        return [t.group(2), t.group(4)]
    return []


def object_literal_pairs(block):
    """(column, literal) pairs from an object-literal block, one level deep only.

    Deliberately shallow: `metadata: { status: 'x' }` is a value inside jsonb, not a column
    write, and descending into it would report the enclosing table's vocabulary against a
    nested key that has nothing to do with it.
    """
    inner = block[1:-1] if block.startswith("{") else block
    # Blank out nested blocks so their keys are not read as columns of this table.
    buf, depth, out = [], 0, []
    for ch in inner:
        if ch in "{[":
            depth += 1
            buf.append(" ")
            continue
        if ch in "}]":
            depth -= 1
            buf.append(" ")
            continue
        buf.append(ch if depth == 0 else " ")
    flat = "".join(buf)
    for m in KV.finditer(flat):
        for lit in literals_from_value(m.group(3)):
            out.append((m.group(2), lit, m.start()))
    return out


# ---------------------------------------------------------------------------------------
# Scanning
# ---------------------------------------------------------------------------------------

FROM = re.compile(r"""\.from\(\s*(['"])([\w.]+)\1""")
WRITE_CALL = re.compile(r"""\.(insert|update|upsert)\(\s*""")
IDENT_ARG = re.compile(r"""^\s*(\w+)\s*[,)]""")
PROP_ASSIGN = re.compile(r"""(?<![\w.])(\w+)\.(\w+)\s*=\s*(['"])([^'"]*)\3""")
CONST_OBJ = re.compile(r"""(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*\{""")

READ_EQ = re.compile(r"""\.(eq|neq|is)\(\s*(['"])(\w+)\2\s*,\s*(['"])([^'"]*)\4""")
READ_IN = re.compile(r"""\.in\(\s*(['"])(\w+)\1\s*,\s*\[([^\]]*)\]""")
READ_NOT_IN = re.compile(
    r"""\.not\(\s*(['"])(\w+)\1\s*,\s*(['"])in\3\s*,\s*(['"])\(([^)]*)\)""")
READ_FILTER = re.compile(
    r"""\.filter\(\s*(['"])(\w+)\1\s*,\s*(['"])(?:eq|neq)\3\s*,\s*(['"])([^'"]*)\4""")
LIST_LIT = re.compile(r"""(['"])([^'"]*)\1""")


def collect_variable_objects(src):
    """
    IDENT -> {column: [literals]} for objects built before being passed to .insert/.update.

    Two shapes, both real in this codebase:
      const payload = { status: 'draft', ... };   ... .insert(payload)
      const filingUpdate: any = {};  filingUpdate.status = 'filed';  ... .update(filingUpdate)
    """
    vars_ = {}
    for m in CONST_OBJ.finditer(src):
        name = m.group(1)
        block, _ = balanced(src, src.index("{", m.end() - 1))
        if not block:
            continue
        entry = vars_.setdefault(name, {})
        for col, lit, _off in object_literal_pairs(block):
            entry.setdefault(col, []).append((lit, line_of(src, m.start())))
    for m in PROP_ASSIGN.finditer(src):
        name, col, lit = m.group(1), m.group(2), m.group(4)
        vars_.setdefault(name, {}).setdefault(col, []).append((lit, line_of(src, m.start())))
    return vars_


def scan_file(path, src, vocab, findings):
    rel = os.path.relpath(path, ROOT)
    variables = collect_variable_objects(src)

    froms = [(m.start(), m.end(), m.group(2)) for m in FROM.finditer(src)]
    if not froms:
        return

    def check(table, column, literal, line, kind, snippet):
        key = f"{table}.{column}"
        allowed = vocab.get(key)
        if allowed is None or literal in allowed:
            return
        findings.append({
            "kind": kind, "file": rel, "line": line, "table": table, "column": column,
            "literal": literal, "allowed": sorted(allowed), "snippet": snippet.strip()[:160],
        })

    for i, (fstart, fend, table) in enumerate(froms):
        scope_end = froms[i + 1][0] if i + 1 < len(froms) else len(src)
        scope = src[fend:scope_end]
        base = fend

        # ---- writes
        for w in WRITE_CALL.finditer(scope):
            after = base + w.end()
            j = after
            while j < len(src) and src[j] in " \n\t":
                j += 1
            block = None
            if j < len(src) and src[j] == "{":
                block, _ = balanced(src, j)
            elif j < len(src) and src[j] == "[":
                arr, _ = balanced(src, j, "[", "]")
                if arr:
                    k = arr.find("{")
                    if k != -1:
                        block, _ = balanced(arr, k)
            else:
                ident = IDENT_ARG.match(src[j:])
                if ident and ident.group(1) in variables:
                    for col, entries in variables[ident.group(1)].items():
                        for lit, ln in entries:
                            check(table, col, lit, ln, "write_invalid_literal",
                                  f"{ident.group(1)}.{col} = '{lit}' -> .{w.group(1)}()")
                    continue
            if block:
                for col, lit, off in object_literal_pairs(block):
                    check(table, col, lit, line_of(src, j + off),
                          "write_invalid_literal", f".{w.group(1)}({{ {col}: '{lit}' }})")

        # ---- reads
        for r in READ_EQ.finditer(scope):
            check(table, r.group(3), r.group(5), line_of(src, base + r.start()),
                  "read_impossible_literal", r.group(0))
        for r in READ_FILTER.finditer(scope):
            check(table, r.group(2), r.group(5), line_of(src, base + r.start()),
                  "read_impossible_literal", r.group(0))
        for r in READ_IN.finditer(scope):
            for lit in LIST_LIT.finditer(r.group(3)):
                check(table, r.group(2), lit.group(2), line_of(src, base + r.start()),
                      "read_impossible_literal", r.group(0)[:120])
        for r in READ_NOT_IN.finditer(scope):
            # `.not('status','in','("a","b")')` — excluding a value that cannot exist is
            # harmless, so this is reported at lower severity via its own kind.
            for lit in LIST_LIT.finditer(r.group(5)):
                key = f"{table}.{r.group(2)}"
                if key in vocab and lit.group(2) not in vocab[key]:
                    findings.append({
                        "kind": "read_excludes_impossible_literal", "file": rel,
                        "line": line_of(src, base + r.start()), "table": table,
                        "column": r.group(2), "literal": lit.group(2),
                        "allowed": sorted(vocab[key]), "snippet": r.group(0)[:160],
                    })


def iter_files():
    for root in ROOTS:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if not fn.endswith(EXTS):
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                if any(part in rel for part in SKIP_FILE_PARTS):
                    continue
                yield full


def main():
    vocab = load_vocabulary()
    findings, scanned = [], 0
    for path in sorted(iter_files()):
        try:
            src = strip_comments_js(open(path, encoding="utf8", errors="replace").read())
        except OSError:
            continue
        scanned += 1
        scan_file(path, src, vocab, findings)

    findings.sort(key=lambda f: (f["kind"], f["file"], f["line"]))
    report = {
        "files_scanned": scanned,
        "constrained_columns": len(vocab),
        "n_findings": len(findings),
        "findings": findings,
    }

    if "--summary" in sys.argv:
        print(f"scanned {scanned} files against {len(vocab)} constrained columns")
        print(f"{len(findings)} findings\n")
        for f in findings:
            print(f"  [{f['kind']}] {f['file']}:{f['line']}")
            print(f"      {f['table']}.{f['column']} = '{f['literal']}'")
            print(f"      allowed: {', '.join(f['allowed'])}")
        return
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
