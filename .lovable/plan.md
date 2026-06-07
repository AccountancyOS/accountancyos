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

3. **Multi-entity portal users** — For users with several entities, should bookkeeping be per-entity-selected inside the page (current proposal) or hidden entirely if any one entity lacks the service?

---

## Audit: TrueLayer Bank Connection (2026-06-07)

### Findings

The TrueLayer edge functions exist and are largely correct, but the integration is broken in several places that together prevent any client from connecting a bank:

1. **`ConnectBankDialog` is never rendered anywhere.** `BankingTab.tsx` only opens `AddBankAccountDialog` (manual entry). There is no "Connect bank via Open Banking" button in either the accountant or portal UI. This is the single biggest gap.
2. **Hard-coded accountant redirect path.** `ConnectBankDialog` calls `truelayer-auth` without `redirect_path`, so the callback always redirects to `/bookkeeping`. From the portal, the user lands on an accountant route they cannot access (and PortalGuard kicks them out).
3. **Callback `APP_URL` defaults to `https://lovable.dev`.** `truelayer-callback` reads `Deno.env.get('APP_URL')`, and we already have `APP_PUBLIC_URL` configured — they don't match, so the OAuth callback either redirects to lovable.dev or a stale URL.
4. **`truelayer-auth` only checks that the caller is logged in.** It accepts any authenticated user and lets them initiate a bank-connect flow against any `entity_id` they pass. It must additionally verify the caller is either an org member of that entity OR has portal access to it (and, for portal users, that the bookkeeping service is active).
5. **`truelayer-sync` status casing inconsistency.** Insert uses `'ACTIVE'`, sync update uses `'active'`, errors use `'error'`. Causes the "Connected" badge logic in `BankingTab` to flicker. Normalise to upper-case to match insert + UI.
6. **Portal entry point.** `PortalBookkeepingFull` reuses `BankingTab` directly, so wiring the connect button into `BankingTab` is enough — the portal automatically inherits it via the `PortalAppShim` (which already supplies `useOrganization` → org id from `PortalEntityContext`).
7. **RLS sanity check.** `bank_connections` already has a portal-scoped policy (`portal_can_access_bookkeeping`). `truelayer_auth_states` writes happen via service role so RLS does not block them. No schema changes needed for these tables.

### Required Changes

#### 1. UI — render the Connect Bank dialog

**`src/components/bookkeeping/BankingTab.tsx`**
- Import `ConnectBankDialog` and add `connectDialogOpen` state.
- Add a primary "Connect Bank" button next to the existing "Add Manually" button in both the header and the empty state.
- Accept an optional `redirectPath` prop (defaults to `/bookkeeping`) so the portal can pass `/portal/bookkeeping?tab=banking`.
- Render `<ConnectBankDialog … redirectPath={redirectPath} />`.

**`src/components/bookkeeping/ConnectBankDialog.tsx`**
- Accept and forward a `redirectPath` prop on the `truelayer-auth` invoke body.
- Keep using `useOrganization()` (resolves through `PortalAppShim` for portal users).
- On `?connection=success` query param after redirect, fire a toast and invalidate the bank-accounts query.

**`src/portal/pages/PortalBookkeepingFull.tsx`**
- Pass `redirectPath="/portal/bookkeeping?tab=banking"` into `<BankingTab entity={entity} redirectPath=… />`.

#### 2. Edge function — `truelayer-auth`

- Accept `redirect_path` from the body (already does) and pass it through into the `truelayer_auth_states` row (already does).
- Add an authorisation check before inserting state: call a new SECURITY DEFINER RPC `can_initiate_bank_connect(_user uuid, _entity_type text, _entity_id uuid)` that returns `true` when the caller is either an org member of the entity's `organization_id` OR has an active `portal_access` row for it AND `portal_has_bookkeeping(entity_type, entity_id)` returns true. Return 403 if not allowed.

#### 3. Edge function — `truelayer-callback`

- Read both `APP_URL` and `APP_PUBLIC_URL` (prefer `APP_PUBLIC_URL`); fall back to the request's `Origin`/`Referer` only if both are unset.
- Validate `redirect_path` is one of the allowed prefixes (`/bookkeeping`, `/portal/bookkeeping`) before redirecting; default to `/bookkeeping` otherwise.
- Insert `bank_connections.status = 'ACTIVE'` (already correct); add a defensive `upper()` on any later status writes in `truelayer-sync`.

#### 4. Edge function — `truelayer-sync`

- Normalise status writes to upper-case: `'ACTIVE'` on success, `'ERROR'` on failure.
- No behavioural changes otherwise.

#### 5. Migration — `can_initiate_bank_connect` RPC

```sql
create or replace function public.can_initiate_bank_connect(
  _user uuid, _entity_type text, _entity_id uuid
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare _org uuid;
begin
  if _entity_type = 'client' then
    select organization_id into _org from clients where id = _entity_id;
  elsif _entity_type = 'company' then
    select organization_id into _org from companies where id = _entity_id;
  else
    return false;
  end if;
  if _org is null then return false; end if;

  -- accountant path
  if exists (
    select 1 from organization_users
     where user_id = _user and organization_id = _org
  ) then return true; end if;

  -- portal path: must have access AND bookkeeping service active
  if exists (
    select 1 from portal_access pa
     where pa.user_id = _user
       and pa.revoked_at is null
       and ((_entity_type = 'client' and pa.client_id = _entity_id)
         or (_entity_type = 'company' and pa.company_id = _entity_id))
  ) and public.portal_has_bookkeeping(_entity_type, _entity_id) then
    return true;
  end if;
  return false;
end $$;

grant execute on function public.can_initiate_bank_connect(uuid, text, uuid)
  to authenticated, service_role;
```

### Verification

1. Deploy `truelayer-auth`, `truelayer-callback`, `truelayer-sync` and run migration.
2. As accountant: open Bookkeeping → Banking → click "Connect Bank" → TrueLayer sandbox login (`mock-uk` provider) → confirm redirect lands back on `/bookkeeping?connection=success` and a row appears in Banking.
3. As `portal-a`: open `/portal/bookkeeping?tab=banking` → click "Connect Bank" → confirm redirect lands on `/portal/bookkeeping?tab=banking&connection=success` and the new bank account is listed.
4. As `portal-b` (no access): direct-invoke `truelayer-auth` with portal-a's client id → expect 403.
5. Trigger a manual sync from BankingTab; confirm transactions populate and `status` stays `'ACTIVE'`.

### Out of scope

- Switching from TrueLayer sandbox to production (separate env-flag work).
- Bank reconnect/refresh-consent UI beyond the existing flow.
- Hiding the manual "Add Bank Account" path.
