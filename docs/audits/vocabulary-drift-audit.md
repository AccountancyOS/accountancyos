# Vocabulary Drift Audit — Phase 2

Audit date: 2026-06-17
Phase 1 (job statuses) is complete and locked by `JOB_STATUSES` in
`src/lib/workflow-constants.ts`, the `job-status-vocabulary` regression test,
and the live `chk_jobs_status` smoke check. This audit covers every other
status / visibility vocabulary that was deliberately skipped in Phase 1.

Risk legend:
- **P0** — schema rejects writes the app issues today, or the app issues writes
  that silently fall outside the canonical set. Real or latent runtime breakage.
- **P1** — drift between DB / TS types / UI that doesn't break runtime yet but
  will mis-route logic (filters, KPIs, badges, automation gates).
- **P2** — cosmetic / documentation drift.

---

## 1. `client_tasks.status`

| Field | Value |
|---|---|
| Table / column | `public.client_tasks.status` |
| DB constraint | `client_tasks_status_check` = `{not_started, in_progress, complete}` |
| DB default | `'not_started'` |
| Generated TS type | `string` (no enum — no narrowing) |
| SSOT | **None.** No constant; raw strings everywhere. |
| Risk | **P0** (one bad insert path) + **P1** (no SSOT) |

### App values found

| Location | Value(s) written | OK? |
|---|---|---|
| `src/components/client-portal/AddTaskDialog.tsx:60` | `'not_started'` | OK |
| `src/components/client-portal/ClientPortalTab.tsx:162` | `'in_progress'`, `'complete'` | OK |
| `src/lib/automation-actions.ts:106` | `'not_started'` | OK |
| `src/lib/job-template-engine.ts:798` (records-request items) | **`'pending'`** | **FAILS constraint — P0** |

### `client_tasks.visibility`

| Field | Value |
|---|---|
| DB constraint | `client_tasks_visibility_check` = `{client_visible, internal_only}` |
| DB default | `'client_visible'` |

| Location | Value(s) written | OK? |
|---|---|---|
| `AddTaskDialog.tsx` | `'client_visible'` / `'internal_only'` | OK |
| `automation-actions.ts:107` | `visibility \|\| 'internal'` (fallback) | **FAILS constraint when caller omits — P0** |
| `job-template-engine.ts:799` | `'client'` (typed `as const`) | **FAILS constraint — P0** |

### Fix
- **Apply now (unambiguous P0)**:
  - `job-template-engine.ts` records-request insert → `status: 'not_started'`, `visibility: 'client_visible'`.
  - `automation-actions.ts` create-task fallback → `'internal_only'`.
- **Follow-up (P1)**: introduce `CLIENT_TASK_STATUSES` / `CLIENT_TASK_VISIBILITIES`
  constants in `src/lib/workflow-constants.ts`, refactor the 4 call sites, add a
  vocabulary regression test + smoke check mirroring `job-status-vocabulary`.

### Tests
- Add `src/test/regression/client-task-vocabulary.test.ts` once SSOT lands.
- Add `chk_client_tasks_status` + `chk_client_tasks_visibility` to the smoke
  drift list in `scripts/smoke-test.ts`.

---

## 2. `job_tasks.status`

| Field | Value |
|---|---|
| Table / column | `public.job_tasks.status` |
| DB constraint | `job_tasks_status_check` = `{todo, doing, done, blocked}` |
| DB default | `'todo'` |
| SSOT | **None.** |
| Risk | **P0** |

| Location | Value(s) written | OK? |
|---|---|---|
| `src/components/jobs/TaskConversation.tsx:58` | `'doing'` | OK |
| `src/lib/job-template-engine.ts:772` | **`'not_started'`** | **FAILS constraint — P0** |

### Fix
- **Apply now (unambiguous P0)**: `job-template-engine.ts` template task insert
  → `status: 'todo'`. This is the only canonical equivalent of "freshly created,
  not yet started" in the `job_tasks` vocabulary.
- **Follow-up (P1)**: add `JOB_TASK_STATUSES` constant, regression test, smoke
  check for `job_tasks_status_check`.

---

## 3. `filings.status`

| Field | Value |
|---|---|
| Table / column | `public.filings.status` |
| DB constraints | **THREE overlapping CHECK constraints — all enforced AND-wise:** |
| `valid_status` | `{draft, awaiting_approval, approved, ready_to_file, filed, rejected}` |
| `chk_filing_status` | `{not_started, draft, in_progress, ready_for_review, sent_to_client, client_changes_requested, awaiting_approval, approved, ready_to_file, submitted, accepted, rejected, filed}` |
| `chk_filings_status` (NOT VALID) | `{draft, ready_for_approval, awaiting_client_approval, approved_by_client, approved, queued, submitting, submitted, pending, accepted, filed, rejected, error, submission_failed, cancelled}` |
| **Effective intersection (writeable)** | **`{draft, approved, rejected, filed}`** |
| TS type `FilingStatus` (`src/lib/filing-service.ts:8`) | 13-value union matching `chk_filing_status` only |
| App default insert | `'draft'` (OK) |
| Risk | **P0 — latent. Currently 0 filings in DB.** |

### App values found vs effective intersection

| Location | Value written | Passes all three? |
|---|---|---|
| `filing-service.ts:91` createFilingFromWorkpaper | `'draft'` | YES |
| `filing-service.ts:258` sendForApproval | `'awaiting_approval'` | **NO** (fails `valid_status`) |
| `filing-service.ts:307` updateFilingStatus → `'not_started'` | `'not_started'` | **NO** |
| `filing-service.ts:450` markReady | `'ready_to_file'` | **NO** |
| `filing-service.ts:494` reject | `'rejected'` | YES |
| `filing-service.ts:557` markFiled | `'filed'` | YES |
| `FilingDetail.tsx:168` reopen | `'in_progress'` | **NO** |
| `FilingDetail.tsx` markReady | `'ready_for_review'` | **NO** |

The first user that clicks "Send for Approval", "Mark Ready", or "Reopen" on
any filing will hit a `valid_status` CHECK violation. The Phase-1 smoke test
pattern would catch this; today it does not because no filing exists.

### Fix — **DO NOT change runtime now**
The correct canonical set is **not unambiguous**: the three constraints encode
three different generations of the filing workflow, and `chk_filing_status`
(13 values) is the one the TS union and UI agree with. The 6-value
`valid_status` constraint is almost certainly the **stale** one (matches the
old `workpaper_instances`-style vocabulary), but dropping a constraint is a
schema change that needs explicit approval and a migration.

Recommended (deferred, owner decision required):
1. Confirm `chk_filing_status` is canonical (matches `FilingStatus` TS union).
2. Migration: `ALTER TABLE filings DROP CONSTRAINT valid_status, DROP CONSTRAINT chk_filings_status;`
3. Add `FILING_STATUSES` constant in `workflow-constants.ts` derived from
   `FilingStatus`, regression test, smoke drift check on `chk_filing_status`.

Until then this is **the single highest-risk drift in the codebase**.

---

## 4. `workpaper_instances.status`

| Field | Value |
|---|---|
| Table / column | `public.workpaper_instances.status` |
| DB constraint | `valid_status` = `{draft, in_progress, ready_for_review, finalised}` |
| DB default | `'draft'` |
| SSOT | **None.** |
| Risk | **P1** (no current insert violates the constraint, but UI/KPI filters use stale job vocabulary against the `jobs` table — separate bug below) |

### Observed usage
- `bookkeeping-kpi.ts:295` filters workpaper_instances by `status = 'finalised'` — OK (in constraint).

### Related drift — `jobs.status` filters using LEGACY job vocabulary
These are bugs found while auditing the workpaper area; they refer to `jobs`,
not `workpaper_instances`, but use the retired statuses that Phase 1 removed.

| Location | Filter | Effect |
|---|---|---|
| `src/components/bookkeeping/CreateWorkpaperFromSnapshotDialog.tsx:71` | `.in("status", ["not_started", "in_progress", "review"])` | **Always returns 0 jobs** — none of these values exist in `chk_jobs_status` |
| `src/lib/bookkeeping-kpi.ts:512` | same | KPI card always shows 0 active jobs |

### Fix — **report, do not auto-fix**
The canonical replacement is a **product decision**: "which job statuses
represent in-flight bookkeeping work eligible for workpaper creation /
active-jobs KPI?" Plausible answer: `JOB_STATUSES` excluding `completed` and
`blank`, but this materially changes user-visible counts/lists. Owner of the
Bookkeeping module must confirm before edit.

Once confirmed: import `JOB_STATUSES`, derive `ACTIVE_JOB_STATUSES`, replace
both filters, add the constant to the SSOT module, extend the
`job-status-vocabulary` regression test to assert no other file references the
four legacy strings.

---

## 5. `onboarding_applications`

### 5a. `status`
| Field | Value |
|---|---|
| DB constraint | `onboarding_applications_status_check` = `{draft, in_progress, engagement_pending, aml_pending, billing_pending, portal_pending, for_review, needs_client_action, approved, rejected, cancelled}` |
| DB default | **`'pending'`** — NOT in the allowed set |
| Risk | **P0 — latent.** Any INSERT that omits `status` fails. |

Existing inserts in `OnboardingDetail.tsx` and the public onboarding flow
always specify a status explicitly, which masks the bug. Recommended fix:
migration to change the column default to `'draft'` (matches the constraint
and the application code's documented starting state). Schema change → owner
approval required; not auto-applied.

### 5b. `billing_status`
| Field | Value |
|---|---|
| DB constraint | `onboarding_applications_billing_status_check` = `{pending, skipped, completed, not_required}` |
| DB default | `'pending'` (in set — OK) |
| App usage | `OnboardingDetail.tsx:479` reads `'completed'` for badge, falls back to `'not_started'` for display only (never written). |
| Risk | **P2** — display fallback `'not_started'` is cosmetic; never persisted. |

### 5c. `aml_status`
| DB constraint | `{pending, verified, failed, manual_review}` |
| App usage | Read-only in audited files. |
| Risk | **P2.** |

### Fix
- **Apply now**: none (no unambiguous runtime fix).
- **Follow-up**:
  1. Schema migration to change `onboarding_applications.status` default to `'draft'`.
  2. Add `ONBOARDING_STATUSES` + `ONBOARDING_BILLING_STATUSES` + `ONBOARDING_AML_STATUSES` constants.
  3. Smoke drift check for all three CHECK constraints.

---

## 6. Job template `statusFlow` (`JobTemplateEditor.tsx`)

| Field | Value |
|---|---|
| Storage | `job_templates.template_content` (JSONB) → `statusFlow: string[]` |
| DB constraint | None on JSONB contents |
| SSOT | Already uses `JOB_STATUSES` from `@/lib/workflow-constants` — see line 73, 347, 439 |
| Risk | **None.** Verified clean. |

This file is the **reference pattern** for how every other vocabulary should
consume its SSOT. No action required.

---

## 7. Other status writes in `job-template-engine.ts` (sweep)

| Line | Insert | Status of analysis |
|---|---|---|
| 148, 172, 459, 512 | `jobs.status = 'blank'` | OK — canonical |
| 328, 388 | `services_catalog.status = 'active'` filter | Out of audit scope — services catalog vocabulary |
| 590 | reads `companies.status` | read-only |
| 611 | reads `clients.status` | read-only |
| 687 | reads VAT period status | read-only |
| 772 | `job_tasks.status = 'not_started'` | **P0 — fixed this audit** |
| 798 | `client_tasks.status = 'pending'`, `visibility = 'client'` | **P0 — fixed this audit** |

---

## Summary table

| # | Vocabulary | SSOT? | Risk | Unambiguous fix applied this audit? |
|---|---|---|---|---|
| 1 | `client_tasks.status` / `.visibility` | No | P0 + P1 | **Yes** — 2 broken inserts fixed |
| 2 | `job_tasks.status` | No | P0 | **Yes** — 1 broken insert fixed |
| 3 | `filings.status` (3 constraints) | TS type only | **P0 latent — highest risk** | No — needs schema decision |
| 4 | `workpaper_instances.status` | No | P1 | No |
| 4b | jobs filter in bookkeeping | N/A | P1 (silent zero-results) | No — needs product decision |
| 5a | `onboarding_applications.status` | No | P0 latent (bad default) | No — needs schema migration |
| 5b | `onboarding_applications.billing_status` | No | P2 | No |
| 5c | `onboarding_applications.aml_status` | No | P2 | No |
| 6 | Job template `statusFlow` | **Yes — JOB_STATUSES** | None | N/A |

## Recommended next steps (in order)

1. **Filing constraints reconciliation** (P0 latent, highest risk). Owner: Filings module.
2. **Onboarding status default migration** (P0 latent). Owner: Onboarding module.
3. **Bookkeeping active-jobs filter** product decision (P1, silent UX bug). Owner: Bookkeeping module.
4. Introduce `CLIENT_TASK_STATUSES`, `CLIENT_TASK_VISIBILITIES`, `JOB_TASK_STATUSES`, `FILING_STATUSES`, `WORKPAPER_STATUSES`, `ONBOARDING_STATUSES`, `ONBOARDING_BILLING_STATUSES`, `ONBOARDING_AML_STATUSES` constants and matching regression + smoke checks, modeled on Phase 1.

## Changes applied by this audit

| File | Change | Reason |
|---|---|---|
| `src/lib/job-template-engine.ts` (job_tasks insert) | `status: 'not_started'` → `'todo'` | Constraint `{todo, doing, done, blocked}` — only canonical "fresh" value |
| `src/lib/job-template-engine.ts` (client_tasks insert) | `status: 'pending'` → `'not_started'`, `visibility: 'client'` → `'client_visible'` | Constraints `{not_started, in_progress, complete}` and `{client_visible, internal_only}` |
| `src/lib/automation-actions.ts` (client_tasks fallback) | `visibility \|\| 'internal'` → `visibility \|\| 'internal_only'` | Constraint `{client_visible, internal_only}` |