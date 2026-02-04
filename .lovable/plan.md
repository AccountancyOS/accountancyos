

# Plan: Code Refactoring for Efficiency

## Overview

This plan identifies refactoring opportunities to improve code efficiency, reduce duplication, and improve maintainability across the AccountancyOS codebase. All changes are designed to be **non-breaking** and maintain full backward compatibility.

---

## Summary of Findings

After analyzing the codebase, I've identified the following categories of improvements:

| Category | Issue | Impact |
|----------|-------|--------|
| Duplicate Utilities | Local `formatCurrency` functions in multiple components | Medium |
| Pattern Consolidation | Similar service patterns (invoices/bills) with repeated code | Medium |
| Query Key Usage | queryKeys registry exists but not used consistently | Low |
| Type Mapping | Company type mismatch (`ltd` vs `limited_company`) | Low |
| Permission Service Duplication | Repeated auth.getUser() calls in permission checks | Low |
| Edge Function Patterns | Consistent patterns already in place - good | N/A |

**Overall Assessment**: The codebase is already well-structured with good patterns in place. The refactoring focuses on consolidating utilities, eliminating local duplicates, and standardizing existing patterns.

---

## Phase 1: Consolidate Formatting Utilities

### Problem
The `formatCurrency` function is defined locally in multiple components instead of using the centralized version in `src/lib/bookkeeping-utils.ts`.

**Files with local duplicates:**
- `src/components/bookkeeping/ReceiptsTab.tsx` (lines 235-238)
- Several other bookkeeping components

### Solution
1. Remove local `formatCurrency` definitions
2. Import from `@/lib/bookkeeping-utils` consistently
3. Enhance the central utility to handle edge cases (null, undefined)

### Files to Modify
| File | Change |
|------|--------|
| `src/lib/bookkeeping-utils.ts` | Ensure handles null/undefined gracefully |
| `src/components/bookkeeping/ReceiptsTab.tsx` | Remove local function, import centralized |
| ~5 other bookkeeping components | Same pattern |

---

## Phase 2: Standardize Date Formatting

### Problem
Date formatting uses `date-fns` `format()` directly with varying format strings across components.

### Solution
Create a centralized date formatting utility in `src/lib/format-utils.ts`:

```typescript
// New file: src/lib/format-utils.ts
import { format, formatDistanceToNow } from "date-fns";

export const DATE_FORMATS = {
  short: "dd/MM/yyyy",
  long: "dd MMMM yyyy",
  iso: "yyyy-MM-dd",
  datetime: "dd/MM/yyyy HH:mm",
} as const;

export function formatDate(
  date: string | Date | null | undefined, 
  formatType: keyof typeof DATE_FORMATS = "short"
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, DATE_FORMATS[formatType]);
}

export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

// Re-export formatCurrency for convenience
export { formatCurrency } from "./bookkeeping-utils";
```

### Files to Modify
| File | Change |
|------|--------|
| `src/lib/format-utils.ts` | Create new centralized formatting module |
| Components using date formatting | Gradual migration to use centralized utility |

---

## Phase 3: Query Keys Consistency

### Problem
The `src/lib/queryKeys.ts` registry exists and is well-designed, but some pages define query keys inline instead of using the registry.

### Solution
Audit and update pages to use the centralized query keys:

```typescript
// Before (in Jobs.tsx)
queryKey: ["jobs", organization?.id, filters],

// After
import { queryKeys } from "@/lib/queryKeys";
queryKey: queryKeys.jobs(organization?.id, filters),
```

### Files to Update
- `src/pages/Jobs.tsx`
- `src/pages/Clients.tsx`
- `src/pages/Filings.tsx`
- ~10 other page files

**Note**: This is a gradual migration - no functionality change, just consistency.

---

## Phase 4: Permission Service Optimization

### Problem
Each permission check function in `src/lib/permission-service.ts` calls `supabase.auth.getUser()` independently, causing repeated API calls when checking multiple permissions.

### Current Pattern (repeated 8 times):
```typescript
export async function checkCanModifyJobs(orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("can_modify_jobs", {...});
  return data === true;
}
```

### Solution
Create a batched permission check or cache the user:

```typescript
// Optimized pattern
export async function checkPermissions(
  orgId: string, 
  permissions: string[]
): Promise<Record<string, boolean>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Object.fromEntries(permissions.map(p => [p, false]));
  
  const results: Record<string, boolean> = {};
  await Promise.all(
    permissions.map(async (perm) => {
      const { data } = await supabase.rpc(`can_${perm}`, {
        _user_id: user.id,
        _org_id: orgId,
      });
      results[perm] = data === true;
    })
  );
  return results;
}
```

### Files to Modify
| File | Change |
|------|--------|
| `src/lib/permission-service.ts` | Add batched check function, maintain backward compat |

---

## Phase 5: Company Type Normalization

### Problem
Database contains `ltd` but code expects `limited_company`, causing display issues.

### Solution
Add a mapping utility in `src/lib/client-types.ts`:

```typescript
// Add to client-types.ts
const DB_TYPE_MAP: Record<string, ClientType> = {
  ltd: "limited_company",
  limited_company: "limited_company",
  llp: "llp",
  charity: "charity",
};

export function normalizeClientType(dbType: string | null): ClientType {
  if (!dbType) return "other";
  return DB_TYPE_MAP[dbType.toLowerCase()] || (dbType as ClientType);
}

export function getClientTypeLabel(type: string | null): string {
  const normalized = normalizeClientType(type);
  return CLIENT_TYPE_LABELS[normalized] || type || "Other";
}
```

### Files to Modify
| File | Change |
|------|--------|
| `src/lib/client-types.ts` | Add normalization function |
| `src/pages/Clients.tsx` | Use centralized `getClientTypeLabel` |

---

## Phase 6: Component Loading States

### Problem
Loading states are handled inconsistently across pages - some use skeleton components, some use simple text.

### Solution
Standardize on the existing skeleton components:
- `TableSkeleton` for tables
- `StatsSkeleton` for stats cards
- `CardSkeleton` for cards

### Files to Update
| File | Current | Change to |
|------|---------|-----------|
| `src/pages/Clients.tsx` | Text "Loading..." | `<TableSkeleton columns={5} />` |
| Various other pages | Mixed patterns | Consistent skeleton usage |

---

## Phase 7: Remove Unused Imports

### Problem
Some files have unused imports that increase bundle size marginally.

### Solution
Run through files and remove unused imports during the refactoring process.

---

## Implementation Order

To minimize risk, implement in this order:

1. **Phase 5** (Type normalization) - Fixes existing bug
2. **Phase 1** (Format utilities) - Low risk, high impact
3. **Phase 2** (Date formatting) - New file, no breaking changes
4. **Phase 3** (Query keys) - Gradual, file-by-file
5. **Phase 6** (Loading states) - Visual consistency
6. **Phase 4** (Permission optimization) - Performance improvement
7. **Phase 7** (Cleanup) - Final polish

---

## What's Already Well-Structured

The codebase has several excellent patterns already in place:

- **Edge Functions**: Consistent use of shared modules (`_shared/auth.ts`, `_shared/responses.ts`, etc.)
- **Validation Schemas**: Centralized in `src/lib/validation-schemas.ts`
- **Query Keys Registry**: Well-designed in `src/lib/queryKeys.ts`
- **Permission System**: Clear separation between client-side hooks and server-side RPCs
- **Context Pattern**: Unified `AppContext` with backward-compatible `useOrganization` wrapper
- **Safe Service Pattern**: Consistent `*-safe-service.ts` pattern for RPC wrappers
- **UI Components**: Well-organized shadcn/ui components with custom skeletons

---

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Duplicate utility functions | ~10 | 0 |
| Files with inline query keys | ~25 | 0 |
| Inconsistent loading states | ~15 pages | 0 |
| Company type display bugs | Yes | No |

---

## Risk Mitigation

1. **No breaking changes**: All refactoring maintains existing function signatures
2. **Backward compatibility**: Old patterns continue to work during migration
3. **Incremental deployment**: Changes can be deployed file-by-file
4. **Type safety**: TypeScript will catch any regressions

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/format-utils.ts` | Centralized formatting utilities |

## Files to Modify

| File | Change Summary |
|------|----------------|
| `src/lib/client-types.ts` | Add normalization functions |
| `src/lib/bookkeeping-utils.ts` | Ensure null handling |
| `src/lib/permission-service.ts` | Add batched check |
| `src/pages/Clients.tsx` | Use centralized utilities, skeletons |
| `src/components/bookkeeping/ReceiptsTab.tsx` | Remove local formatCurrency |
| ~15-20 other files | Standardize patterns |

---

## Summary

This refactoring focuses on **consolidation over creation** - leveraging existing well-designed patterns and eliminating scattered duplicates. The codebase is already well-architected; these changes bring consistency and eliminate redundancy without introducing new complexity.

