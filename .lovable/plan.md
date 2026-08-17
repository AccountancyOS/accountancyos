# Fix: Emails Tab Crashes With "Cannot read properties of undefined (reading 'icon')"

## What Is Happening

The Emails page crashes for your organisation because two of your queued emails have the status `cancelled`, and the page has no badge definition for that status.

Confirmed against production:
- `email_queue` currently holds `sent` (12), `cancelled` (2), `pending` (1).
- The page loads every non-`sent` row, so the two `cancelled` rows are rendered.
- `src/pages/Emails.tsx` looks up `statusConfig[status]`, which only defines `draft`, `queued`, `pending`, `failed`, `ignored`. For `cancelled` the lookup returns `undefined`, and the next line reads `.icon` off it — the exact error in the screenshot.

The page's own status vocabulary has drifted from the database. Per `docs/email-system.md`, the valid `email_queue` statuses are `pending`, `sent`, `failed`, `cancelled` — `draft`, `queued` and `ignored` are not real queue statuses.

## The Fix

1. Align the status vocabulary in `src/pages/Emails.tsx` with the database check constraint: add `cancelled` (and keep the legacy labels so historic rows still render), so every status the queue can hold has a label, badge variant and icon.
2. Make the lookup fail-safe: fall back to a neutral badge showing the raw status instead of crashing when an unknown status appears. A vocabulary drift should never take the whole page down.
3. Apply the same fallback to the tab-count derivation so an unknown status is counted under "All" rather than silently dropped.
4. Show a "Cancelled" filter tab so cancelled emails are visible and explainable rather than mixed into "All" with no way to isolate them.

## Technical Notes

- Files touched: `src/pages/Emails.tsx` (status config + safe lookup + tab), `src/lib/email-counts-model.ts` (add `cancelled` to the derived counts).
- No database, RLS or migration changes — the data is valid; the UI is wrong.
- Regression coverage: extend `src/test/regression/email-counts-model.test.ts` and add a small guard asserting every status in the live `email_queue_status_check` constraint set has an entry in the page's status config, so this drift cannot recur silently.
