# Constraint provenance + filings CHECK conflict — read-only findings, 2026-08-06

Production project: `moxpdejnucjjcplleefn`. **No writes, no DDL, no migrations were issued
for this investigation.** All evidence below is from catalog reads.

---

## 1. DEF-026 — conflicting-constraint theory disproved (confirmed)

`public.bills` carries exactly one status CHECK, validated, and it admits `APPROVED`:

```
bills_status_check | convalidated = t
CHECK (status = ANY (ARRAY['DRAFT','APPROVED','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED']))
```

`public.invoices` likewise carries exactly one, validated:

```
invoices_status_check | convalidated = t
CHECK (status = ANY (ARRAY['DRAFT','AWAITING_PAYMENT','PART_PAID','PAID','OVERDUE','VOIDED']))
```

No legacy `chk_bills_status` / `chk_invoices_status` exists on either table. **No corrective
constraint migration is required for bills or invoices.** DEF-026 stays
`applied-verification-pending` until a real bill-approval behavioural check
(`approve_bill_safe` on a DRAFT bill, as an authenticated fixture user) is completed.

## 2. Who actually removed the legacy bills/invoices constraints — RESOLVED

The provenance signal in point 4 of the ruling was a **false negative caused by executor
version rewriting**, not evidence of non-application.

`supabase_migrations.schema_migrations` has no row with `version = '20260703195953'`, but it
has:

| version | name |
|---|---|
| `20260703195955` | `20260703195953_10202d3a-a8b5-461f-a491-0710010082d8` |

The recorded `statements` for that row are byte-for-byte the contents of
`supabase/migrations/20260703195953_10202d3a-a8b5-461f-a491-0710010082d8.sql`, including:

```sql
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
ALTER TABLE public.bills    DROP CONSTRAINT IF EXISTS chk_bills_status;
```

**Conclusion: 20260703195953 WAS applied**, under an executor-assigned version stamped
~2 seconds later than the filename. This is the same rewrite pattern seen elsewhere
(`20260703203849` → `20260703203850`, DEF-031 `20260805200000` → `20260805210851`).

**Standing correction to the release convention:** application must be confirmed by matching
`schema_migrations.name` against the migration filename, never by `version` equality. A
`version` lookup alone will report applied migrations as missing.

## 3. Why the bookkeeping backfill shows 0 backfilled — not a non-application signal

The backfill in that migration is a **one-shot `UPDATE`**, not a trigger, default, or
constraint. It ran on 2026-07-03 against the rows that existed then. The current
1 debtor / 2 creditor candidates with `account_subtype` unset were therefore either created
after that date or created since by paths that do not set `account_subtype`.

This is a genuine, separate gap — there is no ongoing mechanism keeping
`bookkeeping_accounts.account_subtype` correct for control accounts — but it is **not**
evidence about whether 20260703195953 was applied. Logged for triage as a follow-up; no fix
designed here.

## 4. filings — three overlapping CHECK constraints (live, verbatim)

```
chk_filing_status   | convalidated = t
  CHECK (status = ANY (ARRAY['not_started','draft','in_progress','ready_for_review',
    'sent_to_client','client_changes_requested','awaiting_approval','approved',
    'ready_to_file','submitted','accepted','rejected','filed']))

chk_filings_status  | convalidated = f  (NOT VALID)
  CHECK (status = ANY (ARRAY['draft','ready_for_approval','awaiting_client_approval',
    'approved_by_client','approved','queued','submitting','submitted','pending','accepted',
    'filed','rejected','error','submission_failed','cancelled']))

valid_status        | convalidated = t
  CHECK (status = ANY (ARRAY['draft','awaiting_approval','approved','ready_to_file',
    'filed','rejected']))
```

`NOT VALID` suppresses back-validation of existing rows only; it is **fully enforced on every
INSERT and UPDATE**. All three therefore gate writes.

### 4.1 Effective writable vocabulary = the intersection

| status | chk_filing_status | chk_filings_status | valid_status | writable |
|---|---|---|---|---|
| draft | ✓ | ✓ | ✓ | **yes** |
| approved | ✓ | ✓ | ✓ | **yes** |
| filed | ✓ | ✓ | ✓ | **yes** |
| rejected | ✓ | ✓ | ✓ | **yes** |
| awaiting_approval | ✓ | ✗ | ✓ | no |
| ready_to_file | ✓ | ✗ | ✓ | no |
| submitted | ✓ | ✓ | ✗ | no |
| accepted | ✓ | ✓ | ✗ | no |
| not_started, in_progress, ready_for_review, sent_to_client, client_changes_requested | ✓ | ✗ | ✗ | no |
| ready_for_approval, awaiting_client_approval, approved_by_client, queued, submitting, pending, error, submission_failed, cancelled | ✗ | ✓ | ✗ | no |

**Only four statuses can be written to `public.filings`: `draft`, `approved`, `filed`,
`rejected`.**

### 4.2 Statuses the shipped code actually writes (grep evidence)

Application code (`src/lib/*`) writes: `awaiting_approval` (filing-service.ts:259,
filing-lock-service.ts:240), `ready_to_file` (filing-service.ts:451), `rejected`
(filing-service.ts:495), `filed` (filing-service.ts:566, cosec-filing-service.ts:309),
`approved` (filing-approval-service.ts:105), `ready_for_approval`
(workflow-integrity-service.ts:244).

Edge functions write: `submitting`, `submission_failed`, `submitted` (hmrc-ct-submit),
`polling`, `polling_timeout`, `accepted`, `rejected`, `pending` (hmrc-ct-poll), `filed`
(hmrc-ct-delete), `submitting`/`submission_failed` (ch-submit), `filed`/`rejected`
(cis-submit, rti-submit).

Cross-referenced against §4.1, **every filing lifecycle transition except
draft/approved/filed/rejected fails at write time with 23514** — including the entire HMRC
submission path (`submitting` → `submitted` → `accepted`) and the review path
(`ready_for_approval`, `awaiting_approval`, `ready_to_file`). Note `polling` and
`polling_timeout` appear in **no** constraint at all.

Registry note: `src/lib/db-constants/check-constraints.ts` records only `chk_filing_status`
for this column. The registry is blind to the other two, which is why vocabulary-drift
testing did not catch this.

### 4.3 Read-only investigation plan (no fix designed, no write requested)

1. Enumerate live `public.filings.status` distribution as a role that is subject to RLS but
   can see all tenants, or via a per-tenant fixture aggregate — required to know which of the
   14 non-writable values already exist as data (rows predating `chk_filings_status`, which is
   `NOT VALID` precisely to tolerate them).
2. Extract every status literal written to `filings` from **database routines** as well as
   app code: `regress_filing_status`, `queue_filing_for_submission`,
   `validate_filing_submission`, `validate_submission_integrity`,
   `handle_accounts_snapshot_change`, `regenerate_ct_snapshot_on_accounts_change`,
   `create_test_ct600_filing` (`pg_get_functiondef` scan).
3. Trace each of the three constraints to its originating migration file and executor
   `schema_migrations.name`, establishing which was intended to supersede which.
4. Reconcile against the Filing Engine spec (`docs/accountancyos-filing-engine-spec-v2.md`)
   to establish the **canonical filing lifecycle** — the authoritative vocabulary and legal
   transitions. No constraint change may be designed before that exists.
5. Only then: propose a single validated CHECK matching the canonical lifecycle, plus the
   data migration for any legacy values found in step 1, plus registry and regression-test
   updates.

Tracked as **DEF-032 — filings status vocabulary is triple-constrained; effective set is four
values**. Severity: high (blocks the HMRC submission path end to end).

## 5. DEF-031 recurrence #4 — containment NOT executed

Confirmed: the previous response returned only the three read-only query results and issued
no `ALTER ROLE`. Current live state, read this session:

```
oid=161547 | sandbox_exec | rolsuper=f | rolbypassrls=t | rolcanlogin=t
```

`BYPASSRLS` is still restored. Per the standing ruling, **no observation made in a
`sandbox_exec` session — including §4's catalog reads — may be recorded as RLS evidence.**
Catalog definitions in this document are unaffected by RLS and stand on their own; the empty
`public.filings` status aggregate in this session is *not* evidence of an empty table.

DEF-031 remains `open-recurring-drift`. Re-applying `ALTER ROLE sandbox_exec NOBYPASSRLS`
requires a production write and is **not** requested here, per instruction. It is held pending
your word, and will be logged as recurrence #4 containment, not a fix.