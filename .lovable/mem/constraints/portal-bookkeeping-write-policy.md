---
name: Portal Bookkeeping Write Policy
description: Full Bookkeeping Access master toggle, portal_has_perm short-circuit, and audit stamping for client-originated bookkeeping writes
type: constraint
---
The portal can write directly to bookkeeping (categorise transactions, match payments to invoices and bills, create invoices/bills, connect bank via TrueLayer, approve VAT) ONLY when the accountant enables `portal_visibility_settings.full_bookkeeping_access` for that client/company.

How it works:
- `public.portal_has_perm(client_id, company_id, permission)` returns true for any allowed permission when the master flag is on. It also recognises a synthetic permission key `'full_bookkeeping'` used to gate the new write policies.
- Write RLS lives on `ledger_entries`, `bank_transactions`, `invoice_payments`, `bill_payments`, `vat_returns`, `reconciliations`, `reconciliation_lines`, `matching_candidates`. All keyed on `portal_has_perm(..., 'full_bookkeeping')`.
- Trigger `stamp_created_by_portal` sets `created_by_portal=true` on inserts to `ledger_entries`, `invoice_payments`, `bill_payments` whenever the writer satisfies `public.is_portal_user()` (any active `portal_access` row for auth.uid).
- Updates to `ledger_entries` from the portal are limited to rows the portal user inserted (`created_by_portal=true`) and never to locked entries.

Why: lets a tenant act as their own bookkeeper without losing the accountant audit trail. Default for new clients remains fully read-only.

Do not re-introduce a per-flag duplicate of this — there is one master toggle plus the existing granular flags for partial setups.

Supersedes the bookkeeping-writes and TrueLayer rows in `docs/portal-disabled-features.md` for tenants where the master flag is on.