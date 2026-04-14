

# Unified Client List — Replace Tabs with Single Filterable View

## Current State
The Clients page uses a tabbed layout splitting individuals (from `clients` table) and companies (from `companies` table) into separate views, each with their own type filter chips. This forces users to switch tabs to see their full client base.

## Target State
A single unified client list showing all clients and companies together, with a single row of filter chips covering all 8 client types. The "Portal Links" tab remains as a separate view.

## Design

### Unified data model
Both `clients` rows and `companies` rows will be merged into a single array of uniform display objects:

```text
{ id, name, type (ClientType), email, phone, location, kind: 'individual' | 'company', companyNumber? }
```

Clicking a row navigates to `/clients/{id}` or `/companies/{id}` based on `kind`.

### Filter chips
Replace the dual-mode `ClientTypeFilters` with a single set showing all 8 types. The `mode` prop is removed. Counts are computed across the merged dataset.

### Table columns
A single table with columns: Name, Type, Email, Phone, Location. An icon (User / Building2) in the Name column differentiates individuals from companies. Company number shown inline or via tooltip where present.

### Layout
- Remove the Individuals/Companies tabs
- Keep Portal Links as a secondary tab or link, but the primary view is the unified list
- Search filters across the entire merged list

## Files to Change

1. **`src/pages/Clients.tsx`** — merge clients + companies into a single unified list, single type filter, single table. Keep Portal Links tab.

2. **`src/components/clients/ClientTypeFilters.tsx`** — remove `mode` prop, show all `CLIENT_TYPES` instead of splitting by individual/company.

No database changes. No new dependencies.

