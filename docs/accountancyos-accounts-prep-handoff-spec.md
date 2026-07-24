# Accounts-Preparation Handoff — Specification (Increments 2 & 3)

**Status:** LOCKED 2026-07-24 (all decisions D1–D4 resolved by owner). Ready for implementation planning.
**Owner brief:** Bookkeeping/TB → Accounts Prep → Filing, with a strict draft-vs-final discipline.
**Governing architecture (non-negotiable, CLAUDE.md):** Ledger → Adjustments → Normalised Model → Workpapers → Review → Approval → **Approved Model Version** → Filing Projection → HMRC. The HMRC layer never owns figures of record.

---

## 1. The flow we are building

```
Preview  →  review & adjust  →  Finalise / lock  →  Approve  →  File
(draft)      (accounts-prep       (validate,           (freeze       (project from the
             journals)            confirm, lock)       snapshot)     approved snapshot)
```

Two explicit actions, launched **from a job** (the accountant never leaves it):

| | **Preview accounts** | **Finalise & prepare accounts** |
|---|---|---|
| TB snapshot | **Draft**, badged "Draft — not for filing" | **Authoritative**, locked + hashed |
| Period lock | No (never locked to test numbers) | Yes, after validation + explicit confirmation |
| Regenerate from ledger | Yes, freely | No (frozen) |
| Feeds filing | Never | Only after approval |
| Label | **"Prepare accounts"** | **"Finalise & prepare accounts"** |

Never labelled "Export to filing engine" — figures are draft until reviewed and approved.

**TB source is chosen at preview**, not assumed: native ledger / import (CSV, Xero/QBO/Sage/FreeAgent export) / manual entry. All produce the same job-bound workpaper. (Decision locked: no accounting-software API integration — see `accountancyos-accounts-prep-tb-sourcing`.)

---

## 2. What already exists vs what must be built

Legend: ✅ exists & usable · ⚠️ exists but unwired/partial · ❌ missing

### 2a. Trial-balance snapshots & period locking
| Capability | State | Evidence / note |
|---|---|---|
| `trial_balance_snapshots` table (status, `locked`, `finalised_at/by`, `source_type`, period, client/company/**job** links, `balances`, `is_balanced`) | ✅ | types.ts:16090 |
| Native TB from ledger RPC `get_trial_balance_from_ledger` | ⚠️ | Exists, **unused**; UI recomputes TB client-side with *different* sign conventions (must unify) — migration 20260608141410:302 |
| Draft vs authoritative *as an enforced lifecycle* | ❌ | Columns exist; lock decided once at insert via a checkbox; `locked` **not enforced** by any trigger/RLS |
| Snapshot RPCs (create/finalise/regenerate, role-gated, audited) | ❌ | All writes are raw client-side inserts; `trial-balance-service.ts` create/finalise/reopen fns are **dead code** (zero callers) |
| Regenerate draft from ledger + supersession | ❌ | `superseded` status is a label never set |
| Snapshot content hash / ledger binding | ❌ | No hash column (pattern exists on the neighbouring snapshot tables) |
| "Not for filing" gating of drafts | ❌ | Workpaper/filing accept any snapshot regardless of status |
| `status` constrained (CHECK/enum) + uniqueness per (entity, period) | ❌ | Free-text; no unique constraint |
| Period locks (`lock_period`/`unlock_period`, role-gated, audited; blocks posting ≤ lock date) | ✅ | migration 20260609080655; enforced in `post_to_ledger` |
| Snapshot ↔ period-lock coupling | ❌ | Fully decoupled today (a design decision below) |

### 2b. Accounts-prep workpaper (Model B) & adjustments
| Capability | State | Evidence / note |
|---|---|---|
| `workpaper_instances` (job-bound, TB-snapshot link, `field_values` blob, sign-off states draft→…→finalised, `locked`) | ✅ | types.ts:17307 |
| `createWorkpaperFromSnapshot` (idempotent per snapshot+type) | ✅ | workpaper-from-tb.ts:348 |
| **Job-initiated** "Prepare accounts" | ❌ | Only launchable from Bookkeeping → snapshot history; job is an optional manual dropdown → the Increment 2 gap |
| `job_id` linkage integrity | ⚠️ | Column NOT NULL yet create path can pass `null` → contradiction to fix |
| Transactional finalise RPC `finalize_workpaper_safe` | ⚠️ | Exists, **unused** — UI does an inline client-side finalise |
| Adjustments layer | ⚠️→❌ | Today: cosmetic JSON entries with **zero effect** on totals; `isAdjustment` has no consumers. A controlled, audit-trailed, ledger-linkable adjusting-journal layer **does not exist** |
| Tax computation (CT / income tax) | ❌ | `calculateWorkpaperFields` never sets CT/income tax (stay £0); the real connector `applyTaxCalculationsToWorkpaper` has **zero callers**; the CT engine (`ct_rate_tables`, marginal relief → `ct_computation_snapshots`) is real but **never touches the workpaper** |

### 2c. Approved snapshot, filing gate, ledger post-back
| Capability | State | Evidence / note |
|---|---|---|
| Frozen approved snapshot `filing_model_snapshots` (hashed, dedup-by-hash, `source_workpaper_id`, `approved_by/at`) | ✅ | filing-snapshot-service.ts:96 |
| Working computes `ct_computation_snapshots`, `accounts_model_snapshots` (draft→approved) | ✅ | ct-computation-engine.ts:321; frs105-accounts-model.ts:291 |
| Snapshot **immutability** enforced at DB | ❌ | Hash-by-convention only; no trigger forbids UPDATE/DELETE |
| **Filing → snapshot link set in production** (`filings.ct_snapshot_id` / `accounts_snapshot_id`) | ❌ | **The core orphan.** Only a test RPC + amendments set it → the whole approve/gate chain is unreachable in real use |
| VAT filing gate (approved snapshot required) | ✅ | `enforce_vat_filing_gate` + `hmrc-vat-submit` 403 NOT_APPROVED — the working reference lane |
| CT600 filing gate | ⚠️ | Trigger + `hmrc-ct-submit` require the links → satisfiable only via the test RPC today |
| Accounts (Companies House) lane | ❌ | Validator exists; no gate trigger, no submit function |
| Approval mechanism | ⚠️ | Two parallel systems: `filing_approvals` (CT/accounts, wired via `approveCt600Filing`) vs `record_vat_filing_approval` (stamps `vat_returns` columns) — **vocabulary drift to reconcile** |
| Ledger post-back primitive `post_to_ledger` (atomic journals→lines→entries, balance/period-lock/tenant enforced) | ✅ | migration 20260608141410:20 |
| Post-back link + exactly-once guard | ✅(primitive) / ❌(wiring) | `ledger_entries.source_type`+`source_id` exist; duplicate-source guard blocks re-posting a `source_type`+`source_id` **unless allow-listed** — a new `ACCOUNTS_PREP_ADJUSTMENT` type gets exactly-once for free. No adjustment→ledger path exists yet |

**Headline:** the machinery is ~70% built; the failures are **wiring and enforcement**, not greenfield. The VAT lane already works end-to-end and is the template to mirror for CT and accounts.

---

## 3. Increment 2 — Preview & one-click handoff from a job

**Goal:** from a job, one action produces a *draft*, ledger-backed, job-bound accounts-prep workpaper — no navigation detour, no manual re-linking, nothing lockable.

Build:
1. **"Prepare accounts" action on the job** (Job Workpaper tab / job overview). It resolves the job's entity + period and opens a source picker: **Use native ledger** / **Import TB** / **Enter manually**.
2. **Draft TB snapshot, RPC-backed.** New `create_tb_snapshot` RPC (role-gated, audited) that builds balances from the single source of truth `get_trial_balance_from_ledger` (native) or accepts imported/manual balances, writing `status='draft'`, `locked=false`, `source_type` tagged, bound to `client/company/job/period`. Retire the divergent client-side TB math.
3. **Regenerate draft from ledger** — refresh a draft when the ledger changes; supersede the prior draft (`status='superseded'`).
4. **Create the workpaper pre-bound to the job** via `createWorkpaperFromSnapshot(snapshotId, type, { jobId })` with `jobId` injected from the job (no dropdown). Fix the `job_id` NOT-NULL vs `null` contradiction (decision: **job-mandatory** for accounts-prep workpapers). Support >1 workpaper per job (accounts + ct600 from one snapshot).
5. **"Draft — not for filing" badge** on draft snapshots and any workpaper built on one; downstream finalise/filing refuses a non-final snapshot.

Out of scope for Inc 2: tax computation, adjustments-as-journals, locking, approval, filing (all Increment 3).

---

## 4. Increment 3 — Adjust, finalise, approve, file

### 4a. Tax computation (make the numbers real)
Wire `applyTaxCalculationsToWorkpaper` into workpaper creation/refresh **and** a manual "recompute" action, injecting the ids it needs (`company_id`, `organization_id`, `period`, `accounts_snapshot_id`). Persist CT via the existing `ct_computation_snapshots` engine and reflect `corporation_tax`/`income_tax` back into the workpaper. Result: CT & income tax stop being £0.

### 4b. Controlled accounts-preparation journals (the authoritative adjustment layer)
New first-class model — **the default adjustment mechanism for every client type** (works for external-books clients where we don't touch the client's ledger):
- **`accounts_prep_journals`** (header) + **`accounts_prep_journal_lines`** (Dr/Cr against accounts): fields for `workpaper_instance_id`, `narrative`, `status` (draft/approved/posted/reversed), `created_by`, `approved_by/at`, `posted_by/at`, `reverses_id` / `amends_id`, and — when posted back — `ledger_journal_id`.
- Adjustments **recompute** the workpaper downstream (raw TB + approved adjustments → PBT → tax). This replaces today's inert JSON annotations.
- **Full audit trail:** who created/approved/posted, timestamps, the originating workpaper line, and the reversal/amendment chain.

### 4c. Optional post-back to the ledger — with a hard no-double-count guarantee (native clients only)
- Action "Post approved adjustment to ledger" calls `post_to_ledger` with **`source_type = 'ACCOUNTS_PREP_ADJUSTMENT'`** and `source_id = <accounts_prep_journal.id>`. This `source_type` is **excluded from the duplicate-source allow-list**, so re-posting the same adjustment is rejected **exactly-once** by the database.
- On success, stamp `accounts_prep_journals.ledger_journal_id` + `status='posted'`.
- **Double-count guarantee:** the final TB = `get_trial_balance_from_ledger` (which now already contains posted adjustments) **plus only the *un-posted* accounts-prep adjustments as an overlay**. A posted adjustment is therefore counted once and only once. Reversals post a linked reversing journal; the chain stays auditable.

### 4d. Finalise → freeze → approve → gate (mirror the working VAT lane)
1. **Finalise & prepare accounts:** validate (balanced, tax computed, adjustments approved) → **explicit confirmation** → lock the TB snapshot (`locked=true`, compute `snapshot_hash`, bind ledger cutoff) → optionally set the period lock (see decision D3).
2. **Freeze** the approved figures into `filing_model_snapshots` (hashed, `source_workpaper_id`), via the existing `createSnapshot`.
3. **Wire the production link** — set `filings.ct_snapshot_id` / `accounts_snapshot_id` at finalisation (**the core orphan fix**), then `approveCt600Filing`/accounts approval stamps `filings.model_snapshot_id` + a `filing_approvals` row.
4. **Enforce immutability** on `filing_model_snapshots` (BEFORE UPDATE/DELETE trigger / append-only).
5. **Filing projects strictly from the frozen snapshot** — the gate triggers (`enforce_*_filing_gate`) already block submission without it; move CT600 XML generation to read the frozen snapshot (not the mutable compute) so HMRC never sees unfrozen figures.
6. Switch the workpaper finalise to the transactional `finalize_workpaper_safe` RPC (exists, unused) so lock + snapshot + filing creation are atomic and server-enforced.
7. **Build the accounts (CH) lane** to match: `enforce_accounts_filing_gate` + an accounts submit path.

### 4e. Permissions, approval mode & segregation of duties
Finalisation and approval are **grantable permissions**, not hard-coded to owner/admin. Generalise the existing `can_finalize_workpapers` (owner/admin-only today) into two permission-checked capabilities a practice can grant to **roles or specific individuals** (following the established role-tier pattern, e.g. `org_settings.automation_rule_management_mode`):
- **`can_finalise_accounts`** — prepare, compute, adjust, and finalise/lock the authoritative snapshot.
- **`can_approve_filing`** — approve a finalised snapshot for filing.

New practice-level setting **`require_independent_approval_before_filing`** on `org_settings`, **default OFF**:
- **OFF (default):** a user with `can_finalise_accounts` may finalise **and** approve **and** proceed to filing in one flow — self-approval permitted. No owner/admin gate.
- **ON:** finalisation and approval are separate acts. The approver must hold `can_approve_filing` **and must be a different user** than the preparer/finaliser — `approved_by ∉ {prepared_by, finalised_by}`. Enforced both in the approval RPC and by a DB check on the filing-approval gate (a self-approval is rejected). Filing stays blocked until a valid independent approval exists.

In **all** cases: filing consumes **only** the frozen final snapshot, and the full audit trail records **who prepared, finalised, approved and filed, with timestamps** (`prepared_by`/`finalised_by` on the workpaper, `approved_by`/`approved_at` on `filing_approvals`, filer + time on `filing_submissions`).

---

## 5. Data-model changes (additive)
- `trial_balance_snapshots`: add `snapshot_hash`, `ledger_cutoff` marker; CHECK-constrain `status`; add lock-enforcement trigger; unique live snapshot per (org, client/company, period).
- New: `accounts_prep_journals`, `accounts_prep_journal_lines` (+ RLS + audit).
- `filing_model_snapshots`: immutability trigger.
- New `source_type` value `ACCOUNTS_PREP_ADJUSTMENT` (excluded from the post-back dedup allow-list).
- `org_settings`: `require_independent_approval_before_filing boolean NOT NULL DEFAULT false`.
- Permissions: capabilities `can_finalise_accounts` + `can_approve_filing`, grantable to roles **or** individuals (generalise `can_finalize_workpapers`); segregation check `approved_by ∉ {prepared_by, finalised_by}` enforced in the approval RPC + filing-approval gate when the setting is ON.
- New RPCs: `create_tb_snapshot`, `finalise_tb_snapshot`, `regenerate_tb_snapshot`; adjustment approve/post/reverse RPCs; production `set_filing_snapshot` wiring.
All shipped as small additive migrations per the release contract, each verified live.

---

## 6. Decisions — RESOLVED (spec locked 2026-07-24)
- **D1 — Approval authority & segregation:** NOT hard-coded to owner/admin. Finalisation and approval are **grantable permissions** (`can_finalise_accounts`, `can_approve_filing`) assignable to roles or individuals. Practice setting **`require_independent_approval_before_filing`** (default **OFF**): off → a permitted preparer may finalise, approve and file; on → a separately authorised person must approve and **cannot approve their own work** (`approved_by ∉ {prepared_by, finalised_by}`). Full prepared/finalised/approved/filed audit trail in all cases. Filing consumes only the frozen final snapshot. (See §4e.)
- **D2 — Post-back scope:** post-back to the ledger is available **only for native-bookkeeping clients**; external-books clients keep adjustments in the accounts-prep layer. **Locked.**
- **D3 — Finalisation locks the period:** finalising accounts sets the year-end period lock; reopening requires the appropriate permission, a reason, and a complete audit trail. **Locked.**
- **D4 — Approval-system drift:** leave the working VAT approval lane unchanged for launch; converge CT/accounts on `filing_approvals` now; document VAT convergence as a post-launch item. **Locked.**

---

## 7. Explicitly out of scope (this spec)
Accounting-software API integration (owner decision: import/manual only); RTI/CIS/IRmark (Increment 5); the canonical AOS Chart-of-Accounts publish/export that makes import mapping trivial (tracked separately — dependency of the import path, see `accountancyos-accounts-prep-tb-sourcing`).
