## Goal

Surface two highly relevant pieces of information on the client portal dashboard that are currently missing:

1. **Upcoming Filing Deadlines** — e.g. Confirmation Statement, Accounts due, VAT return, Self Assessment return, P11D.
2. **Tax Payments Due** — e.g. Corporation Tax payment, Self Assessment payment on account, VAT payment, PAYE liability.

Both are drawn from the existing `deadlines` table, scoped to the currently selected portal entity (client or company).

## What the user will see

Under the existing 4 KPI tiles on `/portal/dashboard`, two new cards side-by-side:

```text
┌───────────────────────────────┐  ┌───────────────────────────────┐
│ Upcoming Deadlines            │  │ Tax Payments Due              │
│ ───────────────────────────── │  │ ───────────────────────────── │
│ VAT Return     Due in 12 days │  │ Corporation Tax  £4,520  21d  │
│ Confirmation…  Due in 28 days │  │ SA Payment On..  £1,840  64d  │
│ Annual Accts…  Due in 84 days │  │ VAT Payment      £2,310  12d  │
│                               │  │                               │
│ View All Deadlines →          │  │ View All Payments →           │
└───────────────────────────────┘  └───────────────────────────────┘
```

- Each row shows the deadline name, the due date (relative + absolute on hover), and a colour pill: red if ≤ 7 days, amber if ≤ 30 days, neutral otherwise.
- Empty states: "No upcoming deadlines in the next 90 days." / "No tax payments due in the next 90 days."
- Up to 5 rows in each card; a "View All" link routes to `/portal/tasks` (deadlines do not yet have a dedicated portal page — see Open Questions).

## Data sourcing

Both cards query the `deadlines` table directly (it has portal-friendly RLS via the existing `portal_access` scope).

- **Upcoming Deadlines:** `status NOT IN ('completed','filed')`, `due_date BETWEEN today AND today+90`, scoped to current `client_id` OR `company_id`. Sort by `due_date` asc. Exclude rows whose `deadline_type` is a payment (see next).
- **Tax Payments Due:** same filter, but where `payment_date IS NOT NULL` AND `payment_date >= today` AND `payment_date <= today+90`. Show `payment_date` instead of `due_date`. Amount comes from `metadata->>'amount'` when present (CT/SA estimates are stored there today); otherwise the row shows "Amount TBC".

## Technical Details

- Add two hooks in `src/portal/hooks/usePortalData.ts`:
  - `usePortalUpcomingDeadlines()` — returns next 5 non-payment deadlines.
  - `usePortalTaxPayments()` — returns next 5 rows with a `payment_date`.
  - Both filter by `currentEntity` from `PortalEntityContext` (client_id XOR company_id, matching existing pattern).
- New presentational components under `src/portal/components/dashboard/`:
  - `UpcomingDeadlinesCard.tsx`
  - `TaxPaymentsCard.tsx`
  - Both follow the existing Card / Skeleton / empty-state pattern used in `PortalDashboard.tsx` and `PortalEmptyState.tsx`.
- Wire both cards into `PortalDashboard.tsx` in a new `grid grid-cols-1 lg:grid-cols-2 gap-4` row beneath the KPI tiles.
- No schema changes. No new RLS — `deadlines` is already readable by the portal user via existing tenant policies (verified: `client_id` / `company_id` scoping matches `portal_access`).
- No backend or edge-function changes.

## Out of scope

- A dedicated `/portal/deadlines` page (cards link to `/portal/tasks` for now).
- Editing / completing deadlines from the portal.
- Tying tax payments into Stripe / Pay Now flows (display only).
- Reusing `portal_visibility_settings` flags — these two sections are always visible. Adding `show_deadlines` / `show_tax_payments` toggles can come later if the user wants accountant-side control.

## Open Questions

1. Should "View All Deadlines" link to a new `/portal/deadlines` page, or is routing to `/portal/tasks` acceptable for this pass?
2. Should both cards respect the `portal_visibility_settings` toggles (i.e. add `show_deadlines` and `show_tax_payments` flags) so accountants can hide them per client, or always show?
