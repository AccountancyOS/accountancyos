# DEF-032 — `public.filings.status`: investigation findings

**Status:** OPEN. Investigation complete; **no fix designed, by rule.**
**Raised:** 2026-08-06 (`2026-08-06-constraint-provenance-and-filings-conflict.md`)
**Investigated:** 2026-08-17, executing the read-only 5-step plan in that document's §4.3.
**Severity:** P1. The filing status column is inert. Nothing was changed to produce this report.

---

## 1. The recorded finding understates the problem

DEF-032 was recorded as *three* overlapping CHECK constraints whose intersection admits
only `draft`, `approved`, `filed`, `rejected`.

There is a **fourth, independent gate** the 2026-08-06 audit did not record: a live
`BEFORE UPDATE` trigger `filing_status_transition_check` on `public.filings`, running
`public.validate_filing_status_transition()`, which enforces a **fifth** status vocabulary
as a transition graph. It was read live this session from `pg_trigger`/`pg_proc`.

Intersect the trigger's legal transitions with the three CHECKs' permitted values:

| from | trigger allows | of those, CHECK-writable | net effect |
|---|---|---|---|
| `draft` — the default, and what every INSERT path writes | `in_progress`, `ready_for_review` | **none** | **terminal** |
| `approved` | `ready_to_file`, `draft` | `draft` | can only regress |
| `rejected` | `ready_to_file`, `draft` | `draft` | can only regress |
| `filed` | *(no map key → trigger permits anything)* | `draft`, `approved`, `rejected` | trigger-unconstrained |

**Every filing the product creates is inserted as `draft` and can never leave `draft`.**
The four "writable" values are not reachable from the state the application starts in. This
is stricter than "the HMRC submission path is blocked" — the entire status column is inert.

---

## 2. Constraint provenance — how five vocabularies came to coexist

| # | Migration | Action | Constraint | Permitted values |
|---|---|---|---|---|
| 1 | `20251127004529` | `CREATE TABLE filings`, inline | **`valid_status`** | 6: `draft, awaiting_approval, approved, ready_to_file, filed, rejected` |
| 2 | `20251218231226` | `ADD CONSTRAINT … NOT VALID` | **`chk_filings_status`** | 15: adds `ready_for_approval, awaiting_client_approval, approved_by_client, queued, submitting, submitted, pending, accepted, error, submission_failed, cancelled` |
| 3 | `20260217133510` | drops `filings_status_check` + `chk_filing_status`, then adds | **`chk_filing_status`** | 13: `not_started, draft, in_progress, ready_for_review, sent_to_client, client_changes_requested, awaiting_approval, approved, ready_to_file, submitted, accepted, rejected, filed` |
| 4 | `20260218184412` | `CREATE TRIGGER filing_status_transition_check BEFORE UPDATE` | *(trigger, not a CHECK)* | 12-key transition map; introduces `client_approved`/`client_rejected`, which are in **no** CHECK |
| 5 | `20260620150856` | drops `chk_filings_status`, re-adds `chk_filing_status` | — | **NEVER APPLIED** |

Two compounding mechanics:

1. **Different names ⇒ additive, not replacing.** Postgres keys CHECK constraints on
   `(conrelid, conname)`. `chk_filings_status` (#2) and `chk_filing_status` (#3) differ by a
   single character. #3's cleanup drops only `filings_status_check` and its own name; it is
   blind to both `valid_status` and `chk_filings_status`. **Nothing in the entire migration
   history ever drops `valid_status`** — the inline constraint from the original
   `CREATE TABLE` has survived every subsequent "replace the status constraint" migration.
2. **`NOT VALID` was misread as inert.** It suppresses back-validation of *existing rows
   only*. It is fully enforced on every INSERT and UPDATE.

### The corrective migration exists in git and was deliberately left unapplied

`20260620150856` diagnoses the double-constraint problem correctly in its own 26-line header
and drops `chk_filings_status`. `docs/audits/unapplied-migrations.md:59` classifies it under
bucket **C. Data / structural mutation (informational)**, calling it "cosmetic /
low-blast-radius. Leaving as-is unless a downstream feature reports a mismatch."

That triage decision is the proximate cause of the live state. Note it would **not** have
fixed DEF-032 even if applied — it does not touch `valid_status`, which alone blocks
`submitted` and `accepted`.

---

## 3. The write surface — 18 values the application believes are valid

`draft, in_progress, ready_for_review, awaiting_approval, ready_for_approval, approved,
approved_by_client, ready_to_file, queued, submitting, submitted, submission_failed,
accepted, rejected, filed, failed, polling, polling_timeout`

Five of these — `failed`, `polling`, `polling_timeout`, plus the trigger's `client_approved`
and `client_rejected` — appear in **no CHECK constraint of any generation**.

### Dead on arrival — every one fails at write time with 23514

**HMRC CT600 — nothing survives.** `hmrc-ct-submit/index.ts:1107` writes `submitting` and
**dies on its first status write, before any HMRC call is made**; `:1215`
`submission_failed` (the error handler itself fails); `:1238` `submitted`.
`hmrc-ct-poll/index.ts:377` `polling`; `:452,:580` `polling_timeout`; `:505` `accepted`.

**Companies House.** `ch-submit/index.ts:406` `submitting`; `:447,:506` `submission_failed`;
`:502` `submitted`. Only `:495` `filed` passes the CHECKs, and then only from an
already-`filed` row, since `draft→filed` is blocked by the trigger.

**VAT.** `hmrc-vat-submit/index.ts:557` `failed` (in no constraint); `:551` `filed` blocked
by the trigger from `draft`.

**Review / approval.** `awaiting_approval` (`filing-service.ts:259`,
`filing-lock-service.ts:240`), `ready_to_file` (`filing-service.ts:451,844`),
`ready_for_approval` (`workflow-integrity-service.ts:244`, and `regress_filing_status` —
so the snapshot-change regression safety net silently fails), `in_progress` /
`ready_for_review` (`FilingDetail.tsx:219,232`), `queued` (`queue_filing_for_submission`,
so the queueing RPC cannot queue), `approved_by_client` (`approve_filing_safe`).

**Only surviving writes:** the INSERT paths writing `draft`, and `create_test_ct600_filing`
inserting `approved` (INSERT is not covered by a `BEFORE UPDATE` trigger).

**Someone already hit this and worked around a symptom.**
`src/lib/filing-lock-service.ts:236–241` carries a source comment naming `valid_status` and
substitutes `awaiting_approval` for `sent_to_client`, without diagnosing the cause.

---

## 4. Reconciliation against the Filing Engine spec — a category mismatch

`docs/accountancyos-filing-engine-spec-v2.md` §7.2 mandates nine states —
`ready → submitting → { accepted_by_hmrc | rejected_validation | auth_expired | duplicate |
rate_limited | retry_pending }` plus `failed_terminal` — on a column named **`state`**, on a
table named **`submissions`**, one row **per submission attempt**.

**The spec contains no `filings` table and no `filings.status` column.** Its model is
`approved_financial_model_versions → filing_projections → submissions`.

So DEF-032 is not "the constraints disagree with the spec about which statuses are valid".
It is: **the shipped schema implements a table the spec does not describe, and the spec's
state machine has no shipped implementation.** The only literal shared between the spec's
nine states and the 18 the code writes is `submitting`.

**Zero of the nine spec-mandated states is writable to `filings.status`.**

---

## 5. Sprint 0 is not complete — `approved_financial_model_versions` does not exist

Spec §14 makes this table plus its approval-gate constraints the Sprint 0 gate, and §6.3
calls the `NOT NULL … ON DELETE RESTRICT` approval gate "the most important constraint in
the system". Spec line 246: *"If the core does not yet expose
`approved_financial_model_versions`, that is a blocking dependency."*

Absent, confirmed three ways: no match anywhere in `supabase/migrations/`, `src/` or
`supabase/functions/` outside the spec document itself; no `CREATE TABLE.*approved` in any
migration; and the live `db_schema` table list contains no `approved_financial_model_versions`,
no `filing_projections`, no `submissions` and no `obligation_periods`.

What shipped instead is a scattered set with no single approval gate —
`filing_model_snapshots`, `accounts_model_snapshots`, `ct_computation_snapshots`,
`trial_balance_snapshots`, `filing_approvals`, `filing_artefacts`, `filing_queue`,
`filing_submissions` — approximated by two `BEFORE UPDATE` triggers on `filings`
(`enforce_ct600_filing_gate`, `enforce_ct600_approval_before_filed`, both confirmed live)
that raise if `model_snapshot_id IS NULL` on a transition into `submitted`/`filed`/`accepted`.
That is a nullable-FK check on a mutable table, not the spec's structural impossibility —
and both triggers are unreachable anyway, since no transition into those states can pass the
CHECKs.

Per CLAUDE.md's non-negotiable architecture, this gates all projection work.

---

## 6. Two further defects found in the same sweep (independent of DEF-032)

- **`public.submit_filing_safe` references a column that does not exist.** Read live: it runs
  `UPDATE filings SET status='filed', submitted_by = auth.uid(), …`. The live `filings` table
  has `filed_by`, `approved_by`, `locked_by`, `submitted_at` — **no `submitted_by`**. This RPC
  fails `42703` regardless of any status constraint, and would still fail after DEF-032 is
  resolved.
- **`approve_filing_safe` writes a uuid into a text column** — `approved_by = auth.uid()`
  against `filings.approved_by text`.

---

## 7. Why the drift registry did not catch this

`src/lib/db-constants/check-constraints.ts:195` registers only `chk_filing_status` for this
column. The vocabulary-drift regression test therefore passed throughout, checking one of the
three constraints and none of the triggers. This is the same systemic gap that let DEF-026
survive eight months (`bills` was absent from the registry entirely).

---

## 8. Verification limits — stated, not glossed

- The Lovable connector is scoped to the `public` schema and exposes no path to
  `pg_constraint`/`pg_get_constraintdef`. **The three CHECK definitions could not be re-read
  live this session.** They come from the migration sources in git, corroborated by the
  verbatim catalog read recorded in the 2026-08-06 audit §4. The trigger and function
  definitions in §1 and §3 **were** read live and are first-hand.
- `db_select` on `public.filings` returned **0 rows**, but that is RLS-scoped and is **not**
  proof the table is empty. Step 1 of the §4.3 plan — the status distribution across all
  tenants, needed to size any data migration and to know which non-writable values already
  exist as legacy rows that `NOT VALID` was tolerating — **remains unanswerable** through this
  connector and needs a privileged read.

---

## 9. Owner rulings required before any fix may be designed

In dependency order. No fix is proposed; these are decisions, not options to be inferred.

1. **Does `public.filings` survive at all?** Is it (a) the shipped implementation of the
   spec's `submissions` under a legacy name, (b) a legitimate operational layer *above* the
   spec's engine that the spec should be extended to describe, or (c) legacy to be retired in
   favour of building §6.2 as written? Everything below depends on this.
2. **If it survives — one status column or two?** `filings.status` currently conflates
   workflow state (`draft`, `in_progress`, `awaiting_approval`, `approved`) with transport
   state (`submitting`, `submitted`, `accepted`, `polling`, `failed`). The spec separates
   these deliberately.
3. **Which vocabulary is canonical?** Five are live simultaneously (6, 15, 13, the trigger's
   12, and the code's 18), the spec mandates a sixth (9), and none is a superset of the others.
4. **Which of the three CHECKs and the transition trigger is intended to survive?** The
   trigger postdates every CHECK and encodes a different intent again — canonical design, or drift?
5. **Re-triage bucket C.** `20260620150856` was classified "cosmetic" and left unapplied; that
   classification is demonstrably wrong. Should the rule be revisited, and is the other bucket-C
   item (`20260620155406`, `onboarding_applications.status` default) to be re-triaged on the
   same grounds?
6. **Authorise a privileged cross-tenant read** of the `filings.status` distribution, and by
   what route — it is a prerequisite to sizing any data migration.
7. **`polling` / `polling_timeout` / `failed` / `client_approved` / `client_rejected`** are
   written or required by shipped code but exist in no constraint of any generation. Genuine
   states of the canonical machine, or drift to be deleted from the code?
8. **Sprint 0 gate.** Is the canonical lifecycle defined against the *spec's*
   `approved_financial_model_versions` (requiring it be built first), or against the shipped
   `filing_approvals`/`*_snapshots` approximation — and if the latter, does the spec change?
9. **Should the drift registry model all constraints per column plus transition triggers**, and
   should the drift test assert the live constraint *set* rather than one named constraint?
10. **`submit_filing_safe` / `approved_by` (§6)** — fold into DEF-032 remediation, or issue
    their own defect IDs?
