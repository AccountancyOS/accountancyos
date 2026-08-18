# London cutover runbook

Sequenced because several steps are **irreversible** and several others fail silently if done
out of order. Read §0 before starting anything.

Target: the company-owned London Supabase project. Source: the legacy Lovable Cloud project,
which stays live and untouched until §7.

---

## 0. Irreversibility and ordering — read first

| Constraint | Consequence of getting it wrong |
|---|---|
| The export **cannot be downloaded after Lovable Cloud is removed**, and removal is permanent | Export first, verify London fully, remove last |
| **User passwords are not in the export** | Every user must reset — which needs working email on London *before* cutover |
| Vault secrets must exist **before** cron jobs are scheduled | Otherwise 12 jobs run and 401 every run, looking healthy in `pg_cron` |
| `pg_cron`/`pg_net` must be enabled **before** `london-cron.sql` | The migration's preconditions abort, loudly — this one is safe |
| The archive is **zstd-compressed** | A `pg_restore` without zstd silently gives schema and no data |
| The baseline must never enter `supabase/migrations/` | The Lovable executor would apply it to the **legacy** database |

The password/email coupling is the trap worth restating: **email must work on London before
anyone needs to log in**, and the current email path dies with Lovable.

---

## 1. Prepare the London project

1. Create the project (London region).
2. Enable extensions: **`pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`** — and **`pgmq`**, see below.

   **The baseline must NOT create extensions.** Corrected 2026-08-18: re-issuing
   `CREATE EXTENSION IF NOT EXISTS pg_cron` on a project that already has it makes Supabase's
   `after-create.sql` platform hook fail with `2BP01: dependent privileges exist`, aborting the
   whole migration. The baseline now only *asserts* the four extensions exist.

3. **`pgmq` is required and is easy to miss.** Five baseline functions depend on it —
   `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`, `email_queue_dispatch` —
   and they address two queues **by name**: `pgmq.q_auth_emails` and `pgmq.q_transactional_emails`.

   So after enabling the extension, create both queues:
   ```sql
   SELECT pgmq.create('auth_emails');
   SELECT pgmq.create('transactional_emails');
   ```

   This matters more than it looks. PL/pgSQL bodies are not validated at creation, so all five
   functions install perfectly against a project with no `pgmq` — and then fail at runtime. The
   entire outbound email path would be broken while every structural check passed. That is the
   Gate 6 pattern this programme keeps meeting.
4. Do **not** create any role. In particular **never create `sandbox_exec`** — it carried
   `BYPASSRLS` on the legacy project and was restored out of band three times (DEF-031).

## 2. Apply the schema — in this order

| # | File | sha256 | Notes |
|---|---|---|---|
| 1 | `london-baseline.sql` | `5894380726c5e41d…` | 226 tables, 370 functions, 688 policies, 622 FKs, 257 CHECKs |
| 2 | `london-storage.sql` | `107524646da822b3…` | 9 buckets + 36 policies, self-verifying |
| 3 | `london-seed.sql` | see checksums | 14 reference tables, 232 rows. Product reference data only — no tenant data |
| 4 | `london-cron.sql` | `5d289828064d5e72…` | 12 jobs — **do §3 and §4 first** |

### Reference data is NOT optional

The baseline is schema-only, so it creates 14 reference tables empty: `canonical_services`,
`canonical_job_templates`, `canonical_deadline_rules`, `automation_trigger_contracts`,
`template_merge_fields`, `chaser_message_templates`, `data_requirements`, the three tax
`*_rate_tables`, and the automation workflow library. Without `london-seed.sql` the product has
no service catalogue, no deadline rules and no tax rates. Every one of those 14 tables was
verified to have no `organization_id`/`client_id`/`user_id` column, so the seed carries no
tenant data.

Before applying the baseline, substitute the **2** `__LONDON_PROJECT_URL__` placeholders in
`email_queue_dispatch()` and `email_queue_wake()`. Afterwards confirm none survive:

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc LIKE '%__LONDON_PROJECT_URL__%';
```

Then verify the schema landed whole:

```sql
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public')                        AS tables,      -- 226
  (SELECT count(*) FROM pg_policies WHERE schemaname='public')                      AS policies,    -- 688
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public')                                                       AS functions,   -- 370
  (SELECT count(*) FROM pg_constraint WHERE contype='f')                            AS fks,         -- 622
  (SELECT count(*) FROM pg_class WHERE relrowsecurity AND relnamespace='public'::regnamespace) AS rls_on; -- 226
```

## 3. Secrets

Set all 45 Edge Function secrets per the rotation matrix in
`docs/superpowers/plans/2026-08-17-credential-security.md`. Reminders:

- The 6 Supabase-generated values are **necessarily new**; none may be copied.
- `ENCRYPTION_KEY` is **ROTATE** (owner decision). It protects **HMRC tokens only** — Gmail,
  Outlook and TrueLayer tokens are stored in plaintext — so rotation forces HMRC
  re-authorisation and nothing else. Remove the `|| 'default-dev-key-change-in-production'`
  fallback while you are here; it is a published constant.
- The two Lovable email secrets are **retired**.

## 4. Vault

Create both, **before** §2 step 3:

| Vault name | Must equal |
|---|---|
| `cron_service_role_key` | the London service-role key |
| `cron_shared_secret` | the `CRON_SECRET` **Edge Function env var** of `truelayer-sync-scheduled` |

The Vault and the Edge Function environment are **different stores**. Conflating them is
precisely why the legacy `truelayer-sync-hourly` job sent a null header and 401'd on every run.

## 5. Email — the long pole

Lovable Email has no Supabase equivalent and must be rebuilt before cutover:

1. Choose a provider; verify the sending domain (SPF + DKIM).
2. Rewrite `auth-email-hook` and `process-email-queue` off `npm:@lovable.dev/email-js` and
   `npm:@lovable.dev/webhooks-js`.
3. Register the Auth **send-email hook** so branded auth mail still routes through the queue.
4. Re-test the unsubscribe path (`handle-email-unsubscribe`).
5. Prove it end to end: enqueue a row, watch it reach `sent`, confirm arrival.

Until this works, **do not migrate users** — they cannot reset their passwords.

## 6. Edge functions and frontend

- Deploy all 61 functions. Declare `verify_jwt` for the seven currently absent from
  `config.toml` (`automation-dry-run`, `clone-workpaper-template`, `gdpr-data-deletion`,
  `gdpr-data-export`, `portal-qa-probe`, `seed-portal-test-users`, and `mcp`), which currently
  deploy on the platform default.
- Rewrite the CORS allow-lists that trust `*.lovable.app` / `*.lovableproject.com` in
  `accept-portal-invite-signup`, `portal-pay-invoice`, `stripe-checkout`,
  `onboarding-stripe-checkout`.
- Repoint the frontend: `vite.config.ts:7-8` hard-codes the legacy ref **with an anon-key
  fallback**. Do this at cutover — changing it earlier breaks the legacy deployment.
- Re-register the Stripe webhook against London. `STRIPE_WEBHOOK_SECRET` will be a **new**
  value; signing secrets are per-endpoint and cannot be copied.
- Re-register OAuth redirect URIs at Google, Microsoft, TrueLayer and HMRC.
- Regenerate `infra/supabase-manifest.json` from the built project. Do not carry it across: its
  storage section names four buckets that exist nowhere, and five of its `requiredSecrets` are
  read by no function while 25 that are required go undeclared.

## 7. Verify before trusting — behavioural, not structural

A green catalog read is not evidence. The legacy project passed every structural check while
four cron jobs 401'd for weeks.

1. **RLS** — two real authenticated users in **different organisations**, each unable to see the
   other's data. Never through a role that could bypass RLS. `scripts/smoke-test.ts` already
   does this properly.
2. **Cron** — prove delivery, not scheduling:
   ```sql
   SELECT status_code, count(*) FROM net._http_response
    WHERE created > now() - interval '20 minutes' GROUP BY 1;
   ```
   Expect 2xx only. `pg_cron` marks a run succeeded when the SQL completes even if the HTTP call
   returns 401 — that is how four legacy jobs stayed broken and invisible.
3. **Email** — an enqueued row reaching `sent` and arriving.
4. **Storage** — an upload and a signed download per bucket; confirm only `branding` is public.
5. **Roles** — no *non-platform* role may hold `BYPASSRLS`:
   ```sql
   SELECT rolname FROM pg_roles
    WHERE rolbypassrls AND rolcanlogin
      AND rolname NOT IN ('postgres','supabase_admin','supabase_etl_admin','supabase_read_only_user');
   ```
   Must return nothing, and `sandbox_exec` must not exist.

   **Corrected 2026-08-18.** This check previously demanded that *no* login role hold
   `BYPASSRLS`. That is wrong: a stock Supabase project ships four that do — `postgres`,
   `supabase_admin`, `supabase_etl_admin`, `supabase_read_only_user` — so the original check
   fails on a perfectly healthy project. The real DEF-031 concern was always an *application*
   role holding the bypass, not the platform's own.
6. **The core journey** — lead → proposal → accept → engagement letter → onboarding → client.

## 8. Only then: retire Lovable

1. Confirm every check in §7.
2. Take a final export (it becomes undownloadable afterwards).
3. **Delete the `database_export_17_08_26` bucket from legacy storage** — it holds an archive
   containing plaintext mailbox and bank tokens.
4. Reduce the local copies of the export (currently three in `~/Downloads`) to one, `0600`,
   never synced.
5. Remove Lovable Cloud. Permanent.

---

## Open decisions blocking completion

| # | Decision | Blocks |
|---|---|---|
| 1 | **Who applies the SQL to London**, and by what route | §2 — everything downstream |
| 2 | **Which email provider** replaces Lovable Email | §5, and therefore user migration |
| 3 | **TrueLayer cadence** — `*/30` (as authored) or hourly | §2 step 3 |
| 4 | **Is all current data genuinely test data?** | Whether anything is seeded at all, and whether §5 gates cutover |
| 5 | **Plaintext provider tokens** — encrypt at rest on London, or accept | §3; an 11-function change if encrypting |
| 6 | **DEF-032** — the ten rulings | The follow-on migration; the baseline carries the contradiction verbatim |
