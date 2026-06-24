## Problem

On the public proposal page (`/q/:token`), monthly line items display the stored **annual** unit price and subtotal instead of the monthly amount. The internal accountant view (`QuoteDetail.tsx`) already divides monthly figures by 12 for display — the public view does not, so a £600/year line shows as £600/month.

The RPC `public_get_quote_by_token` returns `unit_price` and `subtotal` exactly as stored in `quote_lines` (annualised when `billing_frequency = 'monthly'`). The conversion is a presentation concern on the client.

## Fix

Update `src/pages/PublicQuoteView.tsx` only. No RPC, schema, or business logic changes.

1. When rendering each line row, if `billing_frequency === "monthly"`:
   - Show `unit_price / 12` and append `/month` to both the unit price and line total cells.
   - Show line total as `subtotal / 12` per month.
2. Update the **Monthly Recurring** tfoot total to sum `subtotal / 12` across monthly lines (currently it sums the raw annual subtotals).
3. **Due Now** total stays unchanged (it already only sums non-monthly lines).
4. Keep all existing guards (`Number(... || 0)`, `fmt` fallback, `Array.isArray(lines)`).

## Technical notes

- Mirrors the divide-by-12 pattern already used in `src/pages/QuoteDetail.tsx` (lines ~283–325) so the lead sees the same monthly figures the accountant sees internally.
- Frequency label logic unchanged; only the numeric formatting changes.
- No memory updates required — this is a presentation bug fix, not a new rule.
