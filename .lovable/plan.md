

# Add Client Type Filters to Clients Page

## Problem Summary

The Clients page currently only shows two broad categories: "Individuals" and "Companies". However, the system supports 8 distinct client types with different tax and compliance requirements. Users need to filter by specific client types to manage their workload effectively.

**Current:** Only Individuals / Companies tabs
**Required:** Filter chips for all 8 client types defined in the system

---

## Solution Overview

Add a row of filter chips below the search bar that allows filtering by specific client type. The filters will be context-aware, showing individual-based types when on the Individuals tab and company-based types when on the Companies tab.

---

## UI Design

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Clients                                              [Link] [+ Add]    │
│  Manage your client relationships                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  [🔍 Search clients and companies...     ]                              │
│                                                                         │
│  [Individuals (12)] [Companies (8)] [Portal Links]    ← Existing tabs   │
│                                                                         │
│  Type: [All] [SA Non-MTD (4)] [SA MTD (3)] [Partnership (2)]            │
│        [CGT (2)] [Other (1)]                          ← NEW filters     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Name          │ Type           │ Email        │ Phone  │ City   │   │
│  ├───────────────┼────────────────┼──────────────┼────────┼────────┤   │
│  │ John Smith    │ SA (MTD)       │ j@email.com  │ 07...  │ London │   │
│  │ Mary Jones    │ Partnership    │ m@email.com  │ 07...  │ Leeds  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

When on the **Companies** tab:

```text
│  Type: [All] [Limited Company (5)] [LLP (2)] [Charity (1)]              │
```

---

## Technical Implementation

### File 1: `src/components/clients/ClientTypeFilters.tsx` (NEW)

Create a reusable filter component similar to `JobsQuickFilters`:

| Prop | Type | Description |
|------|------|-------------|
| `activeType` | `ClientType \| null` | Currently selected type filter |
| `onTypeChange` | `(type: ClientType \| null) => void` | Filter change handler |
| `typeCounts` | `Record<string, number>` | Count of clients per type |
| `mode` | `'individual' \| 'company'` | Which type set to show |

The component will:
- Show "All" button plus type-specific buttons
- Display counts in badges
- Use `INDIVIDUAL_BASED_TYPES` or `COMPANY_BASED_TYPES` based on mode
- Use `CLIENT_TYPE_LABELS` for display names

### File 2: `src/pages/Clients.tsx`

**Changes:**

1. Add state for type filter:
   ```typescript
   const [typeFilter, setTypeFilter] = useState<ClientType | null>(null);
   ```

2. Add a "Type" column to both tables showing the client/company type

3. Compute type counts from the data:
   ```typescript
   const individualTypeCounts = useMemo(() => {
     const counts: Record<string, number> = {};
     clients?.forEach(c => {
       counts[c.client_type] = (counts[c.client_type] || 0) + 1;
     });
     return counts;
   }, [clients]);
   ```

4. Filter data by selected type:
   ```typescript
   const filteredClients = clients?.filter((client) => {
     const matchesSearch = `${client.first_name} ${client.last_name} ${client.email}`
       .toLowerCase()
       .includes(searchTerm.toLowerCase());
     const matchesType = !typeFilter || client.client_type === typeFilter;
     return matchesSearch && matchesType;
   });
   ```

5. Add `ClientTypeFilters` component below search input

6. Reset type filter when switching tabs

7. Add Type column to tables using `CLIENT_TYPE_LABELS` for display

### File 3: Companies Table Enhancement

For the Companies tab, we need to handle the `company_type` field:
- Map existing company_type values to our defined types
- If no `company_type`, default to "Limited Company"
- Show LLP and Charity as separate filter options

---

## Data Flow

```text
┌──────────────────────────────────────────────────────────────────────┐
│ User selects filter chip (e.g., "SA MTD")                            │
│     ↓                                                                │
│ setTypeFilter('sa_mtd')                                              │
│     ↓                                                                │
│ filteredClients recalculates with type filter applied                │
│     ↓                                                                │
│ Table re-renders showing only SA MTD clients                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Files Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/components/clients/ClientTypeFilters.tsx` | Create | New filter chip component |
| `src/pages/Clients.tsx` | Modify | Add filter state, type column, integrate filter component |

---

## Additional Enhancements

1. **Type column in table** - Shows the specific client type (e.g., "SA (MTD)", "Partnership")
2. **Count badges** - Each filter chip shows how many clients of that type exist
3. **Tab-aware filtering** - Filters change based on whether Individuals or Companies tab is active
4. **Clear on tab switch** - Reset type filter when switching between tabs

