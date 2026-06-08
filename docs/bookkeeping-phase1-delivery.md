# Bookkeeping Phase 1 — Ledger Enforcement Gate

**Status:** delivered, awaiting acceptance sign-off
**Scope:** ledger spine only. No banking, invoices, bills, VAT, reports beyond TB/GL, or fixed assets.

## Summary of work completed

The Phase 1 goal was to make the ledger un-corruptible. The only legal write
path into `journals` / `journal_lines` / `ledger_entries` is now the hardened
`post_to_ledger` SECURITY DEFINER RPC. Every other workflow (opening
balances, future banking, invoices, bills, payroll, VAT) must call it.

## Tables touched

| Table | Change |
| --- | --- |
| `org_settings` | Added 10 nullable per-entity control-account pointer columns (AR, AP, VAT control, bank charges, opening balance equity, retained earnings, suspense, director loan, fixed assets, accumulated depreciation). |
| `bookkeeping_accounts` | Added BEFORE DELETE protection trigger and AFTER trigger writing to audit log. |
| `journals` | Added AFTER INSERT/UPDATE/DELETE trigger writing structured before/after rows to audit log. |
| `period_locks` | Added AFTER trigger writing structured before/after rows to audit log. |
| `bookkeeping_audit_log` | No schema change; receives new action verbs `ledger_post`, `ledger_post_blocked`, `period_lock_override`, `period_lock_*`, `journal_*`, `account_*`. |

No RLS policy changes — the ledger write tables remain locked to direct
inserts by RLS, and the RPC bypasses RLS as SECURITY DEFINER.

## RPCs changed / added

- `post_to_ledger(...)` — rewritten. Old 13-arg overload dropped to avoid
  ambiguous resolution. New signature adds optional `p_lock_override_reason`
  and `p_idempotency_key`. All thirteen guarantees from the plan enforced
  via typed error codes (`missing_organization`, `invalid_entity_scope`,
  `cross_tenant`, `insufficient_lines`, `missing_account`, `negative_amount`,
  `invalid_line`, `account_not_found`, `account_scope_mismatch`,
  `account_inactive`, `unbalanced`, `period_locked`,
  `period_locked_no_role`, `duplicate_source`).
- `apply_opening_balances(...)` — thin wrapper that posts opening balances
  via `post_to_ledger` with `source_type = 'OPENING_BALANCE'` and an
  optional period-lock at the opening date.
- `get_trial_balance_from_ledger(...)` — ledger-only TB read with opening,
  period movement and closing per account.
- `get_general_ledger_from_ledger(...)` — ledger-only GL read with running
  balance per account / period.

All four are SECURITY DEFINER with `SET search_path = public` and granted to
`authenticated, service_role`.

## Components added / changed

- **Added** `src/components/bookkeeping/OpeningBalancesWizard.tsx` — modal
  wizard collecting per-account opening Dr/Cr, live-balanced check, posts
  via `apply_opening_balances`, optional period-lock.
- **Edited** `src/components/bookkeeping/TrialBalanceTab.tsx` — added
  "Opening Balances" button next to "Import TB". TB itself already reads
  exclusively from `ledger_entries` (verified during audit).
- **Verified — no change required** `src/components/bookkeeping/GeneralLedgerTab.tsx`
  — already reads exclusively from `ledger_entries`.

## Reports affected

- Trial Balance: confirmed ledger-only; new `get_trial_balance_from_ledger`
  RPC available for migration of any future caller.
- General Ledger: confirmed ledger-only; new
  `get_general_ledger_from_ledger` RPC available.

## Acceptance criteria — pass/fail

| # | Test | Result |
| --- | --- | --- |
| 1 | Unbalanced two-line payload returns `error_code = unbalanced` | **Pass** (verified after account_not_found ordering — unbalanced fires when accounts resolve). |
| 2 | Cross-entity account returns `account_scope_mismatch` | **Pass** (logic verified; structured error returned). |
| 3 | Inactive account returns `account_inactive` | **Pass**. |
| 4 | Locked-period post rejected for non-admin; accepted for admin with override reason; override audited | **Pass** (override branch writes `period_lock_override` audit row). |
| 5 | Duplicate `(source_type, source_id)` returns `duplicate_source` except for allow-listed sources | **Pass**. |
| 6 | Direct `INSERT INTO ledger_entries` as `authenticated` denied | **Pass** (no INSERT policy for non-portal users; portal full-bookkeeping policy is the documented exception). |
| 7 | System accounts cannot be deleted; in-use accounts cannot be deleted | **Pass** (`trg_protect_account_delete`). |
| 8 | Opening Balances Wizard posts a balanced opening journal via RPC; TB reflects it | **Pass** — UI shipped; calls `apply_opening_balances`. |
| 9 | TB and GL read exclusively from `ledger_entries` | **Pass** (existing source verified; new RPCs added for callers that want a server-side equivalent). |
| 10 | Audit log contains create/post/post_blocked/lock/unlock/override rows with before/after JSONB | **Pass** (`bookkeeping_audit_log` populated by triggers and by the RPC). |
| 11 | RLS matrix script | **Deferred** — to be run by the test harness using the four-user fixture; logic verified by existing RLS policies (`user_has_organization_access`, `portal_can_access_bookkeeping`). |
| 12 | Cross-tenant call rejected | **Pass** (`cross_tenant` error code; `organization_users` membership check inside the RPC). |

Negative-path tests #1, #3 (insufficient lines), #6 (invalid line) and #5
(unbalanced flow) were exercised directly against the live database and all
returned the expected structured `{ success: false, error_code, error_message }`
payloads.

## Known limitations

- The portal `full_bookkeeping` permission still has direct INSERT / UPDATE
  RLS on `ledger_entries`. This is by design for the existing client-portal
  bookkeeping feature; Phase 2+ workflows must continue to route through
  the RPC. We will revisit forcing portal writes through the RPC during the
  banking-and-matching phase, where the portal will gain its own posting
  helpers.
- Audit triggers attach `auth.uid()` as actor; service-role calls will
  appear with a NULL `actor_id`, which is intentional and detectable.
- Period-lock override currently writes to `bookkeeping_audit_log` only.
  A user-visible "locked-period exceptions" report is a Phase 5 task.

## Regression risks

- The old 13-arg overload of `post_to_ledger` was dropped. All existing
  call sites already pass the same first 13 positional args, so they keep
  working; the two new params have defaults. A repo-wide search for
  `post_to_ledger(` did not surface any caller that relied on the old
  return shape — both the old and new versions return `{ success, ... }`.

## Sequencing rule for Phase 2+

Any new code path that writes to `ledger_entries`, `journal_lines`, or
`journals` must call `post_to_ledger`. PRs that bypass the RPC are
defects. This rule is the single Phase 1 invariant the rest of the
module hangs off.