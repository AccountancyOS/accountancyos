## Goal

Create `docs/email-system.md` as a permanent reference so developers don't accidentally break either email pipeline.

## Changes

### 1. Create `docs/email-system.md`

Sections:
- **Overview** — two independent pipelines (Lovable Managed Auth Email vs App-Owned Outbound Queue)
- **Pipeline A: Auth Email** — ASCII flow diagram + inventory:
  - Edge functions: `auth-email-hook`, `process-email-queue`, `handle-email-unsubscribe`, `handle-email-suppression`
  - Tables: `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
  - pgmq queues: `auth_emails`, `transactional_emails` (+ DLQ)
  - RPCs: `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`
  - Cron: `process-email-queue` every 5s
  - Templates: `supabase/functions/_shared/email-templates/*.tsx`
  - Domain: `notify.accountancyos.com`, site URL `https://app.accountancyos.com`
- **Pipeline B: App Outbound Queue** — ASCII flow diagram + inventory:
  - Tables: `email_queue`, `email_messages`, `email_threads`, `email_attachments`, `message_entity_links`, `connected_mailboxes`, `email_preferences`, `email_suppressions`, `email_push_subscriptions`
  - Service layer: `src/lib/email-service.ts`, `src/lib/email-safe-service.ts` (and the RPC wrappers it calls)
  - UI: `src/pages/Emails.tsx`, `src/components/email/EmailList.tsx`
  - Context taxonomy table (the 7 allowed values: quote, onboarding, engagement, job, invoice, system, general) with the human label for each
- **Silent-Breakage Table** — what edits silently break sends (auth-hook contract, SENDER_DOMAIN, context check constraint, cron job, service-role rotation, auto-generated Supabase files, redirect allow-list, post-publish prod cron, RLS, mailbox OAuth tokens)
- **Drift Detection** — `bun smoke` (`scripts/smoke-test.ts`), regression tests under `src/test/regression/` (auth-email-hook-contract, process-email-queue-contract, supabase-manifest, vocabulary-drift), CI gate
- **Safe / Care / Never cheat sheet**
- **PR Checklist** — ticks required before merging any change that touches `email_*` tables, `auth-email-hook`, `process-email-queue`, `send-transactional-email`, or `infra/supabase-manifest.json`

### 2. Link from `README.md`

Add a one-line entry under the existing docs section pointing to `docs/email-system.md`.

## Out of scope

- No code, schema, RLS, edge-function, or template changes.
- No new tests.
- No behavioral change to either email pipeline.
