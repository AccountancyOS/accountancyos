

# Batch 2 Remediation -- Final Cleanup Plan

## Current Status
All 8 Batch 2 items have been partially or fully implemented. However, two issues remain that likely caused the build failure or violate the audit mandate:

## Remaining Issues

### 1. Unused Import in workpaper-from-tb.ts (Cleanup)
Line 8 imports `applyTaxCalculationsToWorkpaper` but the code block that used it was removed. While this won't break the build (noUnusedLocals is false), it's dead code that should be cleaned up.

### 2. Hardcoded Account Codes in UK_WORKPAPER_CATEGORIES (Violation)
`workpaper-from-tb.ts` still contains `accountCodes` references in the workpaper category config:
- `directors_remuneration: accountCodes: ["6000", "6100"]`
- `depreciation: accountCodes: ["7000"]`
- `trade_debtors: accountCodes: ["1100"]`
- `trade_creditors: accountCodes: ["2000"]`
- `share_capital: accountCodes: ["3000"]`
- `retained_earnings: accountCodes: ["3100"]`
- `box1_vat_due_sales: accountCodes: ["2100"]`
- `box4_vat_reclaimed: accountCodes: ["2100"]`

These must be replaced with `accountTypes` + `subtypes` taxonomy mappings, matching the pattern already established in `frs105-accounts-model.ts`.

## Implementation Steps

### Step 1: Remove unused import
Remove line 8 (`import { applyTaxCalculationsToWorkpaper }`) from `workpaper-from-tb.ts`.

### Step 2: Replace hardcoded accountCodes in UK_WORKPAPER_CATEGORIES
Convert all `accountCodes` entries to use `accountTypes` + `subtypes`:

| Category | Current (hardcoded) | New (taxonomy) |
|---|---|---|
| directors_remuneration | `["6000", "6100"]` | `accountTypes: ["EXPENSE"], subtypes: ["DIRECTORS_REMUNERATION", "DIRECTORS_SALARY"]` |
| depreciation | `["7000"]` | `accountTypes: ["EXPENSE"], subtypes: ["DEPRECIATION"]` |
| trade_debtors | `["1100"]` | `accountTypes: ["ASSET"], subtypes: ["TRADE_DEBTORS", "DEBTOR", "RECEIVABLE"]` |
| trade_creditors | `["2000"]` | `accountTypes: ["LIABILITY"], subtypes: ["TRADE_CREDITORS", "CREDITOR", "PAYABLE"]` |
| share_capital | `["3000"]` | `accountTypes: ["EQUITY"], subtypes: ["SHARE_CAPITAL"]` |
| retained_earnings | `["3100"]` | `accountTypes: ["EQUITY"], subtypes: ["RETAINED_EARNINGS", "PROFIT_AND_LOSS"]` |
| box1/box4 VAT | `["2100"]` | `accountTypes: ["LIABILITY"], subtypes: ["VAT_CONTROL", "VAT"]` |

### Step 3: Remove accountCodes matching logic
The `mapTBToWorkpaperLines` function (around line 189) has a branch for `categoryDef.accountCodes`. This branch should be removed since no categories will use it after Step 2.

## Files Changed
- `src/lib/workpaper-from-tb.ts` -- remove unused import, replace all `accountCodes` with taxonomy mappings, remove accountCodes matching branch

## Regression Risks
- **Low**: The taxonomy-based matching is more resilient than code-prefix matching. Any CoA with correct `account_subtype` values will work. CoAs with missing subtypes will show zero (same as before when codes didn't match).
- **Mitigation**: The existing `accountTypes` + `subtypes` matching logic at line 193 already works correctly and is battle-tested for the categories that already use it.

## Technical Details
- No database migrations required
- No new dependencies
- No changes to other files
- Pattern is consistent with `FRS105_TAXONOMY_MAPPINGS` in `frs105-accounts-model.ts`
