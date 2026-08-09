# Filing and job state machines — analysis and proposed design

**Status: proposal. Nothing here is implemented.** Every item is held pending your ruling, per
the instruction not to guess or silently expand a vocabulary.

Companion to `2026-08-09-vocabulary-audit.md`, which established the enforcement. This document
answers the questions that enforcement raised.

---

## 0. The finding that changes the scope

**The static sweeps had a blind spot: `supabase/functions/` was never scanned.**

`scripts/audit-check-violations.py` reads `supabase/migrations`. `vocabulary-registry.test.ts`
enforces over the same set. Neither has ever looked at the edge functions — and the edge
functions are where most real filing transitions happen.

They write values no constraint permits:

| Edge function | Writes | Column | Legal? |
|---|---|---|---|
| `ch-submit:406`, `hmrc-ct-submit:1107` | `submitting` | `filings.status` | **no** |
| `ch-submit:447,530`, `hmrc-ct-submit:1215` | `submission_failed` | `filings.status` | **no** |
| `hmrc-ct-poll:377` | `polling` | `filings.status` | **no** |
| `hmrc-ct-poll:452,580` | `polling_timeout` | `filings.status` | **no** |
| `hmrc-vat-submit:552` | `failed` | `filings.status` | **no** |
| `ch-submit:193` | `blocked` | `filing_submissions.status` | **no** |
| `hmrc-ct-submit:1209` | `failed` | `filing_submissions.status` | **no** |
| `hmrc-ct-poll:458` | `timeout` | `filing_submissions.status` | **no** |
| `hmrc-ct-submit:1250`, `hmrc-ct-poll:466,522,584` | `pending` | `filing_queue.status` | **no** |

### The one that stops the pipeline dead

`filing_queue.status` permits `queued, processing, completed, failed, cancelled`.

- `queue_filing_for_submission` INSERTs `'queued'` — legal.
- `hmrc-ct-poll:335` and `hmrc-ct-delete:236` both select `.eq('status','pending')`.

**The pollers look for a state nothing legal ever writes.** Even after the write-side 23514s
are fixed, the CT submission pipeline cannot find its own work. This is not a vocabulary
inconsistency; it is a broken pipeline, and it is invisible to every test we have.

**Recommendation (highest priority of anything in this document):** extend
`audit-check-violations.py` to cover `supabase/functions/**` and `src/**`, and add the
resulting violations to the baseline. Until then the enforcement covers roughly the third of
the write surface that lives in migrations. I can build this on your word; it is mechanical.

---

## 1. CGT deadline identity

### What was asked

Find the correct disposal-level or tax-year-aware identity for CGT deadlines, given that the
current `ON CONFLICT (organization_id, client_id, service_code, deadline_type)` encodes the
wrong domain rule.

### What I found — the constraint is downstream of a deeper problem

`client_detail_cgt` (`20260202112704:46`) is defined with **`UNIQUE(client_id)`** and a single
`disposal_date` column.

```
client_detail_cgt: id, organization_id, client_id, cgt_number,
                   disposal_date, property_address, home_address, ...
                   UNIQUE(client_id)
```

**The data model already forbids a client having more than one disposal.** The trigger's
conflict target is not the root cause — it faithfully reflects a table that can only hold one
CGT record per client. Fixing the `ON CONFLICT` alone would produce a trigger that is correct
about an identity the schema cannot express.

Three further defects in `on_cgt_disposal_date_changed` (`20260407111911`):

| # | Defect | Detail |
|---|---|---|
| 1 | `ON CONFLICT` has no index | No unique index on `deadlines` exists anywhere in 519 migrations → **42P10 on every fire** |
| 2 | Phantom column | Writes `deadlines.title`; the column is `name` |
| 3 | Illegal literal | `deadline_type = 'filing'`; allowed `custom, internal, statutory` |
| 4 | Illegal literal | `status = 'upcoming'` (×2, inside `CASE`); not in the canonical set |

Defect 4 was **missed by `audit-check-violations.py`** because the literal sits inside a `CASE`
expression rather than a plain assignment. A second detector gap, alongside §0.

### Proposed design

**Do not patch the trigger. Model the disposal.**

A UK CGT 60-day deadline is a property of a *disposal*, not of a client. A client may dispose
of several assets in one tax year and more in the next; each carries its own 60-day clock, its
own property, and its own filing.

```
cgt_disposals
  id                uuid pk
  organization_id   uuid not null
  client_id         uuid not null
  disposal_date     date not null
  asset_description text not null
  property_address  text
  tax_year          text not null      -- derived, stored: '2025-26'
  cgt_number        text               -- moves off client_detail_cgt
  created_at, updated_at

  UNIQUE (organization_id, client_id, disposal_date, asset_description)
```

The natural identity of a disposal is **(client, disposal date, asset)** — two disposals of
different assets on one day are two disposals; the same asset cannot be disposed twice on one
day. `tax_year` is stored rather than derived at query time because the UK year boundary
(6 April) makes it a filter people use constantly.

Deadlines then key on the disposal, which `deadlines` already supports — it has
`parent_deadline_id`, `period_start`, `period_end` and `metadata`:

```
UNIQUE (organization_id, deadline_code, client_id, period_start)
   WHERE deadline_code = 'CGT_60_DAY'
```

with `period_start = disposal_date`. That is a genuine identity: one 60-day deadline per
disposal date per client.

### Open questions I cannot answer from the schema

1. **Migration path.** `client_detail_cgt` has `UNIQUE(client_id)`, so existing rows map 1:1
   to disposals. Backfill is mechanical — but is `client_detail_cgt` still the UI's entry
   point, and does it survive as a client-level CGT registration record (`cgt_number`,
   `home_address`) with disposals hanging off it? I lean yes: registration is client-level,
   disposal is event-level.
2. **Asset identity.** Is `asset_description` free text, or should disposals reference a
   `fixed_assets` row where one exists? The schema has `fixed_assets` with
   `active/disposed/fully_depreciated`, which suggests a link, but nothing connects them today.
3. **Does a disposal always produce a filing?** Below the annual exempt amount there may be no
   filing obligation, in which case the deadline should not be created at all.

**Held.** These are domain decisions, not schema deductions.

---

## 2. Filing status — `queued` will not be restored

Recorded as accepted and closed. `queued` stays off `filings.status`; queue and HMRC transport
state belong on `filing_queue.status`.

This is also what the architecture requires — the HMRC layer is
transport/obligations/OAuth/fraud-prevention/audit/submission-state only and must never own
figures of record. `queue_filing_for_submission` already writes `filing_queue.status='queued'`
correctly at `20251214185814:219`; its `filings.status='queued'` write at `:230` is the
duplicate that must go.

**Consequence for §3:** `submitting`, `submission_failed`, `polling`, `polling_timeout` and
`failed` — all currently written to `filings.status` by edge functions — belong to the same
transport layer and should follow `queued` onto `filing_queue`/`filing_submissions`. The
proposal below reflects that.

---

## 3. Filing state machine — proposed definition

### Current canonical vocabulary

`chk_filing_status` (13, sole survivor after DEF-034): `not_started`, `draft`, `in_progress`,
`ready_for_review`, `sent_to_client`, `client_changes_requested`, `awaiting_approval`,
`approved`, `ready_to_file`, `submitted`, `accepted`, `rejected`, `filed`.

It agrees with `FilingStatus` (`filing-service.ts:9-22`), `FILING_STATUS`
(`db-constants/index.ts:24-40`) and `FILING_STATUSES` (`check-constraints.ts:54-69`).

### Five vocabularies are in play

| Vocabulary | Where | Status |
|---|---|---|
| `chk_filing_status` (13) | live constraint, 3 TS copies | **canonical** |
| `valid_status` (6) | dropped by DEF-034 | retired |
| `chk_filings_status` (15) | dropped 2026-06-20 | retired, but 3 SQL functions still write it |
| Edge-function set | `supabase/functions/` | never reconciled — §0 |
| `TriggerConfigBuilder.tsx:25-31` | automation UI dropdown | **a fifth, stale set** — offers `awaiting_client_approval`, `approved_by_client` |

`auto-rollover-service.ts:182-186` also emits `'approved_by_client' → 'filed'` as a hardcoded
automation event payload.

### Proposed state table

`W` = writer, `R` = reader. Line references are exact.

| Canonical state | Meaning | Allowed next | Writers | Readers |
|---|---|---|---|---|
| `not_started` | Obligation known, no work begun | `draft`, `in_progress` | `filing-service.ts:308` | `FilingDetail.tsx:242` |
| `draft` | Being prepared internally | `in_progress`, `ready_for_review`, `rejected` | `filing-service.ts:92,989,1139`; `cosec-filing-service.ts:109,193`; `amended-filing-service.ts:60`; `WorkpaperStatusActions.tsx:193`; DB DEFAULT | `Filings.tsx:78`; `JobFilingTab.tsx:198`; `ch-filing-service.ts:149` |
| `in_progress` | Actively worked | `ready_for_review`, `draft` | `FilingDetail.tsx:219` | `FilingDetail.tsx:297` |
| `ready_for_review` | Awaiting internal reviewer | `sent_to_client`, `approved`, `draft` | `FilingDetail.tsx:232`; `workflow-integrity-service.ts:244` ⚠️ writes `ready_for_approval` | `amended-filing-service.ts:214` |
| `sent_to_client` | With client for comment | `client_changes_requested`, `awaiting_approval` | *(none — see gap 3)* | `FilingDetail.tsx:299` |
| `client_changes_requested` | Client asked for changes | `in_progress` | *(none — see gap 3)* | `FilingDetail.tsx:562` |
| `awaiting_approval` | Formal approval requested | `approved`, `rejected` | `filing-service.ts:259`; `filing-lock-service.ts:240` | `validate_filing_approval_token` (SQL); `PayrollOverviewTab.tsx:119` |
| `approved` | Approved, not yet released | `ready_to_file` | `filing-approval-service.ts:105`; `approve_filing_safe` ⚠️ writes `approved_by_client` | `ch-filing-service.ts:149` |
| `ready_to_file` | Cleared for transport | `submitted` | `filing-service.ts:451,844` | `FilingDetail.tsx:300`; `JobFilingTab.tsx:199` |
| `submitted` | Handed to HMRC/CH, outcome unknown | `accepted`, `rejected`, `filed` | `ch-submit:526`; `hmrc-ct-submit:1238` | `filing-mark-filed-gate.ts:21`; `amended-filing-service.ts:41` |
| `accepted` | Authority accepted | `filed` | `hmrc-ct-poll:505` | `filing-mark-filed-gate.ts:21` |
| `rejected` | Authority or client rejected | `in_progress`, `draft` | `filing-service.ts:495`; `hmrc-ct-poll:547`; `rti-submit:165`; `cis-submit:169` | `FilingDetail.tsx:301` |
| `filed` | Terminal. Locked. | — | `submit_filing_safe`; `filing-service.ts:566`; `cosec-filing-service.ts:309`; `ch-submit:519`; `hmrc-vat-submit:546`; `hmrc-ct-delete:269,340,367` | `filing-service.ts:551`; `workflow-integrity-service.ts:345` |

An authoritative transition map already exists in the database:
`validate_filing_status_transition` (`20260218184412:126`). **It references states that are not
in `chk_filing_status`** — `error`, `client_approved`, `client_rejected` — so trigger and
constraint disagree. That must be reconciled in the same migration as any change here.

### Gaps this exposes

1. **`submitted` and `accepted` have no SQL writer.** Only edge functions write them, and only
   through paths that first write illegal values. Combined with §0, **no filing has ever
   legitimately reached `submitted`.**
2. **Transport states have no home.** `submitting`, `polling`, `polling_timeout`,
   `submission_failed` describe transport, not the filing. Per §2 they belong on
   `filing_submissions.status`, which today permits only `pending, submitted, accepted,
   rejected, error` and is itself written with `blocked`, `failed` and `timeout`.
3. **Two declared states are never written by anything**: `sent_to_client` and
   `client_changes_requested`. Both are read by the UI and offered as filters. Either the
   client-review loop was never built, or it writes through a path I have not found.

**Held.** Which of these is a missing feature and which is dead vocabulary is a product
question.

---

## 4. Casing — closed

Existing vocabularies unchanged. `lower_snake_case` required for new ones. No ledger data
rewritten. Recorded in `2026-08-09-vocabulary-audit.md` §"The rule going forward".

---

## 5. DEF-033 widened — done, not held

`revalue_bank_account_fx` also wrote `journals.source_type` and `journals.source_id`. Both
added, mirroring `ledger_entries`, which has carried that exact pair since `20251127012417`.
Nullable, undefaulted, no CHECK. Commit `5498e3c`. All four bank-reconciliation functions now
clear the sweep; phantom findings 18 → 17.

---

## 6. The nine remaining literal violations

Legend: **Impact** — `23514` every call unless noted.

### 6a. Filing (3) — held under §2/§3

| # | Writer | Invalid literal | Current constraint | Recommended | Migration/backfill | Tests required |
|---|---|---|---|---|---|---|
| 1 | `approve_filing_safe` (`20251209001148:268`) | `filings.status = 'approved_by_client'` | `chk_filing_status` | → `approved`. Same meaning; `approved` is canonical and `approved_by_client` belongs to the retired `chk_filings_status`. | Re-issue body. No data change — no row can hold the illegal value. | Assert body writes `approved`; assert `approved_by_client` absent from all writers incl. `TriggerConfigBuilder.tsx:28` and `auto-rollover-service.ts:184` |
| 2 | `queue_filing_for_submission` (`20251214185814:230`) | `filings.status = 'queued'` | `chk_filing_status` | **Delete the write.** The function already correctly INSERTs `filing_queue.status='queued'` at `:219`. Per your ruling, transport state does not touch the filing. | Re-issue body, removing one UPDATE. No data change. | Assert `filings.status` untouched by this function; assert the `filing_queue` INSERT survives |
| 3 | `regress_filing_status` (`20251214202222:122`) | `filings.status = 'ready_for_approval'` | `chk_filing_status` | → `ready_for_review`. **Needs confirmation:** these may be genuinely different states (internal review vs client approval), in which case the fix is `awaiting_approval`, not `ready_for_review`. | Re-issue body. Also `workflow-integrity-service.ts:244` writes the same illegal literal from TypeScript. | Assert both SQL and TS writers use the ruled value |

### 6b. Job workflow (5)

The `jobs.status` vocabulary moved from a generic lifecycle to workflow stages
(`jobs_status_check` → `chk_jobs_status`, `20260217105419`). These callers were never migrated.
Canonical (9): `blank`, `records_requested`, `records_received`, `accountant_queries`,
`client_queries`, `accountant_review`, `client_review`, `ready_to_file`, `completed`.

| # | Writer | Invalid literal | Current constraint | Recommended | Migration/backfill | Tests required |
|---|---|---|---|---|---|---|
| 4 | `create_job_from_template` (`20251203235853:141`) | `jobs.status = 'not_started'` | `chk_jobs_status` (9) | → `blank`. `blank` is the table DEFAULT since `20260408203205:8` and the value every app-code creator writes (`job-template-engine.ts:148`, `workflow-step-executor.ts:308`, +5). Unambiguous. | Re-issue body. No data change. | Assert `blank`; assert `job-status-service.ts` transition map accepts it |
| 5 | `process_questionnaire_submission` (`20251203235853:432`) | `jobs.status = 'in_progress'` | `chk_jobs_status` | → `records_received`. **Needs confirmation.** A questionnaire submission is the client returning records, and `records_received` is the stage that follows `records_requested`. But `trigger_records_request` is the paired function and the loop should be ruled on as a whole. | Re-issue body. Check `validate_job_status_transition` (`20260408203205:11`) permits the source→target edge. | Assert the ruled value; assert the transition is legal under the DB trigger |
| 6 | `create_job_from_template` (`20251203235853:149`) | `jobs.priority = 'medium'` | `jobs_priority_check`: `low, normal, high, critical` | → `normal`. Unambiguous — `normal` is the value every other creator writes. **Also fix `CompanyCoSecJobsTab.tsx:121`**, which writes `'medium'` from TypeScript. | Re-issue body + one TSX line. No data change. | Assert both writers use `normal`; add `jobs.priority` to `CHECK_CONSTRAINT_REGISTRY` (**currently absent**) |
| 7 | `create_job_from_template` (`20251203235853:176`) | `job_tasks.status = 'not_started'` | `job_tasks_status_check`: `todo, doing, done, blocked` | → `todo`. Unambiguous. **Related:** `OverdueActionsPanel.tsx:77` filters on `status='pending'`, which is in no vocabulary, so that panel silently returns zero rows — a dead filter, not an error. | Re-issue body + one TSX filter. No data change. | Assert `todo`; assert no reader filters on a value outside the vocabulary |
| 8 | `lifecycle_generate_jobs_for_service` (`20260621182446:237`) | `jobs.automation_source = 'canonical_spine_v1'` | `jobs_automation_source_check`: `manual, scheduled, template` | **Genuine conflict — needs a ruling.** `canonical_spine_v1` is a *provenance version*, not a source kind; `tg_job_canonical_generate_deadlines` (`20260624163150:44`) READS it to decide whether to generate deadlines, so simply renaming it to `scheduled` would silently change trigger behaviour. Options: (a) widen the vocabulary to include `canonical_spine_v1`; (b) write `scheduled` and move the version to a new `automation_version` column, updating the trigger. **(b) is cleaner** — it stops one column carrying two concepts. | (b) = new column + re-issue two functions + backfill existing rows' `automation_version`. Non-trivial. | Assert the trigger still fires for canonically-generated jobs — this is the one change here that can silently break behaviour |

### 6c. Deadlines (1) — held under §1

| # | Writer | Invalid literal | Current constraint | Recommended | Migration/backfill | Tests required |
|---|---|---|---|---|---|---|
| 9 | `on_cgt_disposal_date_changed` (`20260407111911:28`) | `deadlines.deadline_type = 'filing'` | allowed `custom, internal, statutory` | → `statutory` (a CGT 60-day deadline is statutory). **But do not fix in isolation** — this function has three further defects (§1) including one that raises 42P10 first, so repairing only the literal changes nothing observable. Same trap as DEF-033. | Blocked on the §1 disposal-model ruling. | Full rewrite tests once the model is ruled |

### 6d. Not in the nine — found by the inventory, not yet baselined

These are outside `supabase/migrations`, so no sweep sees them:

| Location | Defect |
|---|---|
| `src/lib/workflow-step-executor.ts:364-365` | Writes `client_tasks.visibility='internal'` and `status='pending'` — both illegal. **The edge-function twin `supabase/functions/workflow-tick/index.ts:171` was already repaired**, so `src/` and the deployed function have silently diverged. |
| `src/components/templates/JobTemplateEditor.tsx:48-57` | Local `JOB_STATUSES` shadowing the canonical export with a fully retired vocabulary (`not_started`, `awaiting_info`, `in_review`, `awaiting_approval`, `filed`). Only 2 of 8 members are still legal. |
| `src/lib/automation-actions.ts:71` | `automation_source: context.triggeredByEntity` — a free variable into a 3-value constraint |
| `src/lib/workflow-step-executor.ts:468`, `workflow-tick:269`, `update_job_status_safe` | `status` written from an unvalidated variable |
| §0 table | Nine illegal literals across the HMRC/CH edge functions |

---

## Recommended order

1. **Extend the sweep to `src/**` and `supabase/functions/**`** (§0). Everything else is
   guesswork about a surface we cannot currently see. Mechanical; I can do it on your word.
2. **Fix `filing_queue.status = 'pending'`** (§0). The CT pipeline cannot find its own work.
3. **The five unambiguous literals** — #1, #4, #6, #7, and #2's deletion. All are renames onto
   an existing vocabulary with a single defensible answer.
4. **Rule on #3, #5, #8** — each has two defensible readings.
5. **Rule on the CGT disposal model** (§1), then rewrite the trigger whole.
6. **Reconcile `validate_filing_status_transition` with `chk_filing_status`** (§3) — the
   trigger and the constraint currently disagree about which states exist.

Nothing in 3–6 will be implemented without your ruling.
