# Phase 5 — Reports, VAT Detail, Fixed Assets

Sequenced delivery in three blocks. Same discipline as Phases 1–4: every
ledger touch goes through `post_to_ledger`; every mutating RPC is
`SECURITY DEFINER`, org-scoped, locked-period-guarded, and audited.

## Block A — Financial Reports (ledger-sourced)

A1. `get_profit_and_loss(org, entity, from, to, basis)` — sums `ledger_entries`
    grouped by `bookkeeping_accounts.account_type IN (INCOME, EXPENSE, COGS)`,
    natural-sign aware, drillable.
A2. `get_balance_sheet(org, entity, as_at)` — ASSET/LIABILITY/EQUITY snapshot
    incl. computed retained earnings from prior-period P&L.
A3. `get_aged_debtors(org, entity, as_at)` / `get_aged_creditors(...)` — buckets
    Current / 1-30 / 31-60 / 61-90 / 90+, by `customer_id` / `supplier_id`,
    sourced from open AR/AP ledger entries (control account) minus allocations.
A4. UI: `ProfitAndLossTab`, `BalanceSheetTab`, `AgedDebtorsTab`,
    `AgedCreditorsTab` under `src/components/bookkeeping/reports/`, wired to
    the existing Bookkeeping → Reports page. CSV export per report.
A5. Acceptance: each report ties to TB to the penny; drilldown opens the GL.

## Block B — VAT Detail + Codes Hardening

B1. Seed full UK VAT code set into `vat_codes` (S/Z/E/R/RC/OS/IMP/EXP variants)
    via `supabase--insert`, marked `is_system = true`, undeletable trigger.
B2. `get_vat_9box_detail(org, entity, period_id)` — returns each of the 9 boxes
    with the contributing `ledger_entries`/`bill_lines`/`invoice_lines` rows
    for full drilldown; immutable snapshot written when period closes.
B3. Submission guardrails: refuse `submit_vat_return` unless detail snapshot
    exists AND TB-vs-9-box reconciliation is within £1; audited.
B4. UI: VAT period page gains a "9-Box Detail" tab with drilldown + CSV.
B5. Acceptance: synthetic period with mixed codes ties 9-box to ledger to TB.

## Block C — Fixed Assets Register + Depreciation

C1. Extend `fixed_assets` with method (SL/RB), useful life, residual,
    disposal fields. Add `fixed_asset_schedules` for the period plan.
C2. RPC `post_monthly_depreciation(org, entity, period_end)` — computes
    per-asset charge, posts a single journal via `post_to_ledger`
    (Dr Depreciation Expense / Cr Accumulated Depreciation), idempotent on
    `(asset_id, period_end)`, locked-period guarded, audited.
C3. RPC `dispose_fixed_asset(asset_id, date, proceeds, reason)` — posts
    disposal journal (remove cost + accum dep, recognise gain/loss),
    flips asset to `disposed`, audited.
C4. UI: `FixedAssetsTab` register with add/edit/dispose, monthly run button,
    schedule preview.
C5. Acceptance: asset added → monthly run posts correct journal → TB ties;
    disposal posts gain/loss correctly; re-running same month is a no-op.

## Sequencing

Block A first (largest user-visible payoff and unblocks accountant review).
Block B next (depends on A for TB reconciliation). Block C last.
Each block lands as its own migration set with a wrap-up doc.