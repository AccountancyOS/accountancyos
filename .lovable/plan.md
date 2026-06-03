## Problem

The "Error loading application: column quotes.billing_frequency does not exist" appears on the Onboarding detail page. The query in `src/pages/OnboardingDetail.tsx` (line 92) selects `billing_frequency` from the `quotes` table, but that column exists on `quote_lines`, not on `quotes`. Per-line billing frequency is already captured inside `accepted_snapshot.lines`, which the page already reads.

## Fix

Remove the non-existent column from the embedded select:

```ts
quote:quotes(quote_number, sent_at, accepted_at, accepted_snapshot, total_amount)
```

No other code path on this page reads `quote.billing_frequency` — line-level frequency is shown from `lines` (which come from `quote_lines` / `accepted_snapshot`).

## Scope

- One-line change in `src/pages/OnboardingDetail.tsx`.
- No DB migration, no other files affected.
