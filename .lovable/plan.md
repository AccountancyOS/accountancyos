## Quote Actions: Remove Manual Accept, Add Delete

### Changes in `src/pages/QuoteDetail.tsx`

1. **Remove the "Mark as Accepted" button** and the `acceptQuoteMutation` (and the `lifecycle_accept_quote` RPC call). Acceptance will only happen when the lead accepts via the portal-side flow (existing `lifecycle_accept_quote` RPC remains available for that path — not invoked from the accountant UI).

2. **Keep "Mark as Rejected"** for `sent` quotes (unchanged).

3. **Add a "Delete Quote" button** available on the detail page for any status. Behaviour:
   - Confirmation via `AlertDialog` ("This will permanently delete the quote and its line items.")
   - Deletes `quote_lines` then `quotes` row (line items first to satisfy FK), scoped by `id`.
   - On success: toast "Quote deleted", invalidate `["quotes"]`, navigate back to `/quotes`.
   - Disabled if `quote.status === "accepted"` (deleting an accepted quote would orphan a linked onboarding application) — show tooltip "Accepted quotes cannot be deleted".

4. Drop the unused `CheckCircle` import.

### Files touched
- `src/pages/QuoteDetail.tsx` (only)

No DB migration, no edge function changes, no list-view changes (Quotes.tsx has no accept action).