# Bookkeeping — Phase 5 Delivery Note

Phase 5 wraps the Reports, VAT Detail, and Fixed Assets workstreams. All ledger writes still flow through `post_to_ledger`; all new RPCs are `SECURITY DEFINER`, org-scoped, locked-period-guarded, and audited.

## Build status

`bun run build` — clean (pre-existing dynamic/static import warning only).

## Block A — Financial Reports (ledger-sourced)

- `get_profit_and_loss`, `get_balance_sheet`, `get_aged_debtors`, `get_aged_creditors` RPCs read exclusively from `ledger_entries` joined to `bookkeeping_accounts`. Natural-sign aware; drillable to GL.
- New components under `src/components/bookkeeping/`: `ProfitLossReport`, `BalanceSheetReport`, `AgedReceivablesReport`, `AgedPayablesReport`, wired into `ReportsTab` as sub-tabs.
- All four reports round to 2dp before render and CSV export.
- Generic `downloadCsv` utility added at `src/lib/csv-export.ts` (BOM, escaping, filename helper).

## Block B — VAT Detail + Codes Hardening

- `vat_codes` hardened: `is_system` flag, unique `(organization_id, code)` index, trigger blocks DELETE/UPDATE of system codes.
- `seed_system_vat_codes(p_organization_id)` idempotently seeds the standard UK VAT code set; invoked on org creation in `ensure-organization.ts` (best-effort, non-blocking).
- `get_vat_9box_detail(org, client, company, from, to)` RPC returns 9-box totals plus per-code breakdown with contributing transactions for drilldown.
- `VATBoxDetailReport.tsx` added under `src/components/bookkeeping/`: period filters (defaults to last quarter), 9-box summary cards, expandable per-code rows, CSV export. Wired as a tab in `ReportsTab`.

## Block C — Fixed Assets Register + Depreciation

- `fixed_assets` extended with `depreciation_method` (SL/RB/NONE), `useful_life_months`, `residual_value`, `depreciation_rate_pct`, `accumulated_depreciation`, `status` (active/disposed/fully_depreciated).
- RPCs:
  - `post_monthly_depreciation(asset_id, period_end)` — computes monthly charge, posts journal via `post_to_ledger` (Dr Depreciation Expense / Cr Accumulated Depreciation), idempotent on `(asset_id, period_end)`, locked-period guarded.
  - `run_monthly_depreciation(org, entity, period_end)` — bulk wrapper iterating active assets for the entity.
  - `dispose_fixed_asset(asset_id, date, proceeds, reason)` — posts disposal journal removing cost + accumulated depreciation, recognises gain/loss, flips asset to `disposed`.
- `FixedAssetsTab.tsx` added with register table, Add Asset / Run Monthly Depreciation / Dispose Asset dialogs. Mounted in `Bookkeeping.tsx`.

## Files

- Migrations: `20260609150331_*`, `20260609174756_*`, `20260609203254_*`.
- New: `src/lib/csv-export.ts`, `src/components/bookkeeping/VATBoxDetailReport.tsx`, `src/components/bookkeeping/FixedAssetsTab.tsx`.
- Edited: `ReportsTab.tsx`, `ProfitLossReport.tsx`, `BalanceSheetReport.tsx`, `AgedReceivablesReport.tsx`, `AgedPayablesReport.tsx`, `ensure-organization.ts`, `pages/Bookkeeping.tsx`, generated `types.ts`.

## Known limitations

- VAT submission guardrail (Block B3) — reconciliation snapshot on period close is wired at the report level but not yet enforced inside `submit_vat_return`; tracked for the VAT module phase.
- Depreciation schedule preview UI (Block C4) is functional but minimal; visual schedule chart deferred.

## Acceptance

- P&L, BS, Aged Debtors/Creditors tie to TB to the penny on the seeded test entity.
- 9-box totals reconcile to per-code breakdown sums.
- Monthly depreciation run is a no-op on re-run for the same period.
- Disposal posts correct gain/loss, flips asset status, audited.