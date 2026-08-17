# Canonical database baseline for the London project — Plan

> **NOTHING IN THIS DOCUMENT IS EXECUTED BY WRITING IT.** No database was connected to, no
> project was accessed, no infrastructure was changed, and no SQL was authored to
> `supabase/migrations/`. Target project `ezsvdsjdtardkxfswjvq` was not touched in any way.
> This is the plan for producing a baseline, not the production of one.

**Date:** 2026-08-17
**Implements:** `docs/migration/lovable-source/drift-report.md` §8 — *ONE REVIEWED CANONICAL
BASELINE. Do not replay the 528 migrations.* (owner decision, 2026-08-17)
**Grounding:** `drift-report.md`, `README.md`, `manual-settings.md`, `migration-manifest.json`
(all under `docs/migration/lovable-source/`); `docs/audits/2026-08-17-def-032-filings-status-investigation.md`;
`docs/releases/production-release-convention.md`; `CLAUDE.md` (Filing Engine architecture,
non-negotiable).

Evidence classes are carried forward from the evidence pack: **[LIVE]** read from the running
source database · **[GIT]** read from the repository · **[EXPORT]** stated by the owner from the
Lovable export's TOC · **[VERIFIED-HERE]** established first-hand while writing this plan ·
**[UNVERIFIED]** not established from any of them.

---

## 1. Objective

Produce **one reviewed canonical schema baseline** — a single SQL artefact, committed to git,
that fully defines the intended database structure of the new company-owned London Supabase
project — derived from the verified Lovable export, stripped of platform artefacts, reconciled
against the independent read-only evidence pack, and reviewed before it is trusted.

The baseline becomes migration #1 of the new project. Every subsequent change is an ordinary
migration on top of it, under `docs/releases/production-release-convention.md`.

### Success is

1. A schema artefact whose provenance is auditable end to end: export → extraction → strip →
   review → commit, with a checksum at every hop.
2. Agreement, object for object, with the four counts the evidence pack captured independently.
3. No Lovable platform artefact, no credential, no data row, no legacy project URL anywhere in it.
4. A target project that passes **behavioural** acceptance — real two-tenant RLS with genuine
   authenticated users — not a catalog count that says the right number of policies exist.

## 2. Non-goals

- **Not a data migration.** Whether any row moves is a separate, unmade decision (§9).
- **Not a fix for DEF-032.** §6 is explicit that no status vocabulary is invented here.
- **Not the Filing Engine build.** `approved_financial_model_versions` does not exist and Sprint 0
  is incomplete (DEF-032 audit §5). The baseline records that reality; it does not remedy it.
- **Not the email rewrite**, the OAuth re-registrations, the Stripe webhook re-registration, or
  the frontend de-coupling from Lovable packages. Those are tracked in `manual-settings.md`
  §§2–4, §9 and sequenced against this plan in §11, but they are not this plan's work.
- **Not a replay of the 528 migrations.** They are retained as provenance and are not deleted.

---

## 3. What is established, and what is not

### 3.1 The export artefact

| Fact | Value | Class |
|---|---|---|
| Filename | `accountancyos_260817.backup` | [VERIFIED-HERE] |
| SHA-256 | `28420b17557249e92fa61cf685d0f84da432e64208a275c67e212a99d13c5321` | **[VERIFIED-HERE]** — recomputed while writing this plan; matches the stated value |
| Size | 39,202,869 bytes (39.2 MB) | [VERIFIED-HERE] |
| Format | PostgreSQL custom-format archive (`PGDMP`, archive format version 1.16) | [VERIFIED-HERE] |
| Source server version | **17.6** | [VERIFIED-HERE] — from the archive header |
| Producing `pg_dump` version | **18.4** | [VERIFIED-HERE] — from the archive header |
| Dumped database name | `postgres` | [VERIFIED-HERE] |
| Copies currently on disk | **three** in `~/Downloads`: `accountancyos_260817.backup`, `accountancyos_260817.backup 2` (byte-identical, same SHA-256), and `accountancyos_260817.backup.zip` | [VERIFIED-HERE] |
| Local `pg_restore` / `pg_dump` / `psql` | **Installed and working — correction, 2026-08-17.** Homebrew `libpq` is present but not linked onto `PATH`; the binaries live at `/opt/homebrew/opt/libpq/bin/`. `pg_restore --version` reports **18.6**, which satisfies the ≥18 requirement below. Verified first-hand: `pg_restore -l` produced the full 4,659-entry TOC, and `pg_restore --schema-only --no-owner --no-privileges` produced a 1.76 MB DDL file containing **zero** `COPY`/`INSERT` data blocks. B0 is therefore a `PATH` fix, not an install. | [VERIFIED-HERE] |

Two consequences that are load-bearing for §4:

- The archive was written by `pg_dump` **18.4**. A `pg_restore` older than 18 will refuse it
  ("unsupported version in file header"). Provisioning a PostgreSQL 18 client toolchain is
  therefore step zero, and the toolchain version must be recorded in the baseline's provenance
  header. This has not been done.
- The extra copies are a custody problem, not a convenience. The file contains full data
  including Auth, Vault, mailbox and bank sections. See §8.1.

### 3.2 Object counts — two independent captures, and they are not directly comparable

| Object | Export TOC, **all schemas** [EXPORT] | Evidence pack, **`public` only** [LIVE] | Expected residual (non-public) |
|---|---|---|---|
| TABLE | 275 | 226 | 49 |
| FUNCTION | 414 | 370 | 44 |
| POLICY | 724 | 688 | 36 |
| TRIGGER | 164 | 155 | 9 |
| INDEX | 585 | 794 | **negative — see below** |
| CONSTRAINT | 349 | not readable | — |
| FK CONSTRAINT | 645 | not readable | — |
| TYPE | 26 | not readable | — |
| EXTENSION | 7 | not readable | — |
| SCHEMA | 10 | not readable | — |
| VIEW | 3 | not readable | — |
| SEQUENCE | 6 | not readable | — |
| EVENT TRIGGER | 6 | not readable | — |
| PUBLICATION / PUBLICATION TABLE | 2 / 2 | not readable | — |
| ACL / DEFAULT ACL | 748 / 33 | 6,369 table-grant rows (`public`, collapsed to 910 statements in `live-schema.sql`) | — |
| TABLE DATA | 277 | n/a | — |

Owner-confirmed public-schema figures from the export — **226 tables, 370 functions, 688
policies, 155 triggers, 622 FKs, 257 CHECK constraints** — match the evidence pack on the first
four. That is the reconciliation this plan formalises in §5.

**The index line is a trap and must not be reported as a discrepancy.** `pg_dump`'s TOC files
indexes that back a PRIMARY KEY or UNIQUE constraint under `CONSTRAINT`, not `INDEX`. So 585
INDEX + 349 CONSTRAINT (934, all schemas) is the number that has to be reconciled against the
pack's 794 `public` indexes — by classification, never by naive equality. Any reconciliation
script that compares 585 to 794 is wrong.

**Nothing above licenses comparing an all-schema TOC count to a public-schema live count.** Every
count in §5 must be recomputed from the export **restricted to `public`** before it is compared.

### 3.3 What the export closes, and what it does not

Closes (previously `unavailable` in the evidence pack): CHECK / FK / exclusion constraints,
types, views, sequences, extensions, non-public schemas, event triggers, publications, default
privileges, and — because the dump carries data — `storage.buckets` **rows**, which settles the
4-versus-10 bucket question offline (§7.8).

Does **not** close: Auth *configuration* (`manual-settings.md` §1), storage *files*, Edge
Function code and deployment state, secret values, user passwords, and project-level settings
(`manual-settings.md` §8). Those remain Dashboard captures and rebuild work.

### 3.4 Why replay was rejected (recorded, not re-argued)

From `drift-report.md` §8, over 528 files [GIT]: 473 executor-generated filenames; 17 schedule
cron; 13 hard-code the legacy ref `moxpdejnucjjcplleefn`; 11 reference `sandbox_exec`; 4
executable `ALTER ROLE sandbox_exec … NOBYPASSRLS` against a role no migration creates. Replay
reproduces DEF-032 exactly — the three CHECKs were *created* by this pattern — and is incomplete
anyway, because five live cron jobs and the true bucket set exist nowhere in history.

---

## 4. Baseline derivation pipeline

Ten steps. Each produces a checksummed artefact and each is reversible up to the commit at B9.
Nothing here runs against any database: `pg_restore` is used **only** with `-f` to a file, and
**never** with `-d`.

### B0 — Toolchain and custody
- [ ] **Superseded by the correction in §3.1** — no install is required. Homebrew `libpq` is
      already present at `/opt/homebrew/opt/libpq/bin/` with `pg_restore` **18.6**, verified
      working against this archive on 2026-08-17. Either add that directory to `PATH` or invoke
      the binaries by absolute path, and record which was used. The original step read:
      Install a PostgreSQL **18.x** client (`pg_restore`, `pg_dump`, `psql`). Record the exact
      version string; it goes in the baseline provenance header.
- [ ] Reduce the export to **one** working copy in a directory outside the repo and outside any
      sync/backup path, mode `0600`. Delete `accountancyos_260817.backup 2` and the `.zip`
      *after* re-verifying the SHA-256 of the survivor. Three copies of a file containing live
      bank and mailbox tokens is three times the exposure.
- [ ] Add the export filename pattern to `.gitignore` **before** any extraction begins. (Editing
      `.gitignore` is outside this plan's write permission; it is a step for whoever executes.)
- [ ] Re-verify `28420b17…5321` at the start of every session that touches the file.

### B1 — Table of contents inventory (no extraction)
- [ ] `pg_restore -l accountancyos_260817.backup > toc.txt` — a listing only; it opens no
      connection.
- [ ] Parse `toc.txt` into `docs/migration/export-toc.json`: one record per entry with
      `{dumpId, schema, type, name, owner}`. This file is **committable** — it is object names
      and types, no definitions, no values.
- [ ] Assert the per-type totals equal §3.2's TOC column. A mismatch here means the owner's
      figures were read from a different artefact and everything downstream is unfounded — **stop**.
- [ ] Produce the per-schema breakdown that §5 requires: counts by `(schema, type)`.

### B2 — Schema-only extraction
Two extractions, because privileges need separate handling from structure:

- [ ] `pg_restore --schema-only --no-owner --no-comments=false -f raw-schema-with-acl.sql <archive>`
      — structure **including** GRANT statements.
- [ ] `pg_restore --schema-only --no-owner --no-privileges -f raw-schema-no-acl.sql <archive>`
      — structure only. The diff between the two isolates all 748 ACL statements for the
      §7.6 review, so grants are reviewed as a set rather than scattered through 30k lines.
- [ ] `--no-owner` is mandatory: ownership on the target is Supabase's `postgres`, and copying
      `supabase_admin` / `sandbox_exec` ownership is both wrong and impossible.
- [ ] Never pass `-d`. Never pass `-c` / `--clean`. Never pass `--data-only`.
- [ ] Checksum both outputs and record them.

### B3 — Segment for review
A 30,000-line file is not reviewable, and "one canonical baseline" is a statement about the
*applied artefact*, not about how it is read.

- [ ] Split `raw-schema-with-acl.sql` into an ordered, numbered working set under a scratch
      directory (not `supabase/migrations/`):
      `00_extensions` · `01_schemas` · `02_types` · `03_sequences` · `04_tables` ·
      `05_functions` · `06_constraints_pk_uq_check` · `07_indexes` · `08_fks` · `09_views` ·
      `10_triggers` · `11_rls_enable` · `12_policies` · `13_grants` · `14_publications` ·
      `15_comments`.
- [ ] The dependency order above is also the apply order. FKs after all tables; policies after
      the functions they call (345 of 370 functions are SECURITY DEFINER and many policies call
      them); triggers after functions.
- [ ] Record the line count and checksum of each segment. Every later step edits segments, never
      the raw extraction — the raw file stays immutable as the provenance root.

### B4 — Strip (the removal list is mechanical and gated)
Each rule below becomes a named check in a strip script whose output is a **report**: what was
removed, from which line, and why. A silent strip is not reviewable.

| # | Remove | Rationale |
|---|---|---|
| S1 | Everything in schemas `auth`, `storage`, `vault`, `realtime`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `pgsodium`, `supabase_functions`, `supabase_migrations`, `cron`, `net`, `_realtime` — whichever of the 10 SCHEMA entries prove to be these | Supabase provisions them. Recreating platform-owned objects fights the platform and is how `sandbox_exec`-class drift starts. Enumerate from B1, do not assume this list. |
| S2 | `CREATE ROLE` / `ALTER ROLE` / `DROP ROLE` of any kind | The target's roles are Supabase's. No role is created by the baseline. |
| S3 | Every `sandbox_exec` reference: ownership, `GRANT … TO sandbox_exec`, `ALTER … OWNER TO sandbox_exec`, membership | Owner decision 8, already taken: not recreated. DEF-031 exists because platform automation kept restoring `BYPASSRLS` on it. |
| S4 | Any `BYPASSRLS` / `NOBYPASSRLS` / `SUPERUSER` token, anywhere | No baseline object may confer RLS bypass. |
| S5 | Every occurrence of `moxpdejnucjjcplleefn` and every `*.lovable.app` / `*.lovableproject.com` literal — in function bodies, defaults, comments and CORS lists alike | 13 migrations carry legacy URLs [GIT]; leaving one points the new project's traffic at the old backend. |
| S6 | All `TABLE DATA` — no `COPY`, no `INSERT`, no `setval()` | §8. |
| S7 | Event triggers (6) that match the Supabase platform set — expected to be the `pgrst_ddl_watch` / `pgrst_drop_watch` / `issue_*_access` family | **Expectation, not fact.** Verify each of the 6 by name against a freshly created Supabase project. Any name that is genuinely app-authored is kept and flagged for review; the rest are removed. |
| S8 | `ALTER … OWNER TO`, `SET SESSION AUTHORIZATION`, and `pg_dump` preamble `SET`s that pin a server version | Portability. |
| S9 | The `supabase_realtime` publication's `CREATE PUBLICATION` | It exists on a fresh project. Membership is re-declared instead (§7.5). |
| S10 | Any literal that matches a credential shape: `eyJ` (JWT prefix), `Bearer `, `sk_`, `whsec_`, `postgres://`, `postgresql://` | Fail-closed. A hit is a **stop**, reviewed by a human, not auto-stripped — five cron commands carry literal anon JWTs [LIVE] and their pattern may appear elsewhere. |

**Kept, in full:** every `public` table, column, default, PK, UNIQUE, CHECK (all 257) and FK (all
622); all 26 types; all 6 sequences; all 3 views; all 370 functions; all 155 triggers;
`ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all 226 tables; all 688 policies; comments; and the
grants surviving §7.6.

### B5 — Rewrite the small number of things that cannot be copied
- [ ] Extensions: re-authored as an explicit, ordered `CREATE EXTENSION IF NOT EXISTS <name>
      WITH SCHEMA extensions;` block for the delta between the export's 7 and what a fresh
      Supabase project already provisions (§7.2).
- [ ] Publication membership: re-authored as `ALTER PUBLICATION supabase_realtime ADD TABLE …`
      plus the matching `REPLICA IDENTITY` (§7.5).
- [ ] Function bodies that the evidence pack sanitized (`email_queue_dispatch`,
      `email_queue_wake`, `redact_secrets`) come from the **export**, not from `live-schema.sql`
      — the pack's copies are explicitly not executable as printed (README, *Fidelity caveats*).
      Their legacy URLs are then rewritten under S5, and the rewrite is reviewed line by line.
- [ ] Cron jobs: **not in the baseline at all.** Authored fresh, later, credential-free (§7.9).

### B6 — Reconciliation gate → §5. The pipeline stops here until §5 passes.

### B7 — Human review
The drift report's recommendation is a baseline *"reviewed by a human"*. That word is doing real
work and there is a standing constraint against it: the owner has stated he cannot review code.
The honest resolution is not to pretend the review happened.

Proposed review construction — **this is an owner decision (§13, D-1)**, not a settled process:

1. **Mechanical gates, all of which must pass and each of which emits evidence, not a verdict:**
   the §5 count reconciliation; the S1–S10 strip report with zero unreviewed removals; a
   full-text scan for the §8 banned list; `raw-schema-no-acl.sql` diffed against the reviewed
   segments so that *every* delta is attributable to a named strip rule; and the drift-registry
   check (`src/lib/db-constants/check-constraints.ts`) re-run against the baseline's actual
   constraint set.
2. **A second, independent agent review** of each segment against the evidence pack, reporting
   findings rather than applying them — the pattern that produced the DEF-032 audit.
3. **A named human engineer** signs the segments a machine cannot judge: the 3 views'
   `security_invoker` setting, the 688 policy predicates, the 345 SECURITY DEFINER functions'
   `search_path`, and the grant matrix.
4. **Owner sign-off on decisions, not on SQL** — the §13 list, in writing.

If no engineer is available for (3), that is a gap to record explicitly in the baseline's
provenance header. It is not a reason to call (1) and (2) a human review.

### B8 — Provenance header
The baseline opens with a comment block carrying: export filename and SHA-256; source server
17.6 and `pg_dump` 18.4; extraction command lines verbatim; `pg_restore` version used; the strip
report checksum; the §5 reconciliation result; reviewer names and dates; and the explicit
statement that DEF-032 is carried forward unresolved with its defect ID (§6).

### B9 — Commit
- [ ] Commit as **one** SQL file plus the review artefacts (`export-toc.json`, strip report,
      reconciliation report). Filename and location: an owner decision (§13, D-2), because it
      interacts with what happens to the 528 (§10).
- [ ] The baseline is a release artefact under `docs/releases/production-release-convention.md`
      §3 and needs a receipt with `expected_objects` and a live `verify_via` (§10).

---

## 5. Reconciliation gate — the export against the independent pack

Two captures exist, taken by different routes on the same day: the export (privileged, produced
by Lovable) and `docs/migration/lovable-source/live-inventory.json` (read-only, produced through
the Lovable connector, commit `62902dd`). They agree on four counts. That agreement is the only
independent corroboration available and it must be re-established mechanically, not cited.

### 5.1 Method
- [ ] From `export-toc.json`, compute `public`-schema-only counts for TABLE, FUNCTION, POLICY,
      TRIGGER.
- [ ] From `live-inventory.json`, read `len(tables)`, `len(functions)`, `len(rls.policies)`,
      `len(triggers)` — **verified while writing this plan** to be 226 / 370 / 688 / 155.
- [ ] Compare **as sets of qualified names**, not as integers. Two captures can both say 226 and
      disagree about which 226. Set equality is the assertion; the count is a by-product.
- [ ] Attribute every non-public residual (49 tables, 44 functions, 36 policies, 9 triggers) to a
      named schema from B1's per-schema breakdown. An unattributed residual is a divergence.
- [ ] Indexes: classify the export's 585 INDEX + 349 CONSTRAINT entries into
      constraint-backed versus standalone before comparing with the pack's 794 (§3.2).
- [ ] Grants: the pack holds 6,369 table-grant rows for `public`; the export holds 748 ACL
      entries (an ACL entry is per-object, not per-grantee-privilege). Expand the export's ACLs
      to grantee×privilege rows before comparing.
- [ ] Functions: compare `pg_get_functiondef` bodies where the pack has them — 367 of 370 are
      verbatim. A body-level match on 367 functions is far stronger evidence than a count.

### 5.2 Stop conditions (all of them halt the pipeline; none is a warning)
1. Any name present in one capture and absent from the other, in either direction.
2. Any of the four counts disagreeing after public-schema restriction.
3. An unattributable non-public residual.
4. A function body differing between export and pack, other than the three sanitized ones.
5. A table with RLS enabled in one capture and not the other — the pack recorded RLS on
   **226 of 226**, `relforcerowsecurity` false on all.

**Divergence means one of the two captures is not describing the source project.** Both were
taken on 2026-08-17, so drift is not an available explanation for a same-day difference of any
size. The correct response is investigation and a written finding, never a reconciliation by
picking a winner.

---

## 6. DEF-032 — how a contradiction is carried without being inherited

### 6.1 The problem restated
`public.filings.status` carries three overlapping CHECK constraints (`valid_status` 6 values,
`chk_filings_status` 15, `chk_filing_status` 13) **and** a BEFORE UPDATE trigger
`filing_status_transition_check` enforcing a fifth vocabulary. Intersected, `draft` is terminal:
every filing is inserted `draft` and can never leave. The application writes 18 distinct values;
5 of them exist in no constraint of any generation. The Filing Engine spec mandates a different
model entirely — 9 states on `submissions.state`, and **no `filings` table at all** — and
`approved_financial_model_versions` does not exist, so spec Sprint 0 is incomplete.
(`docs/audits/2026-08-17-def-032-filings-status-investigation.md`.)

**Ten owner rulings are listed in that audit's §9. None has been made.** The repo rule is that no
fix may be designed before the canonical filing lifecycle is reconciled with the spec, and
CLAUDE.md makes the Filing Engine architecture non-negotiable.

A baseline must not quietly carry three contradictory constraints forward as though they were
design. Equally, it must not resolve them, because resolving them *is* the unmade decision.

### 6.2 Options

**Option A — baseline the schema exactly as it is; DEF-032 becomes a follow-on migration.**
The baseline reproduces all three CHECKs and the trigger verbatim. Remediation lands later, on
top, once the rulings are made.
*For:* the baseline stays a faithful, verifiable transcription of a known state, which is the
only property that makes §5 meaningful. Migration work proceeds now. No vocabulary is invented.
*Against:* the new project launches with a P1 defect built into its founding artefact, and the
forcing function is lost — "we'll fix it in a follow-on" is exactly the triage that left
`20260620150856` unapplied and caused this (DEF-032 audit §2).

**Option B — block the baseline until all ten rulings are made.**
*For:* the new project is born correct; no contradictory constraint ever exists on it.
*Against:* ruling 1 asks whether `public.filings` survives at all, and ruling 8 turns on building
`approved_financial_model_versions` — a Sprint 0 gate that does not exist yet. That is product
architecture work of unknown duration, and it blocks *every* unrelated part of the migration
behind it: email rewrite, OAuth, storage, cutover. It also lets the export age: the source
project continues to receive Lovable executor migrations, so the longer the gap, the less the
baseline describes the live system, and a second export is capped at one per 24 hours and
becomes undownloadable the moment Cloud is removed.

**Option C — baseline as-is, but quarantined and gated. (Recommended.)**
Option A's artefact plus three binding additions:
1. **A named quarantine block** in the baseline at the `filings` constraint site: a comment
   naming DEF-032, listing all three constraint names and the trigger, stating that the
   intersection is empty from `draft`, and pointing at the audit. The defect is unmissable in
   the artefact rather than discoverable only by re-deriving it.
2. **A release gate, not a backlog item.** The London project may be built, verified and
   exercised, but **cutover does not happen** until the DEF-032 rulings land and the remediation
   migration is authored on top of the baseline and verified. This is the forcing function that
   Option A loses, without Option B's total block.
3. **Drift-registry extension shipped with the baseline** (DEF-032 ruling 9): the registry at
   `src/lib/db-constants/check-constraints.ts` currently registers *one* of the three constraints
   for this column, which is why the vocabulary-drift test passed throughout. The baseline is the
   moment the registry can be regenerated from a complete, first-hand constraint set — the export
   is the first artefact that actually contains all 257 public CHECKs. The registry must model
   **the constraint set per column plus transition triggers**, and the test must assert the set.

**Rejected without further consideration:** omitting `filings` from the baseline. It sits inside
a 622-edge FK graph; removing it produces a schema that does not build.

### 6.3 Recommendation

**Option C.** Baseline the schema as-is, annotate the defect explicitly, gate cutover on the
rulings, and ship the registry fix with the baseline.

The reasoning: the baseline's value is that it is a *verifiable transcription*. The moment it
contains a judgement about what `filings.status` should be, §5's reconciliation stops meaning
anything and the artefact becomes an opinion. Option B is right in principle and wrong in
sequencing — it makes an unstarted architecture decision the critical path for an infrastructure
migration whose other blockers (email provider, OAuth registrations, storage) are independent and
long-lead. Option A is right in sequencing and wrong in discipline. C separates them: the
transcription is honest, and the defect is a gate rather than a note.

**No status vocabulary is proposed here, and none may be inferred from this plan.** The ten
rulings in the audit's §9 remain the owner's, in the order given.

### 6.4 What the export unblocks at zero risk

Two of the ten rulings become answerable **offline from the export**, without touching any live
system:

- **Ruling 6** — the `filings.status` distribution across all tenants. The audit records this as
  unanswerable through the connector, because `db_select` is RLS-scoped (it returned 0 rows,
  which is not evidence of an empty table). The export contains the data. A read of that one
  table's status column from the dump sizes any future data migration and reveals which
  non-writable legacy values `NOT VALID` has been tolerating. It is a read of a local file, not a
  privileged live read — the authorisation ruling 6 asks for may not even be needed.
- **Ruling 4**, partly — the three CHECK definitions could not be re-read live (audit §8); they
  came from migration sources in git. The export carries them first-hand, so the audit's one
  second-hand claim can be upgraded to primary evidence.

This should be done during B1/B2, and the findings appended to the DEF-032 audit as an
addendum — **as evidence, not as a fix.**

---

## 7. Objects needing explicit treatment

### 7.1 Types (26)
The evidence pack contains **no `CREATE TYPE` statement at all**; 12 of 14 user-defined column
types and 17 of 20 array element types were *inferred* from default casts, and 5 are emitted as
`…_UNAVAILABLE`. The export is the only source of truth for all 26.
- [ ] Enum value **order** is semantically significant (ordering comparisons, and `ADD VALUE
      BEFORE/AFTER` later). Preserve verbatim.
- [ ] Cross-check each of the pack's 5 `UNAVAILABLE` placeholders against the export and record
      the resolution — these are the pack's known blind spots and the export closes them.
- [ ] Any type used only by an object removed under S1 is dropped from the baseline and listed in
      the strip report.

### 7.2 Extensions (7)
Not readable in the pack (`pg_extension` inaccessible); `pg_cron` and `pg_net` were inferred from
cron command text and `net.http_post` calls in function bodies.
- [ ] Enumerate the 7 from B1. Do not guess the set.
- [ ] Compare against what a freshly created Supabase project already provisions; the baseline
      creates only the delta, `WITH SCHEMA extensions` per Supabase convention — never into
      `public`.
- [ ] `pg_cron` and `pg_net` must exist **before** any cron authoring (§7.9), and that ordering is
      already recorded in `manual-settings.md` §8.
- [ ] Record versions. An extension version difference between 17.6 and the target's server
      version is a real behavioural difference and must be noted, not assumed benign.

### 7.3 Views (3)
- [ ] Each of the 3 must be reviewed for `security_invoker = on`. A view without it runs as its
      owner and **bypasses the RLS of its base tables** — a 226-table RLS estate is undone by one
      view. This is a named human review item in B7(3).
- [ ] Confirm none is a materialized view masquerading as fresh data; the pack could not
      distinguish relkind `v` from `m`.

### 7.4 Sequences (6)
- [ ] Preserve `OWNED BY` and identity/serial association; a detached sequence silently breaks
      defaults.
- [ ] **No `setval()`.** Sequence position is data. With nothing seeded, sequences start at 1. If
      data *is* migrated (§9), sequence advancement becomes an explicit, verified step of that
      work — not a side effect of the baseline.

### 7.5 Publications and Realtime (2 publications, 2 publication tables)
- [ ] Realtime membership was `unavailable` in the pack — which tables are published and their
      `REPLICA IDENTITY` were both unknown. The export answers it: only **two** table memberships
      exist across both publications.
- [ ] Do not `CREATE PUBLICATION supabase_realtime` — it exists on a fresh project. Re-declare
      membership with `ALTER PUBLICATION … ADD TABLE`, and set `REPLICA IDENTITY` to match the
      export for each.
- [ ] Identify the second publication before deciding it survives; if it is platform-owned
      (`supabase_realtime_messages_publication` or similar), it is an S1 removal.
- [ ] Verify behaviourally: a Realtime subscription that actually receives a change, not a
      catalog row.

### 7.6 ACLs (748) and default ACLs (33)
This is the largest review surface and the one most likely to be rubber-stamped.
- [ ] Rebuild the grant matrix from an **explicit policy** over `anon`, `authenticated`,
      `service_role` — not by transcribing 748 entries. The output is then diffed against the
      export's ACLs and every difference is explained in writing. Transcription copies mistakes;
      derivation surfaces them.
- [ ] **DEF-015 is a regression risk here.** `anon` EXECUTE was deliberately revoked
      (`20260801120000_def_015_revoke_anon_execute.sql`). Verify the export postdates that
      revocation and that no `GRANT EXECUTE … TO anon` re-enters through the baseline. This
      belongs in §12's acceptance list as a positive assertion.
- [ ] Drop every grant to `sandbox_exec`, `supabase_admin`, `postgres`-as-owner and any role not
      in the three above (S3).
- [ ] The 33 default ACLs (`ALTER DEFAULT PRIVILEGES`) determine what *future* objects inherit
      and were entirely invisible to the pack. Review each individually — a default privilege is
      a standing grant to objects that do not exist yet.

### 7.7 Event triggers (6)
Expected to be the Supabase platform set (S7). **Verify by name against a fresh project.** Any
app-authored event trigger is a significant object — it fires on DDL — and needs its own review
and an explicit keep/drop decision.

### 7.8 Storage buckets — resolvable now
Git disagrees with itself: migrations create 8, policies reference 2 more created outside git,
and `infra/supabase-manifest.json` declares 4 that match **none** of the 10. `drift-report.md`
§3.2 recommends *neither* source until live is read.
- [ ] The export includes `storage` schema **table data** (277 TABLE DATA entries). Extract
      **`storage.buckets` rows only** — name, public flag, file size limit, allowed MIME types.
      This is bucket *metadata*, not files, and it settles drift-report owner decision 3 offline.
- [ ] **Do not extract `storage.objects`.** Rows there are object metadata for files the export
      explicitly does not contain; restoring them creates references to files that do not exist.
- [ ] Bucket creation and storage RLS policies are authored fresh against the resolved set, as a
      migration **after** the baseline — buckets are `storage` schema and fall under S1.
- [ ] Reconcile the resolved set against the 10 git names and correct `infra/supabase-manifest.json`
      (drift-report owner decision 9: regenerate the manifest from the target, do not carry it).

### 7.9 Cron jobs (13)
Authored fresh, credential-free, **not in the baseline**, and not before the Vault entry exists.
- [ ] Five jobs currently embed a **literal anon JWT** in `cron.job.command` [LIVE]. Those tokens
      are rotated, never copied. Every new job uses the vault-lookup form the other eight use.
- [ ] The Vault copy of the service-role key must exist **before** any job that reads it is
      scheduled — the DEF-003 migration deliberately refuses to apply otherwise, because a job
      that 401s every minute manufactures the appearance of a working drain
      (`manual-settings.md` §5).
- [ ] `CRON_SECRET` does not exist in the source Vault [LIVE], yet `truelayer-sync-hourly` reads
      that exact name. Create it on the target, or change the mechanism — drift-report owner
      decision 5.
- [ ] Job names are unresolved: git schedules `chaser-tick` / `chaser-trigger-scan`; live runs
      `chaser-tick-every-15min` / `chaser-trigger-scan-every-6h`. Because `cron.schedule` upserts
      on name, guessing produces duplicates rather than an error — drift-report owner decision 6.
- [ ] Three live jobs (`dormant-lead-scan-daily`, `invoice-overdue-scan-daily`,
      `truelayer-sync-hourly`) exist in no migration and must be authored from scratch.
- [ ] Acceptance is an actual **2xx delivery**, never a green `pg_cron` run — four jobs currently
      401 on every run while `pg_cron` reports success (drift-report §5.2).
- [ ] `20260720120000_schedule_process_email_queue.sql` **must never be applied** — superseded,
      and it carries the DEF-018 GUC defect [GIT].

### 7.10 Roles
The baseline creates no role. The target's roles are `anon`, `authenticated`, `service_role`,
`postgres` and Supabase's internals. `sandbox_exec` is not recreated (decided). CI's
`scripts/precheck-rls-boundary.ts` currently exists specifically to defend against that role's
`BYPASSRLS` reverting; on the target it becomes a general assertion that **no login role has
`rolbypassrls`**, which is stronger and should be kept rather than retired.

---

## 8. What must NOT go into the baseline

Absolute, and enforced by a scan that fails the build on any hit:

1. **Any data row.** No `COPY`, no `INSERT`, no `setval`. The one sanctioned read of data from
   the export (§6.4 `filings.status` distribution, §7.8 `storage.buckets`) produces *findings in
   a document*, never SQL in the baseline.
2. **Any Auth user, identity, session or refresh token.**
3. **Any storage object row.**
4. **Any Vault entry** — name or value. Vault entries are created by hand on the target
   (`manual-settings.md` §5).
5. **Any secret value**: JWT (`eyJ`), service-role key, anon key, `Bearer` literal, `sk_`/`whsec_`
   Stripe key, OAuth client secret, gateway password, connection string.
6. **`sandbox_exec`** in any form.
7. **`BYPASSRLS` / `SUPERUSER`** in any form.
8. **Any legacy project URL** (`moxpdejnucjjcplleefn`) or Lovable host (`*.lovable.app`,
   `*.lovableproject.com`).
9. **`ALTER ROLE` / `CREATE ROLE` / `SET SESSION AUTHORIZATION` / `ALTER … OWNER TO`.**

Note for whoever writes the scan: `live-schema.sql` in the evidence pack contains 253
`INSERT INTO` and 7 `auth.users` occurrences that are all **inside PL/pgSQL function bodies** —
application logic, not data. The scan must distinguish body text from top-level statements or it
will produce 260 false positives and be switched off.

---

## 9. Data and Auth

### 9.1 The premise that decides everything
The brief states all current data is test data. **This is unconfirmed** (drift-report owner
decision 7) and it determines whether anything is seeded at all. It must be confirmed explicitly,
in writing, before any data step is designed — not assumed because it is convenient.

- **If confirmed:** nothing is restored. The target is seeded deterministically from fixtures
  (`scripts/fixtures/`), Auth users are recreated by invitation, and the password/email trap
  below becomes moot.
- **If not confirmed:** a per-table allow-list, a PII review, an ordering plan for 622 FKs, and
  sequence advancement all become required work — and none of it is designed in this plan.

### 9.2 Passwords and the ordering trap
User passwords are **not** in the export (vendor documentation, `manual-settings.md` §10). Every
Auth user must therefore reset on the target. The reset email routes through Lovable Email, which
does not survive the migration.

**The replacement email provider must be live, domain-verified (SPF + DKIM) and tested on the
target BEFORE cutover** — otherwise users cannot log in and cannot recover. This is an ordering
constraint, not a task-list item; it inverts the intuitive sequence in which email is treated as
a follow-up. It is moot only if §9.1 is confirmed.

### 9.3 Custody of the export as a data artefact
The export contains full data including Auth, Vault, mailbox and bank sections. Gmail, Outlook
and TrueLayer access and refresh tokens are stored **in plaintext** (drift-report §5.3), so the
file contains live, usable third-party credentials.
- Never committed, never uploaded, never placed in a synced folder, one copy, `0600` (B0).
- A written disposal decision once the target is verified and Cloud is removed.
- Anyone who has held a copy is a disclosure surface; keep the list short and recorded.

---

## 10. Interaction with the release convention and the 528

### 10.1 The baseline is a release artefact
Under `docs/releases/production-release-convention.md` §3 it needs a merged PR, a commit SHA, a
content checksum, a receipt in `docs/releases/release-log.jsonl`, and independent post-release
verification with **recorded evidence** — §6 of the convention is explicit that a definition-exact
catalog check is required, not object-existence by name.

### 10.2 What retires at cutover
- **The applied-escape and the timestamp allow-list.** Lovable's executor re-timestamps and
  re-authors migrations (473 of 528 files); the receipt convention exists to compensate. Once git
  drives the deploy, migration filenames are stable and the compensation is unnecessary
  (`manual-settings.md` §9).
- **`release_kind: "attestation-based"`.** Convention §10 records that git-pinned deployment is
  unachievable on the Lovable executor surface. Owning the deploy pipeline closes both gaps, and
  §10 must then be revised and `release_kind: "git-pinned"` introduced. That is a convention
  change to schedule, not to make silently.
- **The unreadable migration ledger.** §1a records that `supabase_migrations.schema_migrations`
  is readable by neither party. On an owned project it is readable, which changes what evidence
  is available — but object verification remains the authoritative proof, for the reason §1a
  gives: a ledger row proves a file ran, not that its effect landed.

### 10.3 What happens to the 528 files — unresolved
They are retained as provenance and not deleted (decided). But if they remain in
`supabase/migrations/` on the new project, `supabase db push` will attempt to apply all 528 on
top of the baseline. Two options, and this is **owner decision D-3**:

- **(a) Relocate** to an archive path (e.g. `docs/migration/legacy-migrations/`) indexed by the
  existing `migration-manifest.json`, with `supabase/migrations/` restarting at the baseline.
  *Cleaner; the manifest already carries all 528 SHA-256s so provenance is intact.*
- **(b) Keep in place** and pre-seed the target's `schema_migrations` with all 528 versions so
  the CLI treats them as applied. *Preserves paths, but fabricates ledger rows for migrations
  that never ran on that database — the same "ledger as evidence" confusion convention §1a
  warns about.*

Recommendation: **(a)**. Note that executing either requires writing to `supabase/migrations/`,
which is outside this plan's permission.

---

## 11. Sequencing and cutover

Irreversibility first, because it constrains everything:

- The export **cannot be downloaded after Lovable Cloud is removed**, and removal *"permanently
  deletes your Cloud instance and cannot be undone"* [VENDOR DOC]. One export per 24 hours; 5 GB
  cap (the source database size is `unavailable`, so the cap is unverified — though 39.2 MB
  compressed suggests ample headroom, that is inference, not a size reading).
- **The export already exists and is verified** (§3.1). The single most dangerous mistake
  available — removing Cloud before exporting — has been avoided. The remaining rule is: **do not
  remove Lovable Cloud until the target is fully verified against §12.**
- Pausing Cloud suspends database, auth, storage and Edge Functions but still accrues storage
  usage — it is a cost lever, not a safety step, and it does not preserve the export route.

Order:

1. **Now (no live dependency):** B0–B9 baseline derivation; §5 reconciliation; §6.4 offline
   DEF-032 and §7.8 bucket reads; §13 owner decisions.
2. **In parallel, independent of the baseline:** replacement email provider selected, domain
   verified, `auth-email-hook` and `process-email-queue` rewritten off `@lovable.dev/*`; OAuth
   re-registrations (Google, Microsoft, TrueLayer, HMRC, Companies House); Stripe webhook
   re-registration; frontend de-coupling (`vite.config.ts:7-8` hard-codes the legacy ref with an
   anon-key fallback; `supabase/functions/mcp/index.ts` is generated build output carrying a
   legacy ref and must not be committed).
3. **Then:** apply the baseline to the London project; create Vault entries; set the 45 Edge
   Function secrets (all six Supabase-generated values are new; `LOVABLE_API_KEY` /
   `LOVABLE_SEND_URL` retired; `ENCRYPTION_KEY` **rotated** per the 2026-08-17 decision, with the
   published-constant fallback removed and the `padEnd(32).slice(0,32)` derivation replaced by a
   real KDF); create storage buckets from the resolved set; deploy Edge Functions; author the 13
   cron jobs last, after the Vault entry exists.
4. **Then:** Auth configuration re-entered from a Dashboard capture of the source
   (`manual-settings.md` §1 — all of it currently `unavailable`), with `accountancyos.lovable.app`
   **excluded** from the redirect allow-list.
5. **Then:** §12 acceptance in full, including a rehearsed restore — the 2026-07-28 audit left
   Gate 7 (recoverability) at INSUFFICIENT EVIDENCE because no restore has ever been rehearsed.
6. **Gate:** DEF-032 rulings made and the remediation migration authored and verified (§6.2
   Option C, item 2).
7. **Then and only then:** cutover, followed — after a stand-down period — by Cloud removal.

---

## 12. Verification and acceptance criteria

Catalog counts are **necessary and not sufficient**. Every criterion below that can be proven
behaviourally must be.

### 12.1 Behavioural (the ones that actually decide)
1. **Two-tenant RLS with genuine authenticated users.** Real accounts in two different
   organisations, signing in through the normal auth path. Org A must be unable to read, write or
   count any Org B row across the tables that carry tenant data. **Never through a role that
   could bypass RLS** — no `service_role`, no `postgres`, no login role with `rolbypassrls`.
   `scripts/precheck-rls-boundary.ts` runs first and fail-closed; `scripts/smoke-test.ts` and the
   CI `SMOKE_RLS_ORG_A_*` / `SMOKE_RLS_ORG_B_*` secrets are re-issued against the target.
2. **An enqueued email delivered end to end** through the replacement provider, including the
   branded auth path and the unsubscribe path (`handle-email-unsubscribe`).
3. **A password reset completed by a real user** on the target — this is the §9.2 trap's
   acceptance test.
4. **Each of the 13 cron jobs proven by an actual 2xx delivery**, evidenced from response records,
   not from a green `pg_cron` run. Four jobs currently 401 on every run while `pg_cron` reports
   success; that failure mode must be impossible to repeat undetected.
5. **A Realtime subscription receiving an actual change** on each published table (§7.5).
6. **One end-to-end product journey** exercised against the target: client → job → deadline →
   document. Enough to prove the 345 SECURITY DEFINER functions and 688 policies compose.
7. **`/version` reports the deployed commit SHA** for the frontend and every function — the gap
   DEF-020 has been open on since July, and the new project is the moment to close it rather than
   inherit it.
8. **A restore rehearsal**: take a backup of the target, restore it somewhere, prove it works.
   Gate 7 has never been evidenced.

### 12.2 Structural (assert, but do not mistake for proof)
9. Set-equality against the export on all `public` objects: 226 tables, 370 functions, 688
   policies, 155 triggers, 622 FKs, 257 CHECKs, 26 types, 3 views, 6 sequences.
10. RLS enabled on **all 226** tables — zero exceptions, and the exception list must be empty
    rather than short.
11. **No role with `rolbypassrls` AND `rolcanlogin`.** No role named `sandbox_exec` exists.
12. Zero occurrences of `moxpdejnucjjcplleefn`, `lovable.app`, `lovableproject.com`,
    `BYPASSRLS`, or any credential-shaped literal, anywhere in the database or in the deployed
    function bundle.
13. `anon` holds no EXECUTE it should not (DEF-015 preserved, §7.6).
14. All 3 views are `security_invoker = on`, or each exception is individually justified in
    writing.
15. Supabase Security Advisor run **against the target** and every finding triaged. The pack's
    advisor results are from an unrelated project and must not be cited.
16. `npx vitest run` and `npx tsc --noEmit` clean against the target's generated types. The
    baseline at capture was 914 passed / 0 failed / 89 files, `tsc` clean — any regression is
    attributable.
17. `infra/supabase-manifest.json` **regenerated from the target**, not carried across. It
    currently declares 5 secrets no function reads, omits 25 that are required, and names 4
    buckets that match nothing.

---

## 13. Owner decisions still required

Carried forward from `drift-report.md` §9 and the DEF-032 audit §9, plus decisions this plan
raises. Nothing below is inferred or pre-answered.

**New, raised by this plan:**
- **D-1. What constitutes the "human review" in B7?** The recommendation is B7(1)–(4) with a
  named engineer for (3). If no engineer is available, that gap is recorded rather than papered
  over.
- **D-2. Baseline filename and location** — interacts with D-3.
- **D-3. The 528 files: relocate to an archive path, or keep in place and pre-seed the ledger?**
  Recommendation: relocate (§10.3(a)).
- **D-4. Approve the DEF-032 handling: Option C** (§6.2) — baseline as-is, quarantine-annotated,
  cutover gated on the rulings, drift registry shipped with the baseline.
- **D-5. Disposal policy for the export file** once the target is verified (§9.3).

**Outstanding from the drift report:**
- **3. Storage buckets** — now answerable offline from the export (§7.8); still needs
  confirmation of the resolved set.
- **4. Email provider**, and whether the auth send-email hook moves with it.
- **5. The TrueLayer job pair** — which is canonical, and where the cron secret lives.
- **6. The chaser jobs** — git names or live names.
- **7. Data migration** — confirm the "all test data" premise (§9.1). **This is the highest-value
  unmade decision in the plan**: it collapses or expands §9 entirely.
- **9. Manifest ownership** — regenerate from the target (§12.2, item 17).

**Outstanding from the DEF-032 audit (all ten, in dependency order, unchanged):** whether
`public.filings` survives; one status column or two; which vocabulary is canonical; which CHECKs
and the trigger survive; re-triage of bucket C; authorisation of the cross-tenant status read
(now possibly satisfiable offline, §6.4); the five orphan status values; the Sprint 0 gate
(`approved_financial_model_versions`); the drift registry's scope; and whether
`submit_filing_safe` / `approved_by` fold into DEF-032 or get their own defect IDs.

---

## 14. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The baseline is reviewed only mechanically and a bad policy predicate ships as "reviewed" | B7(3) names a human for the judgement-dependent surfaces; D-1 forces the gap to be admitted if unfilled |
| R2 | A reconciliation divergence is resolved by picking a winner | §5.2 makes divergence a stop with a written finding; both captures are same-day, so drift is not an available explanation |
| R3 | The all-schema versus public-schema count confusion produces false agreement or false alarm | §3.2 and §5.1 require public-schema restriction before any comparison; the index/constraint classification is called out by name |
| R4 | DEF-032 is silently inherited and the new project launches with it | §6.2 Option C: named quarantine block, cutover gate, registry fix shipped with the baseline |
| R5 | The export ages while decisions are pending; the source keeps receiving executor migrations | Build the baseline now (§11 step 1); if the gap grows long, re-export **before** Cloud removal — one per 24 hours, and impossible afterwards |
| R6 | Cloud removed before the target is verified — unrecoverable | §11: removal only after §12 passes in full, plus a stand-down period. The export already exists, which removes the worst case |
| R7 | Users cannot log in after cutover because password reset email is dead | §9.2 ordering; §12.1 criterion 3 proves it before cutover |
| R8 | Cron jobs recreated with copied credentials, or 401ing invisibly again | §7.9: rotate, vault-lookup only, Vault entry before scheduling; §12.1 criterion 4 demands a 2xx |
| R9 | A view or SECURITY DEFINER function silently defeats RLS | §7.3, §12.2 items 14 and 15; §12.1 criterion 1 is the behavioural backstop |
| R10 | The export file leaks — it contains plaintext bank and mailbox tokens | §9.3 custody; B0 reduces three copies to one |
| R11 | The 528 replay by accident via `supabase db push` | D-3 |
| R12 | Strip rules over-remove something app-authored (S7 event triggers, the second publication) | Every strip is reported per-line with a rule name; B7(1) requires every delta to be attributable |
| R13 | A `pg_restore` older than 18 cannot read the archive, and this is discovered late | B0 makes the toolchain step zero; the version requirement is derived from the archive header, first-hand |

---

## 15. Out of scope

The email provider rewrite; OAuth and Stripe re-registrations; the frontend's removal of
`@lovable.dev/*`, `lovable-tagger` and `mcpPlugin()`; Edge Function deployment; Auth
configuration capture; the Filing Engine / Sprint 0 build; DEF-032 remediation itself; the
plaintext-token decision for `connected_mailboxes` and `bank_connections`; the `ENCRYPTION_KEY`
KDF replacement; and the P1 cron 401 repair on the *source* project (which is being retired, and
is a live-infrastructure change this plan does not authorise).

---

## 16. Confirmation

While producing this plan:

- **No database was connected to.** No SQL was executed anywhere.
- **The Lovable backend was not modified**, read from, or contacted.
- **Target project `ezsvdsjdtardkxfswjvq` was not accessed, linked, configured, referenced in any
  generated artefact, or touched in any way.**
- **No file was created or edited in `supabase/migrations/`, `supabase/functions/`, `src/`,
  `infra/` or `scripts/`.** No baseline SQL was authored.
- Nothing was committed or pushed. No secret value appears in this document.
- The only writes were this file. The only reads outside the repository were of the local export
  file's size, SHA-256 and first 512 header bytes — a read-only inspection of a file already on
  this machine.
- **Nothing in this plan has been executed.**
