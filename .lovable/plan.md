Fix the "duplicate key value violates unique constraint quotes_organization_id_quote_number_key" error when re-issuing a quote.

## Root Cause
`public.generate_quote_number(org_id)` computes the next number with `COUNT(*) + 1` of this year's quotes. If any quote was deleted (or the count otherwise drifts), the generated number collides with an existing one and the unique constraint `(organization_id, quote_number)` blocks the insert. Re-issuing surfaces this because it forces a fresh insert through that function.

## Fix
Replace `generate_quote_number` with a max-suffix + retry approach:

1. Parse the highest existing `quote_number` for the same org and current 2-digit year prefix (`Q-YY-####`), extract the trailing integer, take `max + 1` (default to 1 when none).
2. Format as `Q-YY-0001`.
3. Wrap the caller-side INSERT path with a small retry: if a unique violation on `(organization_id, quote_number)` is raised, recompute and retry up to 5 times. Implement the retry inside `generate_quote_number` itself by looping until the candidate number does not exist in `public.quotes` for that org/year prefix, so all call sites (create + re-issue) benefit without code changes.

This eliminates count-based drift and protects against concurrent inserts.

## Scope
- One migration replacing `public.generate_quote_number(uuid)`.
- No frontend changes.
- No changes to `reissue_quote` itself; it will pick up the fixed helper automatically.

## Verification
After migration, re-issue the affected quote in the UI and confirm a new draft is created with the next sequential `Q-26-####` number.