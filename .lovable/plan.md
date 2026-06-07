# Phase 1 — Client-Facing Bookkeeping Audit

Per your decisions: **audit only**, then a follow-up build plan. Permissions will extend `portal_visibility_settings`; categorisation will be review-first; QA will seed new fixtures under Greenfield & Co. Those choices are locked in for the follow-up build plan but **no code changes happen in this phase**.

## Deliverable

A single audit report saved to `.lovable/bookkeeping-portal-audit.md` (and surfaced in chat) with three sections, a prioritised gap list, and a recommended build sequence. No migrations, no UI changes.

## What I will inspect

### A. Accountant-side bookkeeping — feature inventory
For each area below I will rate it **Fully built / Partial / UI only / Backend only / Missing** with evidence (file paths, table names, RPCs, edge functions):

- Bank accounts, bank feed (TrueLayer), sync, reconnect
- Transactions list, categorisation, bank rules, matching
- Sales invoices, customers, credit notes, payments
- Bills, suppliers, bill payments, receipts
- Chart of accounts, manual journals, TB snapshots, period locks
- VAT registrations, periods, returns, adjustments, MTD submission
- Reports (P&L, BS, aged debtors/creditors, GL, VAT summary)
- Fixed assets, capital allowances
- Workpaper + filing linkage from bookkeeping data

### B. Client-side bookkeeping — current state
- Routes and pages under `src/portal/` touching bookkeeping
- What `PortalBookkeeping` → `PortalBookkeepingFull` currently exposes (today: full accountant tabs including Chart of Accounts, Journals, Bank Rules — likely too much for a client)
- Which tabs gate by service vs entity type vs hardcoded
- Whether write actions inside reused accountant components are visually/functionally restricted
- Entity switcher behaviour for multi-entity portal users
- Queries / receipt-upload / accountant-review surfaces from the brief — which exist, which don't

### C. Security & RLS audit
For every bookkeeping-touching table (bank_*, bookkeeping_accounts, journals, ledger_entries, invoices/invoice_lines/invoice_payments, bills/bill_lines/bill_payments, customers, suppliers, receipts, credit_notes(+lines/allocations), vat_*, fixed_assets, capital_allowance_*, reconciliations, period_locks, tb_account_mappings, trial_balance_snapshots, categorization_rules, bank_rules, fx_rates):

- RLS enabled
- Portal SELECT policy correctly scoped via `portal_can_access_bookkeeping` (or equivalent) and entity_id match
- Portal INSERT/UPDATE/DELETE policies match the brief's accountant-led model (read-only where they must be, write only where the brief permits)
- No client can read/write another tenant's rows
- No client can mutate accountant-only data (period locks, snapshots, VAT submissions, approvals, mappings)
- GRANTs present on each public table for the roles policies allow
- RPC surface (`portal_*`, `post_to_ledger`, etc.) — caller checks and security-definer hygiene

I will run the Supabase linter and `supabase--read_query` against `pg_policies` to enumerate every policy on the tables above rather than relying on file grep.

### D. Permissions model gap analysis
Map every permission listed in the brief (Phase 13) to:
- Existing column on `portal_visibility_settings`, OR
- Existing service flag, OR
- **Gap** → needs to be added in the build phase

Output is the exact column-addition list for the future migration.

### E. UX gap vs the brief
For each portal surface the brief requires (Overview action cards, Transactions with explain workflow, Receipts hub, Sales Invoices with inline customer create, Bills, VAT client view + approval, Reports with permission tiers, Queries inbox), state: **Exists / Partial / Missing**, and which existing accountant component could be reused vs needs a portal-specific build.

## Report structure

```text
.lovable/bookkeeping-portal-audit.md
  1. Executive summary (one page)
  2. Accountant-side inventory table
  3. Portal-side inventory table
  4. RLS matrix (table × role × verb × policy name × verdict)
  5. Permissions gap list (brief permission → current source → action)
  6. UX gap list (brief surface → status → reuse plan)
  7. Security risks found (ranked: critical / high / medium / low)
  8. Architectural concerns
  9. Recommended build sequence with effort sizing (S/M/L)
 10. Out of scope for the build phase
```

## What I will NOT do in this phase

- No migrations, no RLS changes, no new tables, no new RPCs
- No UI changes, no nav changes, no component refactors
- No seeded test clients (those land with the build phase)
- No edge function edits

## Technical notes

- Tools used: `code--view`, `code--exec` (rg), `supabase--read_query` on `pg_policies` / `information_schema`, `supabase--linter`. All read-only.
- Existing TrueLayer audit (saved in `.lovable/plan.md`) will be referenced but not re-executed.
- Existing facts already known: `portal_has_bookkeeping` + `portal_can_access_bookkeeping` RPCs exist (migration `20260605122942`); `PortalBookkeepingFull` reuses accountant tabs verbatim via `PortalAppShim`; sidebar gates on `useAnyPortalBookkeepingAccess`; `DeactivateBookkeepingDialog` warns on service-off with data retention. These will be validated rather than re-discovered.

## Next step after you approve

I switch to build mode, produce `.lovable/bookkeeping-portal-audit.md`, then return with a sequenced build plan based on the findings (starting with permissions + portal nav gating + Transactions explain workflow + Receipts + Queries, as agreed).
