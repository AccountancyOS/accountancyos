## Problem

On the accountant onboarding review page (`/onboarding/:id`), the Commercial Snapshot card renders the *annualised* subtotal next to every line — including monthly recurring services. So a £850/month accounts fee shows as £850.00 with no period suffix (it happens to equal the per-month figure only because subtotal is annualised in one place and per-month in another, but more importantly the user can't tell which it is), and one-off items like Self-Assessment show their full pay-now amount but without a clear distinction. The total is also a single annualised number.

The public-facing quote view (`PublicQuoteView.tsx`) already handles this correctly: for `billing_frequency === "monthly"` it divides the stored `subtotal` by 12 and appends `/month`; for non-monthly lines it uses `subtotal` as-is; and the totals row shows a monthly figure and a one-off figure separately.

## Fix

Update `src/pages/OnboardingDetail.tsx` (the Commercial Snapshot block, lines ~417–466) to mirror that pattern:

1. **Per-line amount**
   - If `line.billing_frequency === "monthly"`: show `£<subtotal/12>.00 /month`.
   - Otherwise: show `£<subtotal>.00` (no suffix; this is the pay-now amount).
   - Keep the existing label under the name (Monthly / One Off / Now). Normalise `one_off` → "One Off" and `now` stays "Now".

2. **Total row**
   - Replace the single `Total` line with two:
     - `Monthly total` — sum of `subtotal/12` over monthly lines, suffixed `/month`.
     - `One-off total` — sum of `subtotal` over non-monthly lines.
   - Only render each row when its value is > 0.

3. **No backend changes.** `snapshot.lines[*].subtotal` semantics stay as today (annualised for monthly, full amount for one-off) — we just display them correctly. No change to quote-acceptance, RPCs, or the public onboarding flow.

### Files touched
- `src/pages/OnboardingDetail.tsx` — Commercial Snapshot rendering only.
