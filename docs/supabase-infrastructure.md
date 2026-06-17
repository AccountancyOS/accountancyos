# Supabase Infrastructure Manifest (Human Readable)

The machine-readable source of truth is [`infra/supabase-manifest.json`](../infra/supabase-manifest.json). The smoke test (`scripts/smoke-test.ts`) diffs the live backend against that file and fails loudly on any drift.

## Auth
- **Site URL**: `https://app.accountancyos.com`
- **Redirect allow-list** must include the production custom domain and the published Lovable URL, both with `/portal/reset-password`
- **Send-email hook**: edge function `auth-email-hook` with sender `notify.accountancyos.com`
- **Action types handled by the hook**: signup, magiclink, recovery, invite, email_change, reauthentication

## Email Pipeline
- Tables (public): `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
- Public RPCs: `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`
- pgmq queues: `auth_emails`, `transactional_emails` (plus dlq counterparts)
- Worker: `process-email-queue` invoked via pg_cron every 5 seconds

## Cron
See `cronJobs` in the manifest. Missing crons are a P0 — they silently halt automation, chasers, SLA tracking, and emails.

## Required Runtime Secrets
See `requiredSecrets` in the manifest. Missing secrets fail relevant edge functions at runtime with cryptic 500s.

## Storage Buckets
See `storageBuckets`. `email-assets` is the only intentionally public bucket. All others must be private.

## RLS-Required Tables
See `rlsRequiredTables`. Every entry **must** have RLS enabled. The smoke test asserts this via `pg_class.relrowsecurity`.

## Drift Detection
Run `bun smoke` after every deploy and as a CI gate. Output includes per-check status, error message, and remediation hint.