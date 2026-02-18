
# Phase 8 Completion: Wiring + TBImportButton

## Remaining Tasks

### 1. Wire FRS105AccountsEditor into FilingDetail.tsx

Add an `ACCOUNTS_FRS105` branch (and legacy `accounts_frs105`) after the Partnership editor block (line ~363), following the same pattern as SA and Partnership editors:
- Import `FRS105AccountsEditor` and `AccountsDraftScheduleData`
- Render it when `filing.filing_type` matches, passing `draft_schedule_data_json`, `onSave`, `readonly`, `filingId`, and `organizationId`

### 2. Replace Amber Placeholder in JobFilingTab.tsx

Replace the "Accounts Filing Pending -- iXBRL generation (Phase 2)" amber notice (lines 397-410) with a button that navigates to the filing detail page where the full FRS105 editor lives. The button text will be "Open Accounts Editor" and will use `navigate(/filings/${filing.id})`.

### 3. Create TBImportButton Component

New file: `src/components/filings/accounts/TBImportButton.tsx`

Override-aware TB import button that:
- Pulls TB data via `mapTBToAccountsModel()` from `accounts-model-mapper.ts`
- Shows a confirmation dialog listing lines currently marked as `manual_override`
- User must explicitly select which overridden lines to replace
- Non-overridden lines are updated silently
- Updates the balance sheet via the parent `onChange` callback

## Technical Details

### Files Modified
| File | Change |
|------|--------|
| `src/pages/FilingDetail.tsx` | Add import for `FRS105AccountsEditor` + `AccountsDraftScheduleData`, add rendering branch after line 363 |
| `src/components/jobs/JobFilingTab.tsx` | Replace amber placeholder (lines 397-410) with "Open Accounts Editor" navigation button |

### Files Created
| File | Purpose |
|------|--------|
| `src/components/filings/accounts/TBImportButton.tsx` | Override-aware TB import with selection dialog for manual_override lines |
