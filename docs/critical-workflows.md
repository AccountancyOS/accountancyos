# Critical Workflows

Source of truth for the business-critical user journeys in AccountancyOS. Every change that touches one of these workflows must be reviewed against this document and run the matching tests in `src/**/*.test.tsx` plus `scripts/smoke-test.ts` before being shipped.

Conventions for each workflow:
- **Frontend entry** — page/component a user clicks
- **Backend** — RPCs, services, edge functions invoked
- **Tables** — primary tables read/written
- **RLS** — security assumption that must hold
- **External** — third-party providers
- **State transitions** — observable lifecycle / logs
- **Failure modes** — known ways it breaks
- **Regression test** — Vitest / edge-function contract test that guards it
- **Smoke check** — named check in `scripts/smoke-test.ts` (if applicable)

Every workflow MUST have at least one of: a regression test, an edge-function
contract test, a live smoke check, or a DB-state transition test. Mock-only
coverage is not enough — see the coverage matrix at the bottom of this file.

---

## 1. Accountant Login
- **Frontend entry**: `src/pages/Index.tsx` → `src/lib/auth-context.tsx`
- **Backend**: `supabase.auth.signInWithPassword`, `signInWithOAuth({ provider: 'google' })`
- **Tables**: `auth.users`, `public.profiles`, `public.organization_users`, `public.user_roles`
- **RLS**: every read scoped by `organization_id` resolved through `organization_users.user_id = auth.uid()`
- **External**: Google OAuth (when enabled)
- **State transitions**: `auth.users.last_sign_in_at` updated → `AppContext` resolves org → router lands on `/overview`
- **Failure modes**: missing `organization_users` row (user stuck on onboarding), revoked role, Google provider not configured

## 2. Client Portal Login
- **Frontend entry**: `src/portal/pages/PortalLogin.tsx`
- **Backend**: `supabase.auth.signInWithPassword`, then `PortalGuard` resolves portal access
- **Tables**: `auth.users`, `public.portal_access`, `public.clients`, `public.companies`
- **RLS**: portal user may only read rows where `portal_access.user_id = auth.uid()` and `status = 'active'`
- **External**: none
- **State transitions**: login → `portal_access.last_seen_at` updated → routed to `/portal/dashboard`
- **Failure modes**: `portal_access.status = 'revoked'`, missing portal_access row, expired session, portal disabled per visibility settings

## 3. Client Forgotten Password (Portal)
- **Frontend entry**: `src/portal/pages/PortalForgotPassword.tsx`
- **Backend**: `supabase.auth.resetPasswordForEmail(email, { redirectTo: '<origin>/portal/reset-password' })`
- **Edge functions**: `auth-email-hook` (renders + enqueues recovery template), `process-email-queue` (sends via provider)
- **Tables**: `auth.users` (`recovery_sent_at`), `public.email_send_log` (rows: `pending` → `sent`), pgmq `auth_emails` queue
- **RLS**: n/a — service-role inside hook
- **External**: Lovable Email API → verified sender domain `notify.accountancyos.com`
- **State transitions**:
  1. Auth API returns 200 and sets `recovery_sent_at`
  2. `auth-email-hook` logs `Received auth event` + `Auth email enqueued`
  3. `process-email-queue` logs `Processing complete` and `email_send_log.status` flips to `sent`
  4. User clicks email → lands on `/portal/reset-password` with recovery token
- **Failure modes**:
  - `email_send_log` empty after request → hook not wired in Supabase Auth (re-scaffold `auth-email-hook`)
  - Hook 5xx → check `enqueue_email` RPC + `email_send_log` table exist
  - `redirectTo` not allow-listed in Supabase Auth → email sent but link rejected
  - Rate-limit (429) on repeated attempts → wait or use fresh address
  - Recipient on `public.suppressed_emails` → silently dropped

## 4. Client Invitation
- **Frontend entry**: `src/components/clients/InviteClientDialog.tsx`
- **Backend**: `accept-portal-invite-signup` edge function for the invited-link flow
- **Tables**: `public.portal_access` (insert with `status='invited'` → `'active'`), `auth.users` (create on accept)
- **RLS**: only org owner/admin can insert into `portal_access`; invited user can update their own row to `active`
- **External**: Email queue (`process-email-queue`) delivers invite link
- **State transitions**: `portal_access.status`: `invited` → `active` (or `revoked`)
- **Failure modes**: duplicate email in another org, invite link expired, user already has portal access on a different client

## 5. Quote Accepted → Client Created → Onboarding Started
- **Frontend entry**: `src/pages/PublicQuoteView.tsx` (public) or accountant-side `QuoteDetail`
- **Backend RPCs**: `accept_quote_and_create_client` (DB), `src/lib/quote-port-service.ts`
- **Tables**: `public.quotes` → `status='accepted'`; `public.clients` insert; `public.onboarding_applications` insert; `public.engagements` insert; `public.crm_activities` log
- **RLS**: anonymous accept requires service-role via RPC + `quote_acceptance_tokens` row
- **External**: Stripe Connect (`stripe-connect-onboard`) if billing required
- **State transitions**: `quote.status`: `sent` → `accepted` → `converted`
- **Failure modes**: missing acceptance token, duplicate client email triggers uniqueness constraint, Stripe Connect not enabled on practice

## 6. Engagement Letter Send / Sign
- **Frontend entry**: `src/components/clients/EngagementLetterPanel.tsx`
- **Backend**: `send-engagement-letter` edge function, `src/lib/engagement-change-service.ts`
- **Tables**: `public.engagement_letters` (`status`, `signed_at`, `version`), `public.document_signature_audit`
- **RLS**: client can read/sign only their own letter via `portal_access.client_id`
- **External**: Email queue for delivery
- **State transitions**: `draft` → `sent` → `viewed` → `signed`; version bumps on re-sign
- **Failure modes**: fee change without re-sign trigger, expired signature link, PDF generation failure

## 7. Questionnaire Send
- **Frontend entry**: Job detail → Questionnaire tab
- **Backend**: `src/lib/questionnaire-workpaper-service.ts` (`createQuestionnaireInstance`)
- **Tables**: `public.questionnaire_instances` (insert `status='sent'`), `public.questionnaire_public_links`
- **RLS**: only org members can insert; recipient access via signed public link token
- **External**: Email queue
- **State transitions**: `draft` → `sent` → `in_progress` → `submitted`
- **Failure modes**: invalid public link token, recipient hit token attempt limit

## 8. Questionnaire Completion → Job Update
- **Frontend entry**: `src/pages/QuestionnaireResponse.tsx`, `src/portal/pages/PortalQuestionnaireResponse.tsx`
- **Backend**: `submit_questionnaire_response` RPC, `src/lib/questionnaire-workpaper-service.ts`
- **Tables**: `public.questionnaire_responses` insert; `public.questionnaire_instances.status='submitted'`; `public.jobs` advance status; `public.job_timeline` event
- **RLS**: public token bypasses RLS via SECURITY DEFINER RPC
- **State transitions**: instance `submitted_at` set → linked job status advances per template rules
- **Failure modes**: branching logic mismatch, missing job link, status advance skipped because previous step incomplete

## 9. Email Queue Processing
- **Frontend entry**: triggered by app code calling `enqueue_email` RPC (auth hook, send-engagement-letter, chasers)
- **Backend**: `process-email-queue` edge function (cron every 5s), `auth-email-hook` for auth events
- **Tables**: pgmq `auth_emails`, `transactional_emails`, dlq counterparts; `public.email_send_log`; `public.email_send_state`; `public.suppressed_emails`
- **RLS**: service-role only
- **External**: Lovable Email API → Postmark/Mailgun; provider mailbox (Gmail/Outlook) for accountant outbound
- **State transitions** per send: `pending` → `sent` | `dlq` | `suppressed`
- **Failure modes**: missing `enqueue_email` RPC, missing tables, cron not scheduled, TTL exhausted, recipient suppressed, "No connected mailbox" for transactional-from-mailbox sends

## 10. Deadline / Job Generation
- **Frontend entry**: client/company creation, period rollover, accountant-triggered "Generate Deadlines"
- **Backend**: `src/lib/auto-rollover-service.ts`, `src/lib/job-template-engine.ts`, DB trigger `enqueue_deadline_jobs`
- **Tables**: `public.deadlines`, `public.jobs`, `public.job_tasks`
- **RLS**: org-scoped
- **State transitions**: deadline created → job auto-spawned at threshold → tasks instantiated from template
- **Failure modes**: missing service mapping (skip), partnership without both contacts (block), deadline overlap with manual override

## 11. TrueLayer Connect / Sync
- **Frontend entry**: `src/components/bookkeeping/BankConnectDialog.tsx`
- **Backend**: `truelayer-auth` → `truelayer-callback` → `truelayer-sync` (manual) + `truelayer-sync-scheduled` (cron)
- **Tables**: `public.bank_connections`, `public.bank_accounts`, `public.bank_transactions`, `public.bank_sync_logs`
- **RLS**: per `organization_id`
- **External**: TrueLayer Data API
- **State transitions**: `bank_connections.status`: `pending` → `active` → `expired`; sync writes `bank_sync_logs`
- **Failure modes**: token refresh failure, scope downgrade, TrueLayer rate-limit, missing `TRUELAYER_*` secrets

## 12. Bookkeeping Transaction Posting
- **Frontend entry**: `src/pages/Bookkeeping.tsx` → categorize + post
- **Backend**: `post_to_ledger` RPC (mandatory; do not hardcode account codes)
- **Tables**: `public.bank_transactions`, `public.ledger_entries`, `public.journals`, `public.journal_lines`
- **RLS**: org-scoped; period locks enforced via `public.period_locks`
- **State transitions**: transaction `categorized` → ledger entry created → journal posted
- **Failure modes**: period locked, missing TB mapping, VAT code mismatch

## 13. Workpaper Approval / Locking Before Filing
- **Frontend entry**: `src/pages/Workpapers.tsx`
- **Backend**: `src/lib/filing-lock-service.ts`, `src/lib/filing-approval-service.ts`
- **Tables**: `public.workpaper_instances`, `public.filing_approvals`, `public.filing_model_snapshots`, `public.audit_log`
- **RLS**: org-scoped, plus reviewer ≠ approver enforcement
- **State transitions**: `draft` → `in_review` → `approved` → `locked` (snapshot + hash)
- **Failure modes**: snapshot hash mismatch, missing review, period unlocked after approval

## 14. Filing Submission State Machine
- **Frontend entry**: `src/pages/Filings.tsx`
- **Backend**: `ch-submit`, `hmrc-ct-submit`, `hmrc-vat-submit`, `cis-submit`, `rti-submit`, poll functions
- **Tables**: `public.filings`, `public.filing_submissions`, `public.filing_events`, `public.filing_provider_events`
- **RLS**: org-scoped; locked snapshots immutable
- **External**: Companies House, HMRC MTD endpoints
- **State transitions**: `prepared` → `approved` → `locked` → `submitted` → `accepted` | `rejected`
- **Failure modes**: HMRC auth missing (`hmrc_authorisations`), sandbox/production flag mismatch, payload schema rejection, idempotency key collision

## 15. RLS Cross-Organization Isolation
- **Frontend entry**: any list/detail page
- **Backend**: every public-schema policy must filter by `organization_id` derived from `organization_users.user_id = auth.uid()`
- **Tables**: every table listed in `infra/supabase-manifest.json#rlsRequiredTables`
- **RLS**: tables with cross-org links (e.g. `accountant_client_links`, `portal_access`) must still scope by the originating org
- **State transitions**: n/a
- **Failure modes**: a policy using `USING (true)`, anon role granted to a tenant table, a new table created without RLS enabled, a SECURITY DEFINER function that leaks across orgs