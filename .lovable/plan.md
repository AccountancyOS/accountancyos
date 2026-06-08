## Goal

Give the portal client full bookkeeping write access — connect bank, categorise transactions, match payments to invoices and bills, create invoices and bills, run VAT — gated behind a single accountant-controlled master toggle "Full Bookkeeping Access".

## Policy reversal — explicit

`docs/portal-disabled-features.md` will be updated. The "portal must never write to the ledger" rule is **superseded** for tenants whose accountant has turned on the master toggle. Default for new clients remains read-only.

Memory `mem://constraints/portal-bookkeeping-write-policy` will be added so future loops respect the new model.

## What's already in place (no work)

- Bank-connect edge functions (`truelayer-auth`/`-callback`/`-sync`).
- `ConnectBankDialog` (TrueLayer flow).
- Per-flag portal write RLS for: `invoices`, `invoice_lines`, `bills`, `bill_lines`, `bank_connections`, `customers`, `suppliers`. All gated by `portal_has_perm`.
- Accountant-side categorise, match, payment, VAT flows in `src/components/bookkeeping/*` — we will reuse, not rewrite.
- Per-flag portal toggles (`allow_invoice_create`, `allow_bill_create`, `allow_bank_connect`, etc.) on `portal_visibility_settings`.

## What's missing — the gaps to close

### Database
1. New column `portal_visibility_settings.full_bookkeeping_access boolean default false`.
2. Update `portal_has_perm(client_id, company_id, permission)` so it returns `true` whenever `full_bookkeeping_access` is on. This single change lights up every existing portal write policy that's already keyed to a `portal_has_perm` call.
3. Add new portal write policies for surfaces with no portal write yet — all gated on `portal_has_perm(client_id, company_id, 'full_bookkeeping')`:
   - `ledger_entries` — INSERT (categorisation) and UPDATE (edit own portal-origin entries).
   - `bank_transactions` — UPDATE (set `status='MATCHED'`, `matched_ledger_entry_id`).
   - `invoice_payments` — INSERT, UPDATE (payment matching).
   - `bill_payments` — INSERT, UPDATE.
   - `vat_returns` — UPDATE (approve/submit).
   - `journals` + `journal_lines` — INSERT (only via `post_to_ledger`, which is SECURITY DEFINER, so policy stays as is; we just need a portal INSERT row to satisfy the function when run as the portal user).
   - `reconciliations`/`reconciliation_lines` — SELECT, INSERT, UPDATE.
   - `matching_candidates` — SELECT, UPDATE (mark resolved).
4. Add a DB trigger on `ledger_entries` to stamp `created_by_portal_user_id` when the writer is a portal user, so the accountant audit/recent-activity view can distinguish client-posted entries.

All migrations include explicit GRANTs per project rules.

### Backend
- No edge-function changes needed for categorise/match flows (they're plain DB writes via the existing client patterns).
- Re-verify `post_to_ledger` RPC works under portal context. If it currently checks `user_has_organization_access`, add a branch that accepts `portal_can_access_bookkeeping`.

### Accountant UI
- `src/components/client-portal/BookkeepingPermissionsPanel.tsx`: add a prominent "Full Bookkeeping Access" master switch above the existing granular grid. When on, the granular toggles render disabled with "(included)" labels and the underlying row is saved with `full_bookkeeping_access=true`.
- New accountant alert in `BankingTab`: when bank account is `provider='TRUELAYER'` and client has full access, show "Connected by client — last synced X" instead of the existing "client may need to reconnect" copy.
- New "Recent Client Activity" card on `src/pages/Bookkeeping.tsx` listing the most recent 20 portal-originated `ledger_entries`/`invoice_payments`/`bill_payments` for sign-off (read-only feed; no approval gate, just visibility).

### Portal UI
- `usePortalBookkeepingPermissions` — add `allowFullBookkeeping: boolean` (reads new column). When true, returns every existing flag as `true` so existing portal gates open automatically.
- `PortalBookkeepingFull.tsx` — when `allowFullBookkeeping`:
  - Replace the Overview "explain queue" CTA group with the accountant-style action bar (Connect Bank, Categorise Transactions, Match Payments, New Invoice, New Bill, VAT Return) wired to the existing dialogs.
  - Render the Banking tab using a new thin wrapper `PortalBankingTab` that adds the missing "Connect Bank Account" CTA above the accountant `BankingTab` content and handles `?truelayer=success|error` query params (toast + invalidate).
  - Sales tab: drop the read-only stub, mount accountant `SalesModule` directly (it already gates writes by RLS).
  - Purchases tab: same, mount `PurchasesModule`.
  - VAT tab: mount `VATReturnsTab` as-is.
- The legacy `PortalTransactionExplainDialog` stays available for clients on the per-flag (non-full) model — no removal.
- `ConnectBankDialog`: accept optional `redirectPath` prop so portal can pass `/portal/bookkeeping?tab=banking`. Default unchanged.

### Docs / memory
- Update `docs/portal-disabled-features.md`: mark the bookkeeping-writes and TrueLayer rows as **superseded for tenants with Full Bookkeeping Access on**.
- New memory `mem://constraints/portal-bookkeeping-write-policy` describing the master toggle, the `portal_has_perm` short-circuit, and the audit stamping behaviour.

## Out of scope

- A formal accountant approval queue (per your answer — direct posting).
- New portal-only matching UI invented from scratch — we reuse the accountant components.
- Reverting the granular flags — they remain for tenants who don't want full access.
- Production TrueLayer (still sandbox; live switch is a separate env-flag task).

## Build order

1. Migration: add column, update `portal_has_perm`, add new write policies, add audit-stamp trigger.
2. Portal hook + `PortalBookkeepingFull` mounting accountant modules.
3. `ConnectBankDialog` redirectPath prop + new `PortalBankingTab` wrapper.
4. Accountant `BookkeepingPermissionsPanel` master switch + "Recent Client Activity" card.
5. Docs + memory update.
6. QA pass: log in as Amy-Lee, toggle master on, run through connect → categorise → match in + out → new invoice → new bill → VAT preview, watch policies hold.
