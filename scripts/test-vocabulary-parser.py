#!/usr/bin/env python3
"""
Parser regression fixtures for scripts/audit-vocabulary.py.

Every case below is a blind spot that was FOUND IN PRODUCTION DATA, not imagined. Each one
silently inflated a table's column set or mis-resolved a constraint.

The reason these matter more than they look: an inflated column set never produces a FALSE
finding. It does the more dangerous thing and MASKS a real one — a function writing a phantom
column passes silently because the parser believes that column exists. These failures are
invisible by construction, so they need fixtures rather than observation.

Run:  python3 scripts/test-vocabulary-parser.py
Exit 0 on success, 1 with a diff on failure. Invoked by
src/test/regression/vocabulary-parser.test.ts.
"""
import importlib.util
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def load_module():
    path = os.path.join(HERE, "audit-vocabulary.py")
    spec = importlib.util.spec_from_file_location("audit_vocabulary", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# (name, sql, expected_columns, expected_checks or None to skip)
FIXTURES = [
    (
        "trailing comment does not leak into the column list",
        # Found on public.journals: the comment's contents became three columns named
        # MANUAL, REVERSING and YEAR_END, any of which could have masked a phantom column.
        """CREATE TABLE fx (
             id uuid PRIMARY KEY,
             journal_type TEXT NOT NULL DEFAULT 'MANUAL', -- MANUAL, REVERSING, YEAR_END
             note TEXT
           );""",
        {"fx": {"id", "journal_type", "note"}},
        None,
    ),
    (
        "comma inside a string literal does not split the column list",
        # Found on employee_absences and crm_followup_sequences, whose jsonb defaults produced
        # columns named `friday"]'::JSONB` and `lost"]'::jsonb`.
        """CREATE TABLE fx (
             id uuid PRIMARY KEY,
             days jsonb DEFAULT '["mon","friday"]'::jsonb,
             tail TEXT
           );""",
        {"fx": {"id", "days", "tail"}},
        None,
    ),
    (
        "table-level UNIQUE written without a space is not a column",
        # Found on client_detail_cgt, where `UNIQUE(client_id)` became a column of that name —
        # which also hid that the table can hold only one CGT disposal per client.
        """CREATE TABLE fx (
             id uuid PRIMARY KEY,
             client_id uuid NOT NULL,
             UNIQUE(client_id)
           );""",
        {"fx": {"id", "client_id"}},
        None,
    ),
    (
        "an escaped quote does not swallow the rest of the definition",
        """CREATE TABLE fx (
             id uuid PRIMARY KEY,
             label TEXT DEFAULT 'it''s, fine',
             after TEXT
           );""",
        {"fx": {"id", "label", "after"}},
        None,
    ),
    (
        "block comments are removed",
        """CREATE TABLE fx (
             id uuid PRIMARY KEY,
             /* status TEXT, notes TEXT, */
             real_col TEXT
           );""",
        {"fx": {"id", "real_col"}},
        None,
    ),
    (
        "a commented-out constraint is not replayed",
        """CREATE TABLE fx (id uuid, status TEXT);
           -- ALTER TABLE fx ADD CONSTRAINT fx_status_check CHECK (status IN ('a','b'));""",
        {"fx": {"id", "status"}},
        [],
    ),
    (
        "DROP CONSTRAINT retires a constraint",
        # Without this, 51 dropped constraints replay as live and the intersection is wrong in
        # the alarming direction — the first run of this audit reported bills.status as
        # permitting no legal value at all, which was an artefact, not a defect.
        """CREATE TABLE fx (id uuid, status TEXT);
           ALTER TABLE fx ADD CONSTRAINT fx_status_check CHECK (status IN ('a','b'));
           ALTER TABLE fx DROP CONSTRAINT fx_status_check;""",
        {"fx": {"id", "status"}},
        [],
    ),
    (
        "drop-then-re-add in one file resolves as a redefinition, not a removal",
        """CREATE TABLE fx (id uuid, status TEXT);
           ALTER TABLE fx ADD CONSTRAINT fx_status_check CHECK (status IN ('a','b'));
           ALTER TABLE fx DROP CONSTRAINT fx_status_check;
           ALTER TABLE fx ADD CONSTRAINT fx_status_check CHECK (status IN ('a','b','c'));""",
        {"fx": {"id", "status"}},
        [("fx", "status", ("a", "b", "c"))],
    ),
    (
        "an inline unnamed CHECK takes the Postgres auto name, so a later DROP finds it",
        """CREATE TABLE fx (id uuid, status TEXT CHECK (status IN ('a','b')));
           ALTER TABLE fx DROP CONSTRAINT fx_status_check;""",
        {"fx": {"id", "status"}},
        [],
    ),
    (
        "= ANY (ARRAY[...]) is read as a vocabulary, like IN (...)",
        """CREATE TABLE fx (id uuid, status TEXT);
           ALTER TABLE fx ADD CONSTRAINT fx_status_check
             CHECK (status = ANY (ARRAY['a'::text, 'b'::text]));""",
        {"fx": {"id", "status"}},
        [("fx", "status", ("a", "b"))],
    ),
    (
        "DROP COLUMN removes a column",
        """CREATE TABLE fx (id uuid, gone TEXT);
           ALTER TABLE fx DROP COLUMN gone;""",
        {"fx": {"id"}},
        None,
    ),
    # ---- compound CHECKs: a membership test as one TERM of a rule is not a vocabulary -----
    (
        "a compound CHECK over status and another column is a RULE, not a vocabulary",
        # Found by writing exactly this on transport_jobs (DEF-036). Scanning for `IN (` read
        # the two arms as rival vocabularies, intersected them to nothing, and reported a
        # well-formed column as self-contradicting. A false contradiction is expensive in a
        # report whose entire value is that the count is zero.
        """CREATE TABLE fx (
             id uuid, status TEXT, completed_at timestamptz,
             CONSTRAINT fx_completion CHECK (
               (status IN ('completed','failed') AND completed_at IS NOT NULL)
               OR (status IN ('queued','processing') AND completed_at IS NULL)
             )
           );""",
        {"fx": {"id", "status", "completed_at"}},
        [],                       # no vocabulary declared — the rule constrains a relationship
    ),
    (
        "several status predicates inside one consistency expression declare no vocabulary",
        """CREATE TABLE fx (
             id uuid, status TEXT, claimed_at timestamptz, completed_at timestamptz,
             CONSTRAINT fx_consistent CHECK (
               (status = 'processing' AND claimed_at IS NOT NULL)
               OR (status IN ('queued') AND claimed_at IS NULL)
               OR (status IN ('completed','failed','cancelled') AND completed_at IS NOT NULL)
             )
           );""",
        {"fx": {"id", "status", "claimed_at", "completed_at"}},
        [],
    ),
    (
        "a single-column membership CHECK IS a vocabulary, compound handling notwithstanding",
        # The other half of the pair. If the compound fix were too eager it would suppress
        # real vocabularies, and the whole registry would silently empty out.
        """CREATE TABLE fx (
             id uuid,
             status TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','processing','completed'))
           );""",
        {"fx": {"id", "status"}},
        [("fx", "status", ("completed", "processing", "queued"))],
    ),
    (
        "a genuine intersection contradiction is still reported",
        # The DEF-034 shape, kept adjacent to the compound fixtures on purpose: the fix must
        # suppress FALSE contradictions without suppressing true ones. Here two independent
        # single-column vocabularies really do conflict — only 'b' satisfies both.
        """CREATE TABLE fx (id uuid, status TEXT);
           ALTER TABLE fx ADD CONSTRAINT fx_old CHECK (status IN ('a','b'));
           ALTER TABLE fx ADD CONSTRAINT fx_new CHECK (status IN ('b','c'));""",
        {"fx": {"id", "status"}},
        [("fx", "status", ("a", "b")), ("fx", "status", ("b", "c"))],
    ),
    (
        "two live constraints on one column are both retained, so the intersection is real",
        # The DEF-034 shape. If either were dropped by the parser the contradiction would
        # vanish from the report and the unwritable states would look writable.
        """CREATE TABLE fx (id uuid, status TEXT);
           ALTER TABLE fx ADD CONSTRAINT one CHECK (status IN ('a','b'));
           ALTER TABLE fx ADD CONSTRAINT two CHECK (status IN ('b','c'));""",
        {"fx": {"id", "status"}},
        [("fx", "status", ("a", "b")), ("fx", "status", ("b", "c"))],
    ),
]


def run():
    mod = load_module()
    failures = []

    for name, sql, expected_cols, expected_checks in FIXTURES:
        tmp = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp, "0001_fixture.sql"), "w", encoding="utf8") as fh:
                fh.write(sql)
            saved = mod.MIG_DIR
            mod.MIG_DIR = tmp
            try:
                tables, checks = mod.replay()
            finally:
                mod.MIG_DIR = saved
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        for table, cols in expected_cols.items():
            got = tables.get(table, set())
            if got != cols:
                failures.append(
                    f"{name}\n     table {table} columns\n"
                    f"     expected {sorted(cols)}\n     got      {sorted(got)}")

        if expected_checks is not None:
            got = sorted((c["table"], c["column"], tuple(c["allowed"])) for c in checks)
            want = sorted(expected_checks)
            if got != want:
                failures.append(
                    f"{name}\n     constraints\n     expected {want}\n     got      {got}")

    if failures:
        print(f"PARSER FIXTURES FAILED ({len(failures)}):")
        for f in failures:
            print("  - " + f)
        return 1
    print(f"parser fixtures passed: {len(FIXTURES)} cases")
    return 0


if __name__ == "__main__":
    sys.exit(run())
