

# Simplify VAT Code Dropdowns

## Overview

Add an `is_common` flag to `vat_codes` and update all 7 bookkeeping components that render VAT code dropdowns to show only 5 common codes by default, with a "Show all codes" toggle. Also create a shared `getVatCodeLabel()` utility for friendlier display names.

## 1. Database Migration

Add `is_common BOOLEAN NOT NULL DEFAULT false` to `vat_codes`, then set `true` for the 5 core codes:

| Code | Friendly Label |
|------|---------------|
| T1 | 20% Sales |
| T20 | 20% Purchases |
| T0 | Zero Rated |
| T9 | Exempt |
| OS | No VAT |

All other codes (RC, EC, NB, etc.) remain `is_common = false`.

## 2. Shared Utility

Create `src/lib/vat-code-utils.ts` with:

- `getVatCodeLabel(code, rate, description)` -- returns friendly labels for common codes, falls back to `CODE - description (rate%)` for advanced codes
- Centralised in one place so all 7 components use the same logic

## 3. Component Updates (7 files)

Each file gets the same pattern:

- Add `is_common` to the VAT codes query `.select(...)` (where not already using `*`)
- Add `showAllVatCodes` local state (default `false`)
- Compute `filteredVatCodes` via `useMemo` -- common-only or all
- For selected-value robustness: if the currently selected VAT code is non-common, prepend it into the filtered options so it still displays correctly
- Add a small toggle link below the Select: "Show all codes" / "Show common only"
- Use `getVatCodeLabel()` for dropdown option text

### Files and their VAT dropdown locations

| File | Dropdown Context | Current Label Format |
|------|-----------------|---------------------|
| `InvoiceEditorDialog.tsx` | Per-line VAT in table (line 541-563) | `{vat.code}` only |
| `CreditNoteEditorDialog.tsx` | Per-line VAT in table (line 487-501) | `{v.code} ({v.rate}%)` |
| `BillEditorDialog.tsx` | Per-line VAT in table (line 402-418) | `{vat.code}` only |
| `SupplierEditorDialog.tsx` | Default VAT Code field (line 236-252) | `{vat.code} - {vat.description} ({vat.rate}%)` |
| `CustomerEditorDialog.tsx` | Default VAT Code field (line 275-289) | `{vat.code} - {vat.description} ({vat.rate}%)` |
| `CategorizeBankTransactionDialog.tsx` | Single VAT selector (line 195-210) | `{code.code} - {code.description}` |
| `RuleActionBuilder.tsx` | VAT code action value (line 144-155) | `{v.code} - {v.description} ({v.rate}%)` |

### RuleTestRunDialog.tsx -- No Change Needed

This file only uses VAT codes for display formatting in test results (resolving IDs to labels), not as a user-facing dropdown for selection. No filtering needed.

## 4. Toggle UX

The toggle will be a small text link styled with `text-xs text-muted-foreground hover:underline cursor-pointer`, placed directly below the Select component. For per-line table contexts (Invoice, Credit Note, Bill), a single toggle above the table controls all line VAT dropdowns.

## 5. Selected-Value Robustness

If an existing record has a non-common VAT code (e.g. RC_DOMESTIC), it must still display correctly even when "Show common only" is active. The filter applies to the options list only. If the selected value is not in the filtered list, it is prepended (deduplicated).

## Technical Details

### Migration SQL
```sql
ALTER TABLE vat_codes ADD COLUMN IF NOT EXISTS is_common BOOLEAN NOT NULL DEFAULT false;
UPDATE vat_codes SET is_common = true WHERE code IN ('T1', 'T20', 'T0', 'T9', 'OS');
```

### New File
| File | Purpose |
|------|---------|
| `src/lib/vat-code-utils.ts` | `getVatCodeLabel()` helper |

### Modified Files
| File | Change |
|------|--------|
| `InvoiceEditorDialog.tsx` | Add toggle state, filter VAT options, use friendly labels, single toggle above lines table |
| `CreditNoteEditorDialog.tsx` | Same pattern |
| `BillEditorDialog.tsx` | Same pattern |
| `SupplierEditorDialog.tsx` | Add toggle state, filter options, prepend selected if missing |
| `CustomerEditorDialog.tsx` | Same pattern |
| `CategorizeBankTransactionDialog.tsx` | Same pattern (single select) |
| `RuleActionBuilder.tsx` | Same pattern (per-action VAT select) |

### Query Updates
Files currently selecting specific columns (not `*`) need `is_common` added:
- `CreditNoteEditorDialog.tsx`: add `is_common` to `.select("id, code, description, rate")`
- `BillEditorDialog.tsx`: same
- `SupplierEditorDialog.tsx`: same
- `CustomerEditorDialog.tsx`: same
- `RuleActionBuilder.tsx`: same
- `RuleTestRunDialog.tsx`: no change (display-only)

Files using `.select("*")` already get `is_common` automatically:
- `InvoiceEditorDialog.tsx`
- `CategorizeBankTransactionDialog.tsx`

