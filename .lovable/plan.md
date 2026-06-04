## Fix Quote Total Display

The public proposal view (`src/pages/PublicQuoteView.tsx`) currently shows a single `Total` row that sums every line regardless of billing frequency. When a quote mixes monthly and one-off services, this number is misleading (e.g. £2,175 implies a single payment when it's actually recurring + upfront).

### Change

Replace the single `Total` row in the proposal table footer with up to two rows, derived client-side from `quote.lines`:

- **Due Now (One-off):** sum of `subtotal` where `billing_frequency !== 'monthly'`
- **Monthly Recurring:** sum of `subtotal` where `billing_frequency === 'monthly'`, suffixed with `/month`

Rules:
- Only render rows whose total is > 0 (a pure monthly quote shows only the monthly line; a pure one-off quote shows only Due Now).
- If both exist, show both stacked, with Monthly Recurring as the more prominent/bold line.
- Keep currency formatting via the existing `fmt()` helper.
- No changes to the underlying `quote.total_amount` field, RPC, or accountant-side quote builder — purely a presentation fix in `PublicQuoteView.tsx`.

### Out of scope

- Engagement letter / PDF rendering (separate template)
- Accountant-side quote detail view
- Any change to how `total_amount` is stored or computed in the DB
