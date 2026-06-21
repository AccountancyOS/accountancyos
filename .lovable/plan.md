## Why the error appears

Two distinct bugs, one visible, one hidden:

### Bug 1 (causes the toast you see)
`supabase/functions/process-email-queue/index.ts` has **no CORS headers and no `OPTIONS` preflight handler**. When the Emails page calls `supabase.functions.invoke("process-email-queue")` from the browser, the CORS preflight fails before the function ever runs — supabase-js surfaces that as "Failed to send a request to the Edge Function". The function logs only show `Boot`/`Shutdown`, never an invocation, which matches.

### Bug 2 (revealed once Bug 1 is fixed)
The Emails page lists rows from the `public.email_queue` table (one pending quote email is sitting there right now). But `process-email-queue` only drains the pgmq queues `auth_emails` and `transactional_emails`. It never reads `email_queue`. So even after CORS is fixed, clicking "Process Queue" returns `processed: 0` and the visible pending email stays stuck forever. The UI is wired to a worker that doesn't process its own queue.

## Plan

### Step 1 — Fix CORS on `process-email-queue` (unblocks the toast)
- Add the standard `corsHeaders` import and an `OPTIONS` preflight handler at the top of `Deno.serve`.
- Include `...corsHeaders` in every `Response` (success, 401, 403, 500, rate-limited, forbidden, final).
- No behavior change beyond CORS.

### Step 2 — Confirm scope of "Process Queue" button before changing worker semantics
Bug 2 is bigger than a UI tweak — it changes what the worker does. I want your call before touching it. Options:

- **(A) Make `process-email-queue` also drain `public.email_queue`** (preferred): after the pgmq loop, select `email_queue` rows where `status='pending'` and `scheduled_at <= now()` for the caller's org, render placeholders, send via the existing provider path, and on provider ack flip the row to `sent` with `provider_message_id`; on failure set `status='failed'` with `error_message`. Honours the non-negotiable: never mark `sent` without a provider id.
- **(B) Leave the worker alone, change the button**: have the Emails page invoke a different function (or new RPC) that processes `email_queue` rows, and keep `process-email-queue` for pgmq/auth only.
- **(C) Status quo + label change**: rename the button to "Process Auth/Transactional Queue" and add separate handling for `email_queue` later.

### Step 3 — Regression coverage
- Extend `src/test/regression/process-email-queue-contract.test.ts` (or add a new test) to assert the function source contains an `OPTIONS` handler and `Access-Control-Allow-Origin` — so this CORS gap can't silently regress.
- Add a smoke check in `scripts/smoke-test.ts` that does a real `OPTIONS` preflight against the deployed `process-email-queue` endpoint and asserts a 2xx with the CORS header present. This matches your non-negotiable that infra/deploy drift must be caught by the live smoke test, not just unit tests.
- If you pick option (A) in Step 2, add a regression test asserting that an `email_queue` row only flips to `sent` when a `provider_message_id` is recorded (mirrors the auth-email non-negotiable).

### Step 4 — Deploy and verify
- Deploy `process-email-queue`.
- From the Emails page, click "Process Queue" → expect a real JSON response (no toast error) and, if Step 2A is chosen, the visible pending quote email transitions to `sent` with a provider id stored.

## Out of scope
- No DB migrations.
- No changes to `auth-email-hook`, `email_queue` schema, or the Emails page UI beyond what Step 2 decides.
- No retry-policy or TTL changes.

## Decision I need from you
Which option for Step 2 — **A**, **B**, or **C**? Default is **A** unless you say otherwise.
