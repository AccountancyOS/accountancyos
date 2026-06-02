## Root Causes

1. **Send failure**: `lifecycle_send_quote` inserts `subject = NULL` into `email_queue` whenever a `quote_proposal` template is found. The newly seeded **Quote Proposal** system template now matches, so the previously-unreached `ELSE NULL` branch fires and the `NOT NULL` constraint on `email_queue.subject` trips. The same RPC also never updates `quotes.status='sent'` / `sent_at`.
2. **"Template missing from library"**: The DB row exists and RLS/grants allow it. The page just never refetched after the migration inserted it — `react-query` was caching the pre-seed result under an unchanged key.

## Changes

### A. Database migration — rewrite `lifecycle_send_quote`
Single migration that recreates the function with these corrections:

- Resolve the email subject/body **before** the insert by reading from the chosen template:
  ```sql
  SELECT
    COALESCE(NULLIF(content->>'subject',''), 'Your quote from ' || v_practice_name),
    COALESCE(NULLIF(content->>'htmlBody',''), NULLIF(content->>'body',''),
             '<p>Please find your proposal ' || v_quote.quote_number || ' attached. ...</p>')
    INTO v_subject, v_body_html
  FROM templates WHERE id = v_template_id;
  ```
  Run merge-token substitution server-side so the queue row is fully rendered (and the dispatcher can send it even if the template later changes). Use the same tokens already produced for `merge_data`.
- Always pass non-null `subject` and `body_html` into `email_queue`. Keep `template_id` for traceability.
- After the email insert, `UPDATE quotes SET status='sent', sent_at = now(), valid_until = v_valid_until WHERE id = p_quote_id`.
- Wrap the email/quote mutations in a single transaction (already the case as it's a function) and add a clear `RAISE EXCEPTION` if `email_queue` insert fails so the toast shows a helpful message.
- Drop the stale `chk_email_queue_status` NOT VALID constraint (housekeeping; the live constraint stays).

### B. Template library refresh — `src/pages/Templates.tsx` and `src/pages/settings/EmailTemplates.tsx`
- Lower `staleTime` to `0` and set `refetchOnMount: "always"` on the templates query so a new system template appears the next time the page is opened, without requiring a hard reload.
- Render system templates in a clearly labelled **"System Library"** section above the "Your Templates" section on `/templates` (matches the existing Settings page pattern). This makes the Quote Proposal impossible to miss regardless of search/filter state.
- Add an info banner in the header explaining what System templates are and that "Clone & Customise" creates an org-scoped copy.

### C. Verification (run after migration applies)
1. Re-trigger send on the existing draft quote `871ba038-b434-47f5-bfdc-dc79bba9d406`. Expect:
   - RPC returns `{ status: 'sent', email_queued: true, accept_token: <uuid> }`.
   - `quotes.status='sent'`, `sent_at` set.
   - New `email_queue` row with non-null `subject` and `body_html`, `template_id=…0a01`, `status='pending'`.
   - New `quote_acceptance_tokens` row.
2. Open `/templates` in the app, confirm "Quote Proposal" card renders under "System Library" with the "Clone & Customise" action.

### Files touched
- New migration file (function rewrite + constraint cleanup).
- `src/pages/Templates.tsx` (sectioned render + cache options).
- `src/pages/settings/EmailTemplates.tsx` (cache options only).

No other modules affected. No schema additions, no new RLS, no new grants.
