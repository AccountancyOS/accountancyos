# London canonical baseline

The complete AccountancyOS application schema, derived once from the verified Lovable export and
intended to be applied to the company-owned London Supabase project as a single reviewed
baseline — **not** by replaying the 528 historical migrations.

- **Built:** 2026-08-18
- **Source archive:** `accountancyos_260817.backup`, sha256
  `28420b17557249e92fa61cf685d0f84da432e64208a275c67e212a99d13c5321` (verified independently)
- **Source server:** PostgreSQL 17.6 · producer `pg_dump` 18.4 · read with `pg_restore` 18.6
- **Extraction:** `pg_restore --schema-only --no-owner` — no data; verified zero `COPY`/`INSERT`
- **Output:** `london-baseline.sql`, sha256
  `5894380726c5e41debf421164ab826f02a3f44ccc849eb13cb7cac3d37406d1e` (1.82 MB)
- **Builder:** `build-baseline.py` — deterministic; re-running it on the same archive reproduces
  the file byte for byte
- **Build report:** `build-report.json` — every kept, dropped, surgically-edited and rejected object

---

## ⚠ Do not move this file into `supabase/migrations/`

The legacy Lovable project is still live and its executor applies whatever appears in that
directory. A 226-table baseline landing there would be executed **against the old database**.

`src/test/regression/london-baseline-safety.test.ts` fails the build if any file matching
`baseline` appears in `supabase/migrations/`.

---

## What it contains

Reconciled against the independent read-only capture in `docs/migration/lovable-source/`, which
was taken from the live legacy backend **before** the export existed. Every figure agrees:

| Object | Live capture | Export | Baseline |
|---|---|---|---|
| Tables | 226 | 226 | **226** |
| RLS enabled | 226 | 226 | **226** |
| Functions | 370 | 370 | **370** |
| RLS policies | 688 | 688 | **688** |
| Triggers | 155 | 155 | **155** |
| Indexes | 794 | 506 INDEX + 288 CONSTRAINT | **794** |
| FK constraints | *unreadable* | 622 | **622** |
| CHECK constraints | *unreadable* | 255 inline + 2 separate = 257 | **257** |
| Enum types | *unreadable* | 11 | **11** |
| Views | *unreadable* | 3 | **3** |
| Table/function ACLs | 6,369 grant rows | 599 ACL blocks | **599** |

The index figure is the one that looks wrong and is not: `pg_dump` files constraint-backed
indexes under `CONSTRAINT`, so 506 + 288 = 794 reconciles exactly with the live count.

Also included: 4 extensions (`pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`), 6 default ACLs, and
1 publication-table membership.

## What it deliberately excludes

- **All data.** No rows, Auth users, storage objects, Vault entries or secrets.
- **Platform schemas** — `auth`, `storage`, `realtime`, `pgmq`, `vault`, `extensions`,
  `graphql`, `graphql_public`, `pgbouncer`, `supabase_migrations`. Supabase provisions these;
  re-declaring them fights the platform.
- **Role `sandbox_exec`.** A Lovable platform artefact that carried `BYPASSRLS` and was restored
  out of band three times (DEF-031). It must never exist on London.
- **pg_cron jobs.** They embed credentials and environment URLs. Authored separately,
  credential-free, only after the Vault secret exists.
- **Storage buckets** — now resolved and shipped separately as `london-storage.sql` (below).

### Surgical edits — 256 ACL blocks

229 public ACL blocks granted to `anon`, `authenticated`, `service_role` **and** `sandbox_exec`.
The builder removes only the `sandbox_exec` line and keeps the rest verbatim.

This is the one place the naive approach would have been catastrophic: dropping those blocks
wholesale — the builder's first behaviour — stripped 229 tables of every legitimate grant, which
would have left PostgREST unable to see them and the application dead on arrival with a schema
that looked complete. Four `DEFAULT PRIVILEGES` blocks granted *only* to `sandbox_exec` are
dropped entirely, correctly, since the role will not exist.

---

## 🔴 Two placeholders that MUST be resolved before these objects work

`email_queue_dispatch()` and `email_queue_wake()` hard-coded the legacy function URL. Both now
read:

```
url := 'https://__LONDON_PROJECT_URL__/functions/v1/process-email-queue'
```

The old URL was **not** carried over, deliberately: `net.http_post` is asynchronous, so a
silently-wrong URL fails invisibly — the exact pattern behind DEF-003 and DEF-018. The
placeholder is invalid so it cannot half-work.

Find them after apply with:

```sql
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc LIKE '%__LONDON_PROJECT_URL__%';
```

Note these are a **second, trigger-driven email dispatch path** alongside the `process-email-queue`
cron job. Whether both should exist on London is an open question.

---

## Known contradiction carried verbatim — DEF-032

`public.filings.status` is gated by two CHECK constraints plus a transition trigger whose
combination makes `draft` a **terminal state**: every filing is inserted `draft` and no legal
transition out of it is also CHECK-writable.

It is transcribed here **exactly as it exists on the source**. It is not edited, because editing
it would turn a verifiable transcription into an opinion and void the reconciliation above. It
must be repaired by a follow-on migration once the outstanding rulings are made.

The export corrected two details of the original DEF-032 finding — see
`docs/audits/2026-08-17-def-032-filings-status-investigation.md` §11.

---

## `london-storage.sql` — bucket set RESOLVED

Apply **after** the baseline. 9 buckets + 36 storage policies, self-verifying, transactional.
sha256 `107524646da822b30cc26ddcd098e13792fc8eed1a43f74bb602159e73ad45c9`.

Resolved on 2026-08-18 by reading `storage.buckets` from the export — declarative configuration,
no file or object metadata. **The answer contradicts both prior sources:**

| Bucket | Public | Size limit |
|---|---|---|
| `branding` | **yes** | 2 MB |
| `job-documents` | no | 20 MB |
| `onboarding-documents` | no | platform default |
| `questionnaire-files` | no | platform default |
| `receipts` | no | platform default |
| `filing-documents` | no | platform default |
| `workpaper-files` | no | platform default |
| `invoice-branding` | no | platform default |
| `invoice-pdfs` | no | platform default |

- `infra/supabase-manifest.json` names `email-assets`, `documents`, `filings`, `kyc`. **None of
  them exists.** That manifest section is fiction and should be regenerated, not carried across.
- `client-documents` appears in migration-authored policies but exists on neither the live bucket
  list nor any live storage policy.
- All 36 policies reference only the 9 declared buckets, and no bucket is unreferenced — the set
  reconciles exactly.

**Security note:** a tenth bucket, `database_export_17_08_26`, holds the export itself inside the
legacy project. It is deliberately excluded here, and the archive it contains carries plaintext
mailbox and bank tokens — it should be deleted from legacy storage once the migration completes.

### A toolchain fact that affects whoever restores this

The archive is **zstd-compressed**. Homebrew's `libpq` is built *without* zstd, so its
`pg_restore` reads the schema but reports `no data will be available` and refuses any data
section. `postgresql@17` (17.11) is built `--with-zstd` and reads it correctly. Anyone restoring
this export needs a zstd-capable `pg_restore`, or they will silently get schema and no data.

## Still required before London is usable

The baseline is the schema. It is not the system.

1. **Extensions** — `pg_cron` and `pg_net` must be enabled on the project before any cron work.
2. **Vault secret** for the cron worker, created **before** any job that reads it is scheduled.
3. **Cron jobs** — 13 of them, authored fresh and credential-free.
4. ~~Storage buckets~~ — RESOLVED, apply `london-storage.sql` after the baseline.
5. **Auth configuration** — site URL, redirect allow-list, providers, hooks, email settings.
   None of it is in the schema; see `docs/migration/lovable-source/manual-settings.md` §1.
6. **All 45 secrets**, per the rotation matrix in
   `docs/superpowers/plans/2026-08-17-credential-security.md`.
7. **A replacement email provider.** Lovable Email dies with the migration, and because user
   passwords are not exported, every user must reset — which needs working email *before*
   cutover.
8. **Edge functions** deployed, with `verify_jwt` declared for the seven currently missing from
   `config.toml`.

## Verification once applied

Favour behavioural proof over catalog inspection:

- RLS proven with **two real authenticated users in different organisations**, never through a
  role that could bypass RLS.
- An email enqueued and delivered end to end through the replacement provider.
- Every cron job proven by an actual 2xx delivery, never by a green `pg_cron` run — `pg_cron`
  marks a run succeeded when the SQL completes even if the HTTP call 401s. That is how four jobs
  went unnoticed on the legacy project.
- The placeholder query above returning zero rows.
