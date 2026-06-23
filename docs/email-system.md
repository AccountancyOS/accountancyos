# Email System Reference

AccountancyOS has **two email entry points** (auth vs. app), but they are **not** fully independent: both ultimately drain through the **same worker, `process-email-queue`**. Confusing where an email is *composed* vs. where it is *sent* is the #1 way email silently breaks.

| Entry point | Purpose | Composed by | Sent by |
|---|---|---|---|
| **A. Lovable Managed Auth Email** | Password reset, magic link, signup confirmation, invites, email change, reauthentication | `auth-email-hook` → `enqueue_email` → pgmq `auth_emails` | `process-email-queue` |
| **B. App Outbound Queue** | Every business email the practice sends to clients/leads (quotes, engagement letters, chasers, job notifications, invoices, system notices) | sender RPCs (e.g. `lifecycle_send_quote`) INSERT into `email_queue` | `process-email-queue` |

> **`process-email-queue` is shared.** It drains the pgmq `auth_emails`/`transactional_emails` queues **and** the `public.email_queue` table, and for each message picks a provider: **Lovable's email API by default**, or a **connected Gmail/Outlook mailbox** when the queue row carries a `mailbox_id`.

---

## Pipeline A — Lovable Managed Auth Email

```text
Supabase Auth event
  -> auth-email-hook (edge function, webhook signature verified)
  -> renders React Email template
  -> enqueue_email RPC ----> pgmq queue: auth_emails
  -> pg_cron (every 5s) -> process-email-queue (edge function)
  -> Lovable email API (provider) -> recipient
  -> email_send_log row updated (pending | sent | failed | dlq | suppressed)
```

### Inventory

- **Edge functions**: `auth-email-hook`, `process-email-queue`, `handle-email-unsubscribe` (note: there is no `handle-email-suppression` or `send-transactional-email` function — suppression is handled in `process-email-queue` + the `suppressed_emails` table)
- **Tables**: `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
- **pgmq queues**: `auth_emails`, `transactional_emails` (+ DLQ counterparts)
- **RPCs**: `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`
- **Cron**: `process-email-queue` every 5 seconds (must exist in both dev and prod)
- **Templates**: `supabase/functions/_shared/email-templates/*.tsx` (React Email; safe to edit copy/colors)
- **Domain**: `notify.accountancyos.com` (NS-delegated to Lovable). Site URL: `https://app.accountancyos.com`
- **Auth redirect allow-list** must include the production custom domain **and** the Lovable preview URL, both with `/portal/reset-password`

### Auth action types handled
`signup`, `magiclink`, `recovery`, `invite`, `email_change`, `reauthentication`

---

## Pipeline B — App Outbound Queue

```text
RPC or service (lifecycle_send_quote, trigger_records_request,
                automation chaser run, queueEmail / queue_email_safe, ...)
   |
   v
INSERT email_queue (status='pending', context in 7 allowed values)
   |   ^ placeholders are substituted HERE, by the sender RPC, before the row is queued.
   |     process-email-queue does NOT apply merge_data — it sends body_html as-is.
   v
process-email-queue (shared worker; pg_cron every 5s or manual "Process Queue")
   |
   +-- row has mailbox_id? --> gmail-send / outlook-send (accountant's connected mailbox)
   |
   +-- otherwise            --> Lovable email API (default provider)
   |
   v
email_send_log (send record) + email_messages / message_entity_links (joins message to entity)
```

### Inventory

- **Tables**
  - `email_queue` — outbound work queue
  - `email_messages` — sent record
  - `email_threads` — conversation grouping
  - `email_attachments` — file attachments
  - `message_entity_links` — generic join: message <-> entity (client, job, quote, invoice, ...)
  - `connected_mailboxes` — OAuth tokens for Gmail / Microsoft 365
  - `email_preferences` — per-user notification toggles
  - `email_suppressions` — bounce / unsubscribe records
  - `email_push_subscriptions` — web push subscriptions
- **Service layer**
  - `src/lib/email-service.ts` — typed `queueEmail()` insert
  - `src/lib/email-safe-service.ts` — wraps RPCs: `queue_email_safe`, `update_queued_email_safe`, `retry_failed_email_safe`, `acknowledge_failed_email_safe`, `disconnect_mailbox_safe`
- **UI**
  - `src/pages/Emails.tsx` — global queue / work list with `context` filter
  - `src/components/email/EmailList.tsx` — row rendering + `CONTEXT_LABELS` badge map
- **Queue statuses** (`email_queue_status_check`): `pending`, `sent`, `failed`, `cancelled` — note `queued` and `draft` are **not** valid `email_queue` statuses (the 7-value `pending/sent/suppressed/failed/bounced/complained/dlq` set is `email_send_log`, a different table)

### `email_queue.context` taxonomy (enforced by `email_queue_context_check`)

| Value | Label | Source |
|---|---|---|
| `quote` | Quote | `lifecycle_send_quote` |
| `onboarding` | Onboarding | `lifecycle_send_back_onboarding` and other onboarding senders |
| `engagement` | Engagement Letter | engagement letter RPCs |
| `job` | Job | automation chaser runs, `trigger_records_request`, filing notifications |
| `invoice` | Invoice | invoice senders |
| `system` | System | platform notices |
| `general` | General | anything else (catch-all; old `ad-hoc` / `portal` were backfilled here) |

Any insert with a value outside this list is rejected by the DB. Update the check constraint, `src/lib/db-constants/check-constraints.ts`, the filter in `src/pages/Emails.tsx`, and the badge map in `EmailList.tsx` together — never one in isolation.

---

## Things That Silently Break Email

| Edit | What breaks |
|---|---|
| Removing `enqueue_email` from `supabase/functions/auth-email-hook/index.ts`, or reverting to the legacy `@lovable.dev/email-js` `callback_url` direct send | All auth emails (no queue retries, no logs) |
| Changing `SENDER_DOMAIN` away from `notify.accountancyos.com` in any edge function | Provider lookup fails; sends 5xx |
| Inserting `email_queue.context` value outside the 7 allowed | INSERT rejected, sender RPC errors (now guarded by the drift registry/test) |
| A sender RPC builds a template `{{placeholder}}` it doesn't fill in (name mismatch, or storing `merge_data` expecting the worker to apply it) | Email goes out with literal `{{...}}` / missing links. **Substitution must happen in the sender before queuing — `process-email-queue` never applies `merge_data`.** |
| A sender RPC queries a column that doesn't exist on its table (e.g. `templates.category`/`is_active`) | Sender errors, email never queued ("column … does not exist") |
| Removing the CORS `OPTIONS` handler / `corsHeaders` from `process-email-queue` | Browser preflight fails → the manual "Process Queue" button errors with "Failed to send a request to the Edge Function" |
| Dropping / renaming `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`, or any pgmq queue | Worker crashes; emails enqueue and never send |
| Removing the `process-email-queue` pg_cron job | Silent halt. Re-provision via `setup_email_infra`, never recreate manually |
| Supabase service-role key rotation without refreshing Vault secret | Worker returns 401/403; fix with `setup_email_infra` (idempotent) |
| Hand-editing `src/integrations/supabase/client.ts`, `types.ts`, or `.env` | Auto-generated; overwrites will be lost or break types |
| Removing `/portal/reset-password` from the auth redirect allow-list | Password reset links fail |
| Forgetting to verify the Live cron after publish | Prod has its own pg_cron; if `process-email-queue` is missing in Live, emails enqueue but never send |
| Tightening RLS on `email_queue` / `email_messages` without updating UI policies | Queue page goes blank; retry/edit buttons error |
| Breaking OAuth refresh in `connected_mailboxes` | All outbound app emails stop |
| Adding `<noscript><img>` inside `<head>` in `index.html` | Invalid HTML5; may break tracking pixel fallbacks |

---

## Drift Detection (already wired)

- `bun smoke` — `scripts/smoke-test.ts` diffs the live backend against `infra/supabase-manifest.json`. Missing cron, edge functions, tables, RLS, or secrets fail loudly.
- `src/test/regression/auth-email-hook-contract.test.ts` — locks the auth hook contract
- `src/test/regression/process-email-queue-contract.test.ts` — locks the worker contract
- `src/test/regression/supabase-manifest.test.ts` — locks the manifest
- `src/test/regression/vocabulary-drift.test.ts` — catches stale enum / context values; **`email_queue.context` and `email_queue.status` are now registered** in `src/lib/db-constants/check-constraints.ts`, so a value drifting out of the allowed set fails this test (and the live `bun smoke` check) before it reaches a client
- CI (`.github/workflows/ci.yml`) runs these on every PR

Run both before shipping anything that touches email:

```bash
bun run test
bun smoke
```

---

## Cheat Sheet

### Safe (no special review needed)
- Edit copy / colors / layout inside `supabase/functions/_shared/email-templates/*.tsx`
- Add a new sender that INSERTs into `email_queue` with a valid `context`
- Add new UI that reads `email_queue` / `email_messages`
- Add new triggers via `queueEmail()` or `queue_email_safe`

### Care (run `bun run test` + `bun smoke`)
- Any migration touching `email_*` tables, RLS, or RPCs
- Editing `auth-email-hook`, `process-email-queue`, or a sender RPC like `lifecycle_send_quote`
- Changing the `email_queue_context_check` constraint or the matching frontend constants
- Editing `infra/supabase-manifest.json`

### Never
- Hand-edit `supabase/config.toml` project-level settings
- Hand-edit auto-generated Supabase client / types / `.env`
- Recreate pgmq queues, cron jobs, or Vault secrets manually via SQL
- Insert into `email_queue` with a context outside the 7 allowed values
- Add bulk / marketing send loops (one queue row = one recipient; the queue only retries individually queued sends)
- Rename the `auth-email-hook` edge function (Lovable routes auth events to this exact name)

---

## PR Checklist (paste into PR description when touching email)

- [ ] Changes do not rename / drop any table in the inventory above
- [ ] If `email_queue_context_check` changed: DB constraint, `src/lib/db-constants/check-constraints.ts`, `src/pages/Emails.tsx` filter, and `EmailList.tsx` badge map all updated in the same PR
- [ ] No new code paths that bulk-loop a single template over many recipients
- [ ] `auth-email-hook` still calls `enqueue_email` (no reverts to direct-send)
- [ ] `SENDER_DOMAIN` constants unchanged (or reviewed)
- [ ] `bun run test` passes locally
- [ ] `bun smoke` passes against the target backend
- [ ] If publishing to Live: verified `process-email-queue` pg_cron exists in prod after publish
