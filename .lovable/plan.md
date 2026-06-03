Remove the machine-readable service code (e.g. `company_accounts`) from the Services list on the Quote Detail page so accountants/clients only see the human-readable name.

## Change
- `src/pages/QuoteDetail.tsx` line 305: drop the `{line.service.code} • ` prefix so the line reads `{quantity} × £{displayPrice}` only.

## Scope check
- `Services.tsx` admin table intentionally shows the code in its own column — leave it.
- `FeeAggregationPanel.tsx` uses `service.code` only as a React key, not rendered.
- `EngagementLetterVariants.tsx` already runs the code through `formatServiceType()` for a human label.
- No other component renders raw service codes to end users.

Single one-line frontend edit.