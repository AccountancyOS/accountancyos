## Goal

Expose the full bookkeeping module inside the client portal — gated by the bookkeeping service being active for that client/company — so clients can connect banks (TrueLayer), categorise transactions, raise invoices/bills, and view reports like they would in Xero/QuickBooks. Deactivating the service hides the module but preserves all data.

## Scope

### 1. Service-gated access

- New portal hook `usePortalBookkeepingAccess(entityId)` calling existing `getActiveServicesForEntity` server-side via an RPC `portal_has_bookkeeping(entity_type, entity_id)` (SECURITY DEFINER, scoped to caller's portal_access rows). Returns `{ enabled, reason }`.
- Sidebar in `PortalLayout` shows the Bookkeeping tab only when at least one accessible entity has bookkeeping active. For multi-entity portal users, gating is re-evaluated per selected entity.
- `PortalBookkeeping` route renders one of three states:
  - **Active** → full module (see §2).
  - **Inactive but historical data exists** → read-only "archived" banner + the existing view-only summary (current behaviour preserved).
  - **Never active / no data** → existing empty state.

### 2. Full bookkeeping module in portal

Reuse the existing `src/components/bookkeeping/*` components inside a new `src/portal/pages/PortalBookkeepingFull.tsx` shell that mirrors `src/pages/Bookkeeping.tsx`, with these differences:

- Entity selector restricted to entities the portal user has access to AND with bookkeeping active.
- Tabs exposed: Overview, Reports, Chart of Accounts, Journals, Banking, Bank Rules, Sales, Purchases, Receipts, VAT Returns (if VAT-registered).
- Tabs hidden in portal: Tax Mapping, Period Lock, Payroll, CIS (accountant-only — payroll/CIS already have dedicated portal surfaces if needed later).
- TrueLayer "Connect bank" flow wired to the existing `truelayer-auth` / `truelayer-callback` / `truelayer-sync` edge functions, invoked from the portal with the portal user's JWT.

### 3. RLS / permission model

All bookkeeping tables (`bookkeeping_accounts`, `bank_accounts`, `bank_connections`, `bank_transactions`, `invoices`, `invoice_lines`, `invoice_payments`, `bills`, `bill_lines`, `bill_payments`, `credit_notes*`, `customers`, `suppliers`, `receipts`, `journals`, `journal_lines`, `ledger_entries`, `categorization_rules`, `bank_rules`, `vat_*`, `reconciliations*`, `matching_candidates`) gain an additional policy:

```
USING (
  public.portal_user_can_access_entity_bookkeeping(
    auth.uid(), <client_id|company_id columns on row>
  )
)
```

A new SECURITY DEFINER function checks: caller has an active `portal_access` row for that client/company AND `services_catalog`-resolved bookkeeping service is currently active for that entity. Same predicate gates INSERT/UPDATE/DELETE for client-editable tables (everything except `journals`, `journal_lines`, `ledger_entries`, `tb_account_mappings`, `period_locks`, which stay accountant-only write — clients get SELECT only on those).

### 4. Accountant-side deactivation UX

In Services / engagement editor, when the accountant turns the bookkeeping service Off for a client:

- Show an `AlertDialog`: "Turning off Bookkeeping will remove your client's portal access to bank connections, transactions, invoices, bills, and reports. **No data will be deleted** — re-enabling restores full access. Continue?"
- On confirm: persist the deactivation as today; no destructive changes. The RLS predicate automatically hides data from the portal because the service check flips to false.
- An audit row is written to `bookkeeping_audit_log` (`action: 'portal_access_revoked'`, with reason).

### 5. Bank connection flow (TrueLayer) from portal

- Add `ConnectBankDialog` invocation behind a portal-aware wrapper that:
  - Calls `truelayer-auth` with `{ client_id|company_id, return_to: '/portal/bookkeeping?tab=banking' }`.
  - Callback edge function already stores tokens against the entity; verify it accepts portal-user-initiated flows (passes JWT through, no accountant-only assumptions). If it currently checks `organization_users`, add a branch accepting `portal_access` for the same entity.

### 6. Data preservation guarantee

No schema deletes. Deactivation only toggles the service row. Test plan verifies that reactivating restores all previously visible records to the portal.

## Technical notes

- New SQL migration adds:
  - `public.portal_user_can_access_entity_bookkeeping(uid uuid, client_id uuid, company_id uuid) returns boolean`
  - `public.portal_has_bookkeeping(entity_type text, entity_id uuid) returns boolean`
  - Additional RLS policies on the bookkeeping tables listed in §3 (kept narrowly named `"Portal users can ... when bookkeeping active"`).
  - GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated` is already present; no GRANT changes needed beyond confirming.
- Front-end:
  - New `src/portal/pages/PortalBookkeepingFull.tsx` + entity selector wrapper `src/portal/components/PortalBookkeepingEntitySelector.tsx`.
  - Refactor `PortalBookkeeping.tsx` into a dispatcher that picks Full vs Read-only vs Empty.
  - Update `PortalLayout` sidebar gating.
  - Reuse `src/components/bookkeeping/*` directly — no fork.
- Accountant side:
  - Add the warning AlertDialog to the bookkeeping-service toggle in `src/pages/Services.tsx` and any engagement editor that flips this service.
- Security:
  - Run `security--run_security_scan` and `supabase--linter` after migration.
  - Verify cross-tenant isolation via `portal-qa-probe` for the new surfaces.

## Out of scope

- Mobile receipt-capture app.
- Auto-categorisation ML beyond the existing `bank_rules` engine.
- New reports beyond what already exists in `ReportsTab`.
- Payroll / CIS in portal (separate workstream).

## Open questions

1. **Write permissions** — Confirm clients should be able to create/edit invoices, bills, customers, suppliers, categorisations, and bank rules (Xero parity). Default in plan: yes for all except journals/ledger/period-locks.
2. **VAT Returns visibility** — Should clients see VAT Returns tab (review only) or also submit? Default: view-only; submission stays with accountant.
3. **Multi-entity portal users** — For users with several entities, should bookkeeping be per-entity-selected inside the page (current proposal) or hidden entirely if any one entity lacks the service?