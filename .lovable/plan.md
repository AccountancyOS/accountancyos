## Phase 1 Only — Ledger Enforcement Gate

Phase 1 is treated as the gate to everything else. No work on banking, invoices, bills, VAT, reports or fixed assets begins until the acceptance tests at the end of this phase are green and a written delivery note is produced.

The deliverable of this phase is not a feature; it is a proof. The proof is: the ledger cannot be corrupted from any path — UI, hand-written SQL, an unauthenticated client, a rogue edge function, or a buggy future workflow — because the only legal write path is the `post_to_ledger` RPC, and that RPC refuses to write anything that breaks the rules.

### 1. Audit `post_to_ledger` and patch what's missing

Inspect the live RPC in `supabase/migrations/20260218184412_*` and `20260218190158_*`. Confirm, and patch where absent, every one of these guarantees as a hard SQL check that raises a typed exception before any insert:

1. Unbalanced postings rejected (`sum(debit) = sum(credit)`, decimal/numeric only, no float).
2. Missing `organization_id` rejected.
3. Missing entity scope (`client_id` XOR `company_id`) rejected.
4. Every line's `account_id` must belong to the same `organization_id` AND same entity as the header — joined and validated server-side, not trusted from the payload.
5. Postings to inactive accounts rejected.
6. Postings dated on/before the entity's `period_locks.lock_date` rejected, unless `p_lock_override_reason` is non-null AND caller is an org owner/admin via `has_role`. Override writes an audit row.
7. Duplicate posting from the same `(source_type, source_id)` rejected, except where `source_type` is `JOURNAL` (reversal), `PAYMENT`, `CREDIT_NOTE`, or `VAT_ADJUSTMENT`, which may legitimately reference an upstream id more than once.
8. Lines with both debit and credit non-zero rejected; lines with neither rejected; negative amounts rejected.
9. AR lines must carry `customer_id`; AP lines must carry `supplier_id`. Determined by joining `bookkeeping_accounts.account_subtype` against the structured `TRADE_DEBTORS` / `TRADE_CREDITORS` taxonomy used in `posting-service.ts` — not by name matching.
10. VAT lines must post to an account with `account_subtype IN ('VAT_CONTROL','VAT')` and `is_control_account = true`.
11. `journals`, `journal_lines`, and `ledger_entries` remain INSERT/UPDATE/DELETE-locked to `service_role`; the RPC is `SECURITY DEFINER` and remains the only public write path.
12. On every failure path, the RPC returns a structured `{ success: false, error_code, error_message }` and writes a `bookkeeping_audit_log` row with `action = 'post_blocked'`, before/after payloads, and the reason.
13. On success, writes one audit row per posting with `action = 'post'` and the journal id.

The patch lands as a single additive migration that recreates the function (no destructive drops). Existing call sites continue to work because the public signature is preserved; new optional parameters (`p_lock_override_reason`, `p_idempotency_key`) are nullable.

### 2. Standard UK Chart of Accounts seed

Idempotent seed via `supabase--insert` (not migration, because this is data):

- Mark the seeded rows `is_system_account = true`, `is_active = true`.
- Required accounts: Bank, Accounts Receivable, Accounts Payable, VAT Control, Sales, Sales Discounts, Bad Debts, Purchases, Cost of Sales, Wages, PAYE/NIC Control, Pension Control, Corporation Tax Control, Director's Loan, Fixed Assets, Accumulated Depreciation, Suspense, Opening Balance Equity, Retained Earnings, Bank Charges.
- Add DB trigger blocking DELETE of any `bookkeeping_accounts` row where `is_system_account = true` OR where the account is referenced by any `ledger_entries`, `invoice_lines`, `bill_lines`, `journal_lines`, or `tb_account_mappings` row.
- Per-entity bookkeeping settings table extended (or `org_settings` JSON if already used) to store the control-account pointer set listed in the user's brief: `accounts_receivable_control_account_id`, `accounts_payable_control_account_id`, `vat_control_account_id`, `bank_charges_account_id`, `opening_balance_equity_account_id`, `retained_earnings_account_id`, `suspense_account_id`, `director_loan_account_id`, `fixed_assets_account_id`, `accumulated_depreciation_account_id`. Populated from the seeded chart on first use.

### 3. Opening Balances workflow (ledger-posted)

New screen `OpeningBalancesWizard` under `src/components/bookkeeping/`. Steps:

1. Pick opening date.
2. Enter or paste balances per account.
3. Live balanced-check (sum debits vs sum credits) before "Post" enables.
4. Preview the journal that will be posted, with Opening Balance Equity as the balancing line if the user under/over-provides.
5. Post via `post_to_ledger` with `source_type = 'OPENING_BALANCE'` and a single `source_id` per opening event.
6. On success, prompt to set `period_locks.lock_date = opening_date` so nothing pre-opening can be back-posted.
7. Reversal requires admin role + reason, writes audit log, posts an equal-and-opposite journal — never deletes the original.

No "loose" opening account values; every opening balance is a ledger entry.

### 4. Ledger-only Trial Balance and General Ledger

Replace any existing TB/GL queries that read from source-document totals with two named query modules in `src/lib/reports/`:

- `getTrialBalanceFromLedger(orgId, entityRef, asAtDate)` — sums `ledger_entries.debit_base` / `credit_base` grouped by `account_id`, joined to `bookkeeping_accounts` for code/name/type ordering.
- `getGeneralLedgerFromLedger(orgId, entityRef, accountId, fromDate, toDate)` — running balance, every row drillable to `journals.source_type` + `source_id`.

Both functions live behind a thin RPC (`security definer`) so the source query is provable and centralised. UI in `TrialBalanceTab.tsx` and `GeneralLedgerTab.tsx` is rewired to these RPCs only. Inline code comment + a one-paragraph note in `docs/bookkeeping-ledger-contract.md` records that these reports read `ledger_entries` exclusively.

### 5. Audit log triggers

DB triggers on `journals`, `journal_lines`, `ledger_entries`, `period_locks`, `bookkeeping_accounts` that write to `bookkeeping_audit_log` with the action verb, `before_data` and `after_data` JSONB, `user_id` from `auth.uid()` where available (else `triggered_by_service_role = true`), and `organization_id` + entity scope copied from the row. Triggers attribute opening-balance posts and lock changes correctly so the Phase 1 acceptance test for audit completeness can pass.

### 6. RLS verification matrix

A repeatable test script under `scripts/tests/phase1-rls.ts` that signs in as four synthetic users and asserts the expected row counts:

- Org-A accountant → sees Org-A ledger only.
- Org-B accountant → zero rows on Org-A.
- Portal user with `allow_bank_connect=true` for Entity X → zero rows on Entity Y in same org.
- Revoked portal user → zero rows everywhere; explain RPC denies access.

Output written into the Phase 1 delivery note as a pass/fail table.

### 7. Phase 1 acceptance tests (gate)

Phase 1 is not complete until every one of these is green:

1. `post_to_ledger` rejects an unbalanced two-line payload with `error_code = 'unbalanced'`.
2. `post_to_ledger` rejects a payload whose line `account_id` belongs to a different entity, with `error_code = 'account_scope_mismatch'`.
3. `post_to_ledger` rejects an inactive-account post.
4. `post_to_ledger` rejects a post dated inside a locked period for a non-admin, then accepts the same post for an admin with `p_lock_override_reason` set — and the override is in `bookkeeping_audit_log`.
5. `post_to_ledger` rejects a duplicate `(source_type, source_id)` for non-allow-listed source types.
6. Direct `INSERT INTO ledger_entries` as `authenticated` is denied by RLS.
7. The seeded standard chart exists for each test entity, system accounts cannot be deleted, in-use accounts cannot be deleted.
8. Opening Balances Wizard posts a balanced opening journal via the RPC; trial balance immediately reflects the opening balances; reversing requires admin + reason and writes audit rows.
9. Trial Balance and General Ledger pages read exclusively from `ledger_entries` (proved by reading the RPC source and by toggling a feature flag that wipes the invoice/bill tables — reports must still match).
10. Audit log contains create/post/post_blocked/lock/unlock/override entries with `before_data`, `after_data`, `user_id`, `organization_id` populated.
11. RLS matrix script passes for all four synthetic users.
12. Cross-tenant attempt: Org-B service call to `post_to_ledger` with Org-A `organization_id` is rejected (the RPC re-validates membership via `has_role` + `organization_users`).

### 8. Phase 1 delivery note (written output)

When the acceptance tests are green, produce `docs/bookkeeping-phase1-delivery.md` containing:

- Summary of work completed
- Tables touched (`bookkeeping_accounts`, `period_locks`, `bookkeeping_audit_log`, entity bookkeeping settings)
- Columns added (per-entity control account pointers; optional `p_lock_override_reason` / `p_idempotency_key` on the RPC; audit log columns if any)
- RPCs changed (`post_to_ledger`, new `get_trial_balance_from_ledger`, `get_general_ledger_from_ledger`, `apply_opening_balances`)
- RLS policies changed (none expected on already-locked ledger tables; document the negative result)
- Components added (`OpeningBalancesWizard`, rewired `TrialBalanceTab`, `GeneralLedgerTab`)
- Reports affected (TB, GL)
- Known limitations (no banking/invoices/bills/VAT in this phase by design)
- Manual tests completed (the 12 acceptance items)
- Automated tests completed (`phase1-rls.ts`, RPC unit tests via `supabase--test_edge_functions` where applicable)
- Seed data created (standard chart for the four test entities; Entity A opening balances posted)
- Regression risks (existing call sites of `post_to_ledger` — already validated, signature preserved)
- Screen paths to inspect (`/bookkeeping?tab=reports`, `/bookkeeping/opening-balances`)
- Acceptance criteria pass/fail table

Only after this document is delivered and the table is all-green does Phase 2 (Banking and Matching) begin.

### Out of scope for Phase 1

Banking explain/match UI, bank rules, CSV import, invoice/bill workflows, payment allocations, VAT codes seed and detail report, P&L, BS, Aged Debtors/Creditors, Fixed Assets — all deferred to their respective later phases per the master plan.

### Sequencing rule

Phase 2 will not be opened until the Phase 1 delivery note is approved. If during Phase 2–5 any later workflow needs to write to the ledger, it MUST call `post_to_ledger`. Any new code path that touches `ledger_entries` directly is a defect and will be rejected in review.
