## Root Causes

**1. Companies House lookup error**
`src/lib/companies-house-lookup.ts` invokes the `companies-house-sync` edge function with `{ action: "search" | "profile", … }`. The edge function ignores `action` entirely and only handles the internal sync flow (`{ companyId, organizationId }`), so every lookup returns **400 "companyId and organizationId are required"** and the dialog shows an error.

**2. Quote send failure**
`QuoteDetail` calls the `lifecycle_send_quote` RPC, which enqueues the email into `email_queue` with `mailbox_id = NULL`. The `process-email-queue` dispatcher then falls back to Postmark, and the edge logs show every send returning **"Request does not contain a valid Server token"** (no `POSTMARK_API_KEY` is configured, and we don't want one — the practice has just connected their own Gmail).

The connected Gmail mailbox is never picked up because nothing chooses it as the default sender for system-generated emails (quotes, chasers, engagement letters, etc.).

## Fix

### A. Add `search` and `profile` actions to `companies-house-sync`

Update `supabase/functions/companies-house-sync/index.ts`:

- Parse `action` from the request body before falling through to the sync flow.
- `action: "search"` → return a sandbox `CHSearchResponse` (`items[]` + `total_results`) shaped to match `CHSearchResult` in `companies-house-lookup.ts`. Generate 3–5 deterministic mock companies based on the query so the dialog renders results.
- `action: "profile"` → return the existing `generateMockCompanyProfile(company_number)` payload, extended with `accounts.next_due` and `confirmation_statement.next_due` so the mapper in `mapCHProfileToFormData` produces the deadline fields it expects.
- Keep auth + org-access checks, but skip the `ch_sync_opt_in` requirement for `search`/`profile` — lookup during CRM/lead entry must work before any opt-in is recorded.
- Leave the existing sync path (no `action` or `action: "sync"`) untouched.

This keeps everything inside the documented sandbox constraint until real CH API keys are wired up.

### B. Route outbound system email through the org's connected mailbox

Update `supabase/functions/process-email-queue/index.ts`:

- When an `email_queue` row has `mailbox_id = NULL`, resolve a fallback mailbox by selecting the first `connected_mailboxes` row for the email's `organization_id` where `status = 'active'` (prefer the most recently connected). If found, use it via the existing `sendViaGmail` / `sendViaOutlook` branches and persist `mailbox_id` back onto the queue row for traceability.
- If no active mailbox exists for the org, mark the email as `failed` with a clear `error_message` ("No connected mailbox — connect Gmail or Outlook in Settings → Email Provider") **instead of attempting Postmark**, so practices get an actionable error rather than the cryptic Postmark token message. This matches the onboarding warning that automation is paused until a mailbox is linked.
- Drop the `POSTMARK_API_KEY` fallback path entirely (and remove the `sendViaPostmark` calls and constant) since the product direction is mailbox-only sending.

No frontend changes are needed for quote sending — the existing `lifecycle_send_quote` RPC + `QuoteDetail` mutation will succeed once the dispatcher uses the connected Gmail.

### C. Verification

After the changes:
- Companies House lookup dialog returns mock results and a selected company autofills the lead/company form.
- Sending a quote via `QuoteDetail` enqueues, the dispatcher picks up the row, sends through `leon@bluetickaccountants.com` via Gmail, and the row flips to `status = sent` with `provider = gmail`.
- Edge logs for `process-email-queue` show "sent successfully via gmail" instead of the Postmark token error.

## Files Touched

- `supabase/functions/companies-house-sync/index.ts` — add `search` / `profile` action handlers.
- `supabase/functions/process-email-queue/index.ts` — resolve fallback mailbox per org, remove Postmark fallback, fail with actionable error when no mailbox is connected.

No DB migrations and no frontend changes required.
