## Goal

When the reviewer ticks the AML checks and clicks **Mark as Verified**, that single action should:

1. Mark AML verified.
2. Create the client/company, engagements, jobs, and portal access (today this only happens when the separate **Approve** button is clicked).
3. Queue exactly one client email: *"You've passed AML verification — set up your client portal login."*

## Changes

### 1. Database — new combined RPC `verify_aml_and_approve`

Add one SECURITY DEFINER function that wraps the existing logic:

- Calls the same body as `verify_aml` (sets `aml_status='verified'`, sets `aml_verified_at`, 5-year expiry, writes audit row).
- Then calls `lifecycle_approve_onboarding(p_onboarding_id)` and returns its `jsonb` result merged with AML fields.
- Returns early (no approval) if onboarding is already in a terminal state, so re-clicking is idempotent.

Existing `verify_aml` and `lifecycle_approve_onboarding` stay in place for back-compat / direct admin use.

### 2. Database — reword the portal invite email

`lifecycle_grant_portal_access` is the only email queued on the happy path. Update its `INSERT INTO email_queue` so the subject and body reflect that the invite is the AML-pass + portal-setup message:

- **Subject:** `You've passed AML verification — set up your {{firm_name}} client portal`
- **Body:** short HTML congratulating the client on completing AML, instructing them to set their portal password via the existing tokenised link, with the firm name and portal URL.

No other email-queue insert fires on a first-day approval (the per-service "information request" emails inside `lifecycle_approve_onboarding` only queue when a quote line has an `information_request_template_id` *and* the trigger date is already in the past — keep that behaviour unchanged; user asked about the AML/portal path specifically).

### 3. Frontend — `src/components/onboarding/AMLVerificationPanel.tsx`

- Replace the `supabase.rpc("verify_aml", …)` call in `handleVerify` with `supabase.rpc("verify_aml_and_approve", …)`.
- Surface the approval result in the success toast: *"AML verified, client created, portal invite queued."* If `portal_access.ok === false`, show the same destructive toast variant already used in `OnboardingDetail.tsx`.
- Continue to call `onVerified()` so the parent reloads and re-renders the now-approved application.

### 4. Frontend — `src/pages/OnboardingDetail.tsx`

- Remove the **Approve Application** button and its `handleApproveClick` / `approveApplication` / AML-warning dialog wiring (AML verification is now the approval path).
- Keep the **Reject** button untouched.
- After `onVerified` reloads the application, show the post-approval state (client link, portal status) using the existing approved-state UI.
- Emit the same automation events (`emitOnboardingApproved`, `emitClientOnboarded`) inside the AML panel's success handler (or hoist into a small callback the panel calls) so downstream automations still fire.

### Technical notes

- `lifecycle_approve_onboarding` already returns `{ client_id, company_id, portal_access: { ok, portal_access_id, error? } }` — reuse that shape.
- `verify_aml_and_approve` should run inside a single transaction; if approval fails, AML status should NOT roll back (clinical decision: the AML decision is independent and auditable). Achieve this by committing AML via a sub-block and raising the approval error to the client without undoing the AML update — use an inner `BEGIN … EXCEPTION` only around approval; on failure, return `{ aml_status: 'verified', approval_error: SQLERRM }` so the UI can show a partial-success toast and prompt the user to retry approval.
- No changes to the queue worker, cron, or `email_queue` schema.
