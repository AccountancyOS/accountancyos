## Goal

When a user clicks "Create Quote" from a CRM lead, the Create Quote dialog should open immediately with that lead pre-selected and a sensible default set of service lines pre-loaded based on the lead's `lead_type`.

## Current state

- `LeadDetailPanel` already navigates with `?create=true&lead_id={id}` (lines 613, 660).
- `Quotes.tsx` ignores those query params — `isCreateDialogOpen` only opens via the page header button, and `CreateQuoteDialog` does not accept `leadId` as a prop.
- `CreateQuoteDialog` starts with a single empty line; lead is chosen from a Select.

## Changes

### 1. `src/pages/Quotes.tsx`
- Read `useSearchParams()` for `create` and `lead_id`.
- In a `useEffect`, when `create=true`, open the dialog and remember the `lead_id`.
- Strip those params from the URL after opening so a refresh doesn't re-open it.
- Pass `initialLeadId` to `CreateQuoteDialog`.

### 2. `src/components/quotes/CreateQuoteDialog.tsx`
- Add optional prop `initialLeadId?: string`.
- Initialise `leadId` state from `initialLeadId`.
- When `initialLeadId` is set, fetch that one lead by id (`leads` table → `id, first_name, last_name, email, lead_type`) so the Select displays the name even before the full leads list resolves. Fall back to the existing list lookup if needed.
- Determine `leadType` from the fetched lead, then on dialog open auto-populate `lines` using the mapping below, matching `services_catalog` rows in the current org by `canonical_service_code` and using each service's `default_price` and a sensible billing frequency.
- If a mapped service code is not present in the org's catalog, silently skip it (no error).
- Only auto-populate when the dialog opens with `initialLeadId` AND `lines` is still the default single empty line — never overwrite user edits.

### 3. Lead type → default services mapping

Single source of truth in a new helper `src/lib/quote-defaults.ts`:

```text
sa_non_mtd       → self_assessment_non_mtd                                     (monthly)
sa_mtd           → self_assessment_mtd_quarterly                               (monthly)
limited_company  → accounts_production_ltd, corporation_tax_return,
                   confirmation_statement                                      (monthly)
llp              → llp_accounts, confirmation_statement                        (monthly)
partnership      → self_assessment_non_mtd (partners' SAs are added later)     (monthly)
charity          → accounts_production_ltd                                     (monthly)
cgt              → capital_gains_tax_return                                    (now)
other            → (no defaults — keep the single empty line)
```

`helper signature: getDefaultServiceCodesForLeadType(leadType): { code: string; billing_frequency: "now" | "monthly" }[]`

### 4. Behaviour details
- Pricing comes from `services_catalog.default_price` for that org (already what the dialog does on service select).
- Dialog title stays the same; lead Select remains editable so the user can swap leads.
- Cancel/close still navigates nowhere (user stays on `/quotes`); they can return to the lead from CRM.

## Out of scope
- No DB migrations.
- No changes to quote acceptance, services_catalog, or the LeadDetailPanel buttons (the existing `?create=true&lead_id=…` URL is already correct).
- Companies/clients (post-conversion) — this only covers the CRM → quote flow for leads.
