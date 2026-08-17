# Lovable backend — live-versus-Git drift report

**Source project:** `moxpdejnucjjcplleefn` (legacy, Lovable Cloud)
**Repo HEAD at capture:** `d30a63d363ba29d935611df176f0cd2183a40877`
**Captured:** 2026-08-17, read-only. Nothing was changed in the source project.
**Target project `ezsvdsjdtardkxfswjvq` was not accessed, linked, configured or referenced.**

This report records discrepancies. **It does not fix any of them.**

Every row is labelled by evidence class:
**[LIVE]** read from the running database · **[GIT]** read from the repository ·
**[UNVERIFIED]** could not be established from either.

---

## 1. Executive summary

The backend cannot be rebuilt from this repository. Three independent reasons, any one of
which is sufficient:

1. **The schema is not fully readable.** CHECK constraints, foreign keys, exclusion
   constraints, views, sequences and extensions are invisible through the only connector that
   reaches the source project. DEF-032 is the proof that this matters: `public.filings` carries
   three overlapping CHECK constraints and a transition trigger that no live read can retrieve.
   A privileged `pg_dump --schema-only` is required before any rebuild is attempted.
2. **Significant production infrastructure exists nowhere in git.** Five of thirteen cron jobs
   cannot be reproduced by name from migrations; the storage buckets named in the manifest
   match none of the buckets git actually creates; role `sandbox_exec` is altered by four
   migrations and created by none.
3. **Parts of the product are bound to Lovable-proprietary services** with no Supabase
   equivalent — most consequentially the entire outbound email path.

A fourth finding is not a migration blocker but is a live production defect discovered during
this capture: **four of the thirteen cron jobs have been returning 401 on every run**, so the
chaser engine and bank-feed sync are not working. See §5.

---

## 2. Scale

| Object | Count | Class |
|---|---|---|
| Tables (public) | 226 | [LIVE] |
| Columns | 3,783 | [LIVE] |
| RLS-enabled tables | 226 of 226 (`relforcerowsecurity` false on all) | [LIVE] |
| RLS policies | 688 | [LIVE] |
| Indexes | 794 | [LIVE] |
| Table grants | 6,369 rows (anon, authenticated, postgres, service_role) | [LIVE] |
| Triggers | 155 | [LIVE] |
| Functions (public) | 370, of which 345 SECURITY DEFINER | [LIVE] |
| Cron jobs | 13, all active | [LIVE] |
| Migrations | 528 files, 473 executor-generated names | [GIT] |
| Edge function directories | 62 (61 deployable + `_shared`) | [GIT] |
| Distinct secret names | 45 | [GIT] |

---

## 3. Objects present LIVE but absent from Git

### 3.1 Cron jobs — five of thirteen are not reproducible from migrations

Migrations schedule ten job names. Live runs thirteen. The gap is worse than a count, because
two live jobs exist under names git never uses:

| Live job | Git status | Class |
|---|---|---|
| `dormant-lead-scan-daily` | no `cron.schedule` anywhere in `supabase/migrations/` | [LIVE]/[GIT] |
| `invoice-overdue-scan-daily` | same | [LIVE]/[GIT] |
| `truelayer-sync-hourly` | same | [LIVE]/[GIT] |
| `chaser-tick-every-15min` | git schedules a job named **`chaser-tick`** — a different name | [LIVE]/[GIT] |
| `chaser-trigger-scan-every-6h` | git schedules **`chaser-trigger-scan`** — a different name | [LIVE]/[GIT] |

Rebuilding from migrations therefore produces a *differently named* chaser pair and no
dormant-lead, overdue-invoice or hourly-TrueLayer job at all. Because `cron.schedule` upserts on
job name, the name mismatch would leave the git-named jobs alongside — not replacing — whatever
was created by hand.

**Recommended source of truth: LIVE**, for the job set; but each job must be re-authored as a
migration before the rebuild, not copied (see §5 on their credentials).

### 3.2 Storage buckets — the manifest and git describe different systems

| Source | Buckets | Class |
|---|---|---|
| Migrations create | `branding`, `filing-documents`, `invoice-branding`, `invoice-pdfs`, `job-documents`, `onboarding-documents`, `questionnaire-files`, `receipts` (8) | [GIT] |
| Referenced by RLS policies but created outside git | `client-documents`, `workpaper-files` (2) | [GIT] |
| `infra/supabase-manifest.json` declares | `email-assets`, `documents`, `filings`, `kyc` (4) | [GIT] |
| Live | **unavailable** — `storage.*` is unreachable | [UNVERIFIED] |

**The manifest's four bucket names match none of the ten that git actually references.** The
manifest storage section is not a description of this system. Which set is real cannot be
settled from here; it needs a privileged read of `storage.buckets`.

**Recommended source of truth: neither, until live is read.** Owner decision required.

### 3.3 Role `sandbox_exec`

Four migrations run `ALTER ROLE sandbox_exec … NOBYPASSRLS`; **no migration ever creates the
role.** [GIT] On a clean project those four fail outright.

Its live attributes are **[UNVERIFIED]** — there is no `pg_roles` access through the connector,
and a scan of all 370 live function bodies confirms **none reads `pg_roles`**, so no RPC route
exists either. The last recorded state is a repo record, not a live reading:
`docs/audits/2026-08-06-def-031-platform-escalation.md` has oid 161547 with `rolbypassrls = true`
at 2026-08-06T12:23:21Z.

**Recommendation: do not recreate this role on the target.** It is a Lovable platform artefact,
and DEF-031 exists precisely because platform automation kept restoring `BYPASSRLS` on it.

---

## 4. Objects present in Git but not confirmed LIVE

- **Edge Function deployment state is entirely [UNVERIFIED].** There is no route to the source
  project's deployed function list: the Supabase MCP connector is bound to a different project
  (`vazeqolkxinsjvgzqrgj`), proven by `sandbox_exec` not existing there and every table reading
  zero rows. So for all 61 deployable functions we know what is in git and in config, and
  nothing about what is actually running.
- **`supabase/functions/mcp/index.ts`** is generated build output, is in neither `config.toml`
  nor the manifest, and is the only function file carrying a hard-coded legacy project ref
  (line 523). [GIT]
- **`20260720120000_schedule_process_email_queue.sql`** must never be applied — superseded, and
  it carries the DEF-018 GUC defect. [GIT]

---

## 5. Security-relevant differences

### 5.1 Five cron jobs embed a literal anon JWT in their command text [LIVE]

`chaser-tick-every-15min`, `chaser-trigger-scan-every-6h`, `dormant-lead-scan-daily`,
`invoice-overdue-scan-daily`, `truelayer-sync-hourly` carry a literal JWT in
`cron.job.command` rather than doing a vault lookup. The remaining eight use
`'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')`.

**These tokens must be rotated on migration, never copied.** They are stored in plaintext in a
catalog table.

### 5.2 Four cron jobs return 401 on every run — live defect, not migration drift [LIVE]

`mcp_http_delivery_health(240)` on 2026-08-17: **844 calls, 814 succeeded, 29 unauthorized,
0 server errors.** The 29 attribute exactly by cadence and count:

| Job | Schedule | Runs in window | Auth mechanism |
|---|---|---|---|
| `chaser-tick-every-15min` | `*/15 * * * *` | 16 | literal anon JWT |
| `truelayer-sync-scheduled` | `*/30 * * * *` | 8 | vault bearer, sends **no** `x-cron-secret` |
| `truelayer-sync-hourly` | `7 * * * *` | 4 | `x-cron-secret` from a Vault name that does not exist |
| `chaser-trigger-scan-every-6h` | `0 */6 * * *` | 1 | literal anon JWT |
| | | **29** | |

401 timestamps fall on `:00`, `:07`, `:15`, `:45` — `:07` is unique to `truelayer-sync-hourly`,
and the doubled `13:00:03` is two of them colliding.

Root cause for the TrueLayer pair: `supabase/functions/truelayer-sync-scheduled/index.ts:173-180`
rejects any request whose `x-cron-secret` header does not match `Deno.env.get("CRON_SECRET")`,
as the first statement in the handler. `vault_secret_exists('CRON_SECRET')` returns **false**
[LIVE], so the hourly job sends a null header; the half-hourly job sends no such header at all.

**Consequence: the chaser engine does not run and bank feeds do not sync.** `pg_cron` records
all four as succeeded because `net.http_post` completes — the same invisible-failure pattern as
DEF-018 and DEF-003.

Caveat: attribution is by count and timing, not a per-job join — the projection does not join
responses to job names, and `cron.job_run_details`/`net._http_response` are unreachable. The
count match is exact (29 of 29) and the cadences are unique, so this is strong, but it is
inference. The reasoning about the receiving function is over git HEAD; the deployed body cannot
be read.

Also unassessed: `dormant-lead-scan-daily` (02:00Z) and `invoice-overdue-scan-daily` (06:00Z)
carry the same literal-anon-key pattern but fall outside any window that could be sampled — a
1440-minute request returned only 1,171 rows total against 844 in the preceding four hours,
showing `net._http_response` retention truncates well short of a day.

### 5.3 A literal anon key in the frontend build config [GIT]

`vite.config.ts:7` hard-codes the legacy project ref with an anon-key fallback on line 8. The
value is not reproduced here. It must be replaced, not carried across.

### 5.4 The connector's own reach is a security-relevant limit

`pg_constraint` is unreadable, so **no CHECK or FOREIGN KEY constraint anywhere in this database
was verified live.** Every constraint in `live-schema.sql` is absent, not merely unvalidated.
DEF-032 demonstrates the cost: three overlapping CHECK constraints on one column, mutually
contradictory, invisible to every tool available here.

---

## 6. Definitions that differ

| Item | Git says | Live says | Class |
|---|---|---|---|
| `process-email-queue` cadence | `* * * * *` (manifest, post-2026-08-17) | `* * * * *`, jobid 86 | agree [LIVE] |
| `process-email-queue` cadence | "every 5 seconds" (`docs/supabase-infrastructure.md`) | impossible — pg_cron has one-minute granularity | doc is wrong [GIT] |
| Chaser job names | `chaser-tick`, `chaser-trigger-scan` | `chaser-tick-every-15min`, `chaser-trigger-scan-every-6h` | differ [LIVE]/[GIT] |
| Storage buckets | 10 across migrations + policies | manifest names 4 unrelated ones | differ [GIT] |
| Email provider | "Lovable Email API" (docs) | Lovable npm packages imported | agree, and is the problem [GIT] |
| Redirect allow-list | docs mandate keeping `accountancyos.lovable.app` | unavailable | [UNVERIFIED] |

### Edge function registration mismatches [GIT]

- In `config.toml` but **not** the manifest (8): `ch-officers`, `generate-invoice-pdf`,
  `gmail-exchange`, `onboarding-fetch-ch-officers`, `outlook-exchange`, `portal-pay-invoice`,
  `portal-verify-invoice-payment`, `send-invoice`.
- In the manifest but **not** `config.toml` (6): `automation-dry-run`,
  `clone-workpaper-template`, `gdpr-data-deletion`, `gdpr-data-export`, `portal-qa-probe`,
  `seed-portal-test-users` — these deploy with the platform default `verify_jwt`, which is not
  declared anywhere.
- In neither: `mcp`.
- The manifest lists `handle-email-unsubscribe` **twice**.
- No `verify_jwt` value disagrees where both sources declare one.

### Secret-name drift [GIT]

- Five manifest `requiredSecrets` are read by no function: `COMPANIES_HOUSE_API_KEY`,
  `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`. The
  code actually reads `CH_PROD_API_KEY`/`CH_TEST_API_KEY`, `GOOGLE_*` and `MICROSOFT_*`.
- Twenty-five names read in code are absent from `requiredSecrets`.

So the manifest would pass a completeness check while five of the secrets it names do not exist
and twenty-five that are actually required go unchecked.

---

## 7. Lovable-only infrastructure with no Supabase equivalent

| Item | Where | Consequence |
|---|---|---|
| `npm:@lovable.dev/email-js`, `npm:@lovable.dev/webhooks-js` | `auth-email-hook`, `process-email-queue` | **The entire outbound email path must be rewritten** against a real provider. This is the largest single piece of migration work. |
| Lovable Email API as transport | same | Needs a replacement provider, domain verification, SPF/DKIM, and a new auth send-email hook. |
| `@lovable.dev/cloud-auth-js`, `@lovable.dev/mcp-js`, `lovable-tagger`, `mcpPlugin()` | frontend build | Frontend build and auth client coupling. |
| `*.lovable.app` / `*.lovableproject.com` trusted in CORS | `accept-portal-invite-signup`, `portal-pay-invoice`, `stripe-checkout`, `onboarding-stripe-checkout` | Allow-lists must be rewritten to the real domain; leaving them is an open origin. |
| `sandbox_exec` | live role | Platform-managed. Do not recreate. |
| Executor re-timestamping | 473 of 528 migrations | Migration identity is not stable; the receipt convention exists to compensate and will no longer be needed. |

---

## 8. Historical migrations that cannot be replayed safely

Of 528 migrations [GIT]:

| Flag | Count | Note |
|---|---|---|
| Executor-generated filename | 473 | Only 55 have a descriptive slug |
| Schedules cron | 17 | Target the legacy project URL |
| References the legacy project ref | 13 | Hard-coded `moxpdejnucjjcplleefn` URLs |
| References `sandbox_exec` | 11 | Grants or role changes |
| Creates or alters a role | 4 | All `ALTER ROLE sandbox_exec … NOBYPASSRLS`; the role is never created in git, so all four fail on a clean project |

**Recommendation: do not replay history.** Build the target from a privileged schema dump of the
source, taken once, reviewed, and committed as a single baseline migration. Replaying 528
migrations reproduces every defect this programme has spent a month repairing — including
DEF-032's three overlapping constraints, which were *created* by exactly this
add-another-constraint-under-a-new-name pattern.

---

## 9. Items requiring owner decisions

1. **Produce the Lovable project data export.** Per Lovable's advanced-settings documentation
   (read 2026-08-17), *Export project data* "contains your full database, both structure and
   data". That is the privileged schema capture this pack could not take, and it needs no
   Management API token — it closes CHECK/FK/exclusion constraints, views, sequences, extensions
   and the true row counts in one step.

   **Its exclusions are the real constraint.** The export explicitly omits **storage files,
   edge functions, secrets and user passwords**, and is capped at **5 GB with one export per
   24 hours**. Edge functions and secret names are already covered by git and this pack;
   storage and passwords are not. Note also that the database size is unavailable here, so
   whether the export fits under 5 GB is **unverified**.

   Three hard sequencing constraints follow, and they are not reversible:
   - The export **cannot be downloaded after Lovable Cloud is removed**, and removal
     "permanently deletes your Cloud instance and cannot be undone". Export and verify the
     target before removing anything.
   - **User passwords do not migrate**, so every Auth user must reset. The reset email runs
     through Lovable Email, which dies with the migration — so the replacement email provider
     must be live and tested on the target **before** cutover, or no one can log in. If the
     "all current data is test data" premise holds this is moot; confirm it (decision 7).
   - Storage files move separately, and the bucket list itself is still unresolved (§3.2).

   Lovable states there is **no one-click transfer** from Cloud to Supabase, so every step here
   is manual and must be scripted and verified.
2. **Baseline strategy** — single reviewed schema dump (recommended, §8) versus replaying 528
   migrations.
3. **Storage buckets** — which set is real: the manifest's four, or the ten git references?
4. **Email provider** — what replaces Lovable Email, and does the auth send-email hook move with
   it?
5. **The TrueLayer job pair** — two jobs call one function with two different auth mechanisms and
   both currently 401. Which is canonical, should both exist, and does the cron secret live in
   the Vault or in Edge Function env?
6. **The chaser jobs** — same 401 question, and whether the git names or the live names are
   canonical.
7. **Data migration** — the brief states all current data is test data. Confirm, because it
   determines whether Auth users, storage objects and rows move at all, or whether the target is
   seeded deterministically from fixtures.
8. **`sandbox_exec`** — confirmed not to be recreated on the target.
9. **Manifest ownership** — it currently misdescribes storage, five secret names and (until
   2026-08-17) most cron names. It should be regenerated from the target once built, rather than
   carried across.

---

## 10. What this report is not

It is evidence, gathered read-only on one day, through a connector that reaches only the
`public` schema of the source project. It has not been validated against a privileged dump, and
until it is, absence of an object here means *not readable*, never *not present*.
