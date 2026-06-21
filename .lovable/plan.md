## Root cause

The June 17 rewrite of `lifecycle_send_quote` (migration `20260617111847…`) renamed the merge-data keys it builds:

| Old key (still used by templates & editor) | New key produced by RPC |
|---|---|
| `accept_link` | `accept_url` |
| `quote_lines_table` | `lines_html` |
| `quote_total_now` | `total_now` |
| `quote_total_monthly` | `total_monthly` |
| `quote_total` | `total_amount` |

The Quote Proposal template body (and the merge-field picker in `EmailTemplateEditor.tsx`) still emit the old `{{quote_lines_table}}`, `{{accept_link}}`, `{{quote_total_now}}`, `{{quote_total_monthly}}` tags. The RPC's `replace()` loop finds no matching keys, so the tags are sent verbatim — exactly what you see in the received email.

## Fix

Add a new migration that re-creates `lifecycle_send_quote` with both the new keys **and** legacy aliases in the merge object, so both old and new templates resolve cleanly:

```
accept_url        + accept_link           (= same URL)
lines_html        + quote_lines_table     (= same HTML table)
total_now         + quote_total_now       (formatted with thousands sep, 2dp)
total_monthly     + quote_total_monthly   (formatted)
total_amount      + quote_total           (formatted)
```

Also format the numeric values with `to_char(..., 'FM999,999,990.00')` so the email shows `1,250.00` instead of `1250.00`, matching the earlier behaviour from `20260603105258`.

No template content changes, no UI changes — the EmailTemplateEditor merge-field chips already reference the legacy names so they keep working.

## Technical details

1. **New migration** `supabase/migrations/<ts>_quote_send_merge_keys_compat.sql`
   - `CREATE OR REPLACE FUNCTION public.lifecycle_send_quote(p_quote_id uuid) …`
   - Body identical to the current `20260617111847` version except:
     - Build `v_merge` with both new + legacy keys listed above.
     - Format `total_now`, `total_monthly`, `total_amount` (and their legacy aliases) via `to_char(..., 'FM999,999,990.00')`.
     - Inline `to_char` for `v_unit_display` / `v_subtotal_display` in the line-item HTML, so the table shows `GBP 1,250.00` not `GBP 1250.00`.
   - No schema changes, no grant changes, no template-row updates.

2. **No changes** to:
   - `EmailTemplateEditor.tsx` (already uses the legacy names).
   - The Quote Proposal template row in `public.templates`.
   - `QuoteDetail.tsx` send flow.

## Verification

After the migration:
- Re-send the Q-26-0009 quote from Blue Tick.
- Confirm the queued `email_queue` row's `body_html` contains the rendered services table, the `GBP` amounts, and a real `/q/<token>` accept URL (no `{{…}}` left).
