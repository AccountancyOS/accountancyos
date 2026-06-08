# Client Portal — Disabled Features (Batch 1)

The features below are intentionally not exposed in the client portal by
default. They are either unsafe in their imported form or require backend
work that is out of scope.

**Superseded for tenants with the "Full Bookkeeping Access" master toggle on.**
When the accountant enables `portal_visibility_settings.full_bookkeeping_access`
for a client/company, the bookkeeping-writes and TrueLayer rows below no
longer apply: the portal user can categorise transactions, match payments,
create invoices and bills, connect a bank via TrueLayer, and approve VAT
returns. Writes are stamped `created_by_portal=true` in the audit log.
Server-side enforcement lives in `portal_has_perm` and the per-table RLS
policies it gates.

| Feature | Status | Disabled Because | Future Requirement |
|---------|--------|------------------|--------------------|
| Bookkeeping writes — create invoice, create bill, record payment, categorise transaction, edit transaction, ledger edits, VAT-affecting writes | Removed from portal | The portal must never write to the accountant ledger directly. The imported portal code did, which is unsafe. | A separate accountant-reviewed write queue (out-of-scope backlog). Until then bookkeeping in the portal stays read-only. |
| TrueLayer bank connection — connect bank, OAuth start, OAuth callback, refresh, reconnect, token storage | Available when Full Bookkeeping Access is on | Rebuilt server-side inside the accountant project with `bank_connections` RLS gated by `portal_has_perm('allow_bank_connect')`. | — |
| Notification preference toggles | Removed from portal Settings UI | Old UI rendered a fake "saved" toast without persisting. | Bind to `email_preferences` (or a portal-scoped equivalent) before re-introducing the UI. |
| Hardcoded financial trends and KPIs | Removed from portal dashboard | Numbers were literal mock values, not derived from any backend. | Derive from `ledger_entries` / `trial_balance_snapshots` gated by `portal_visibility_settings`, or keep hidden. |
| Mock activity feed | Removed from portal dashboard | Source was `mockData.ts`, not real events. | Source from `audit_log` filtered to portal-visible events, or keep hidden. |
| Invoice creation / bill creation / customer + supplier management screens | Not imported | Bookkeeping write surfaces. | See bookkeeping-writes row above. |
| Banking accounts / transactions screens | Not imported | TrueLayer-dependent. | See TrueLayer row above. |

Any code path in `src/portal/` that needs to refer to a disabled feature
should use `disabledFeature("<feature name>")` from
`src/portal/services/_disabled.ts` so the message stays consistent.