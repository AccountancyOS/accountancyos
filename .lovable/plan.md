
# Remove Priority Column + Service-Aware Deadline Colouring

## What Changes

### 1. Remove the Priority column from the Jobs table

Remove the `<TableHead>Priority</TableHead>` header and the corresponding `<TableCell>` that renders a Priority badge. Also reduce the `TableSkeleton` column count from 8 to 7.

### 2. Service-aware "red threshold" for Filing Deadline text

Currently the deadline text turns red (`text-destructive`) whenever overdue or within 7 days. This will be replaced with service-specific thresholds:

| Service Type(s) | Red Threshold |
|----------------|---------------|
| `accounts`, `company_accounts`, `Accounts` (Ltd company accounts) | 30 days |
| `self_assessment`, `SA` (Self Assessment) | 30 days |
| `corporation_tax`, `CT600`, `ct600` (Partnership tax / CT) | 30 days |
| `advisory` used for charity/LLP accounts context | 30 days |
| `vat`, `vat_return`, `VAT` (VAT Return) | 7 days |
| `payroll`, `Payroll` (Payroll) | 7 days |
| `company_sec`, `CS01` (Confirmation Statement) | 7 days |
| `cis` (CGT / CIS) | 7 days |
| Everything else (fallback) | 14 days |

### 3. Updated `formatDeadline` logic

The function signature changes to include `service_type`. The colouring logic becomes:

- **Overdue (days < 0)**: always red, shows "X days overdue"
- **Due today**: always red
- **Within threshold**: amber/warning colour (`text-amber-600`), shows "Due in X days"
- **Outside threshold**: plain date, no colour

This also applies to the JobDetail page header where the same logic is used inline.

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Jobs.tsx` | Remove Priority column + header; update `formatDeadline` to accept `service_type` and use service-specific thresholds; reduce skeleton columns |
| `src/pages/JobDetail.tsx` | Update inline deadline colouring to use the same service-specific threshold instead of hardcoded 7 days |

## Technical Detail

A helper function will be added to `Jobs.tsx` (or could be extracted to a shared util):

```typescript
const getDeadlineThresholdDays = (serviceType: string | null): number => {
  if (!serviceType) return 14;
  const st = serviceType.toLowerCase();
  if (["accounts", "company_accounts", "self_assessment", "corporation_tax", "ct600"].includes(st)) return 30;
  if (["vat", "vat_return", "payroll", "cis", "company_sec"].includes(st)) return 7;
  return 14;
};
```

The `formatDeadline` function becomes:

```typescript
const formatDeadline = (deadline: string | null, days: number | null, serviceType: string | null) => {
  if (!deadline) return "No deadline";
  if (days === null) return formatDate(deadline, "dayMonthYear");
  
  const threshold = getDeadlineThresholdDays(serviceType);
  
  if (days < 0) return <span className="text-destructive font-medium">{Math.abs(days)} days overdue</span>;
  if (days === 0) return <span className="text-destructive font-medium">Due today</span>;
  if (days <= threshold) return <span className="text-amber-600 font-medium">Due in {days} days</span>;
  return formatDate(deadline, "dayMonthYear");
};
```

No database changes required. No migration needed.
