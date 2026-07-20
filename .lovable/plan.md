# Migration + deploy batch — apply, verify, publish

## Pre-check summary (already confirmed against live DB in this turn)

| Item | Live state | Action |
|---|---|---|
| `20260720120500` mailbox safe view — `token_expires_at` column | **Already applied.** Recorded in `schema_migrations` as `20260720120811`; column exists on `connected_mailboxes_safe`. | Verify only, no re-apply. |
| `20260717090000/100000/110000` automation hardening | **Objects present** (`claimed_at` on `automation_workflow_instances` and `automation_events`; `attempts` + `failed_at` on `automation_events`; `automation_engine_switches` table exists; `process-automation-events` and `workflow-tick` cron jobs both active). Version rows themselves are missing from `schema_migrations` — the objects landed via a later consolidated file. | Verify only, no re-apply (Bucket A / superseded, matches `docs/audits/unapplied-migrations.md`). |
| `process-email-queue` cron | **Already present and active** — `cron.job` row `process-email-queue`, schedule `* * * * *`, `active=true`. (Fixed earlier this session, before the audit was written.) | Verify only, no create. |
| `automation_workflow_instances.status` CHECK | Live constraint is the buggy 5-value lowercase set from `20260717090000` — pause/cancel/spawn *will* raise `constraint violation`. | **Apply `20260720140000`**. |
| `notify_onboarding_approved` trigger fn | Exists; still queues the duplicate "welcome" email per source. | **Apply `20260720150000`**. |
| `add_service_to_client` RPC | **Not in `pg_proc`.** | **Apply `20260720160000`**. |

## Steps

1. **Apply 3 migrations, one call each (each opens its own approval card):**
   - `20260720140000_fix_workflow_instance_status_vocabulary.sql` — swaps the CHECK to the full uppercase 7-value set, normalises existing rows, resets default to `'QUEUED'`, rebuilds `idx_workflow_instances_tick`. Idempotent.
   - `20260720150000_drop_onboarding_welcome_email.sql` — `CREATE OR REPLACE` on `notify_onboarding_approved` to drop the `email_queue` insert; keeps the internal staff notification.
   - `20260720160000_add_service_to_client_rpc.sql` — creates `add_service_to_client(uuid,uuid,uuid,date,date,text)` SECURITY DEFINER, granted to `authenticated` + `service_role`.

2. **Post-migration verification (queried live after each approval):**
   - `pg_get_constraintdef` on `automation_workflow_instances_status_check` lists all 7 UPPERCASE values.
   - `pg_get_functiondef('notify_onboarding_approved')` shows no `INSERT INTO email_queue`.
   - `SELECT proname FROM pg_proc WHERE proname='add_service_to_client'` returns 1 row; grants present.
   - Confirm `schema_migrations` picked up each `2026072014/15/16` version (the working-agreement check).

3. **Re-verify previously-landed items (no changes):**
   - `information_schema.columns` → `connected_mailboxes_safe.token_expires_at` present.
   - `information_schema.columns` → `automation_workflow_instances.claimed_at`, `automation_events.claimed_at` + `attempts` + `failed_at` all present.
   - `to_regclass('public.automation_engine_switches')` non-null; both router and executor rows exist (probe `SELECT engine, enabled FROM automation_engine_switches`).
   - `cron.job` contains `process-email-queue`, schedule `* * * * *`, `active=true`.

4. **Redeploy edge functions** (`supabase--deploy_edge_functions`): `workflow-tick`, `process-automation-events`, `process-email-queue`. Report the returned deploy IDs.

5. **Publish the frontend** so `client.accountancyos.com` picks up the current portal bundle (the Bank white-screen was traced to a stale bundle earlier). Uses `preview_ui--publish`. Post-publish, note that Live-database migrations approved above are already live because Cloud shares one DB — no separate prod approval needed. Ask the user to hard-refresh once the deploy notification fires (~1 min) to confirm the portal bundle matches `main`.

6. **Report block** to the user with the exact verification output for each of the 6 items in point 5 of their request (portal bundle live, three new objects present, cron job present).

## Notes / non-actions

- No TypeScript regeneration is triggered manually — the Supabase types file regenerates automatically after each approved migration; the `add_service_to_client` RPC will appear in the generated `Database['public']['Functions']` map without a code change on my side.
- No new cron file authored — the `process-email-queue` schedule is already correct; touching it risks re-creating drift.
- No changes to `supabase/config.toml`.
- No portal source edits — publish only.

## Technical details

- Migration approvals must land in `schema_migrations` before the "done" report — per the working agreement from earlier this session, I'll `SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '2026072014%'` (and 15/16) after each card and paste the row into the report.
- Reconciliation of the missing `schema_migrations` rows for `20260717090000/100000/110000` is out of scope for this batch (they're already listed as Bucket A in `docs/audits/unapplied-migrations.md`); we do not backfill history rows.
- Publish does not require a security scan re-run — the automation/onboarding/RPC changes here are not surfacing new public endpoints.
