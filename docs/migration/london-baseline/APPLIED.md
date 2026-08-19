# London build record — what was actually applied

**Project:** `ezsvdsjdtardkxfswjvq` (AccountancyOS, `eu-west-2`, PostgreSQL 17.6.1.155)
**Built:** 2026-08-18
**Source:** `accountancyos_260817.backup`, sha256 `28420b17…3c5321`, verified independently.
**The legacy project `moxpdejnucjjcplleefn` was not modified at any point.**

---

## 1. London was not a blank project

The identity guard run before any write found the project **already populated** — and stopped.
It held a stale replay of the old migration history ending **2026-06-03**:

| | Stale build | Baseline target |
|---|---|---|
| Tables | 210 | 226 |
| Functions | 217 | 370 |
| Policies | 600 | 688 |
| Buckets | 6 | 9 |
| Migration ledger | 212 rows, Nov 2025 – Jun 2026 | — |

It also ran **three cron jobs**, all broken:

- `process-email-queue` — POSTing to **`moxpdejnucjjcplleefn.supabase.co/functions/v1/send-email`**,
  i.e. the *legacy* project, every minute, with a bearer token.
- `sync-gmail-emails` and `sync-outlook-emails` — both using
  `current_setting('app.settings.supabase_url')`, the DEF-018 GUC defect, so both failed every run.

All three were unscheduled first, stopping the cross-project traffic. The rebuild was then
approved on the evidence that the project held **0 auth users, 0 storage objects** and only 117
rows of product reference data. `public` was dropped and recreated.

## 2. Final verification — every dimension matches the source exactly

| Object | Export | London | |
|---|---|---|---|
| Tables | 226 | **226** | ✓ |
| Views | 3 | **3** | ✓ |
| Functions | 370 | **370** | ✓ |
| Enum types | 11 | **11** | ✓ |
| Indexes | 794 | **794** | ✓ |
| RLS-enabled tables | 226 | **226** | ✓ |
| RLS policies | 688 | **688** | ✓ |
| Triggers | 155 | **155** | ✓ |
| FK constraints | 622 | **622** | ✓ |
| CHECK constraints | 257 | **257** | ✓ |
| Primary keys | 226 | **226** | ✓ |
| Unique constraints | 62 | **62** | ✓ |
| Comments | 45 | **45** | ✓ |
| Storage buckets | 9 | **9** | ✓ |
| Public buckets | 1 (`branding`) | **1** | ✓ |
| Storage policies | 36 | **36** | ✓ |
| Reference-data rows | 232 | **232** | ✓ |

Negative checks also pass: `rls_missing` = 0 (no public table lacks RLS), `sandbox_exec` does
not exist, `unresolved_placeholders` = 0, `auth_users` = 0, `cron.job` = 0 (deliberately —
see §6).

Grants: anon 1560; authenticated, service_role and postgres 1603 each.

## 3. How it was applied

`apply_migration` takes SQL as a tool argument, so any single apply is capped at roughly 55 KB.
The 1.82 MB baseline was therefore split into **39 dependency-ordered chunks** and applied by
subagents, with counts re-verified after each. Every chunk carries pg_dump's full session
preamble. All 39 chunks were checked for balanced dollar-quoting first, so no function body was
split across a boundary.

Ledger: the **212 stale rows were purged**. They described a schema that no longer existed, and
would have made a future `supabase db push` skip everything up to `20260603202302` and then apply
~300 repo migrations on top of a baseline that already contains their effects. The ledger now
holds only the 46 rows from this build.

## 4. Defects found by applying for real

Each was caught because an agent reported the exact error and stopped rather than retrying with
modified SQL. Nothing was ever half-applied — `apply_migration` is transactional.

1. **`CREATE EXTENSION pg_cron` aborts the migration.** Supabase's `after-create.sql` hook fails
   with `2BP01: dependent privileges exist` when the extension already exists. All four required
   extensions were already installed, so the baseline now *asserts* rather than creates them.
2. **Dropping pg_dump's preamble broke function creation.** The builder had replaced it with a
   custom header, discarding `SET check_function_bodies = false`. These dumps are dependency-sorted
   and rely on it so a `LANGUAGE sql` function can forward-reference a later table; without it the
   first `CREATE FUNCTION` failed `42P01`.
3. **`pgmq` was missing and is required.** Five baseline functions — `enqueue_email`,
   `read_email_batch`, `delete_email`, `move_to_dlq`, `email_queue_dispatch` — address
   `pgmq.q_auth_emails` and `pgmq.q_transactional_emails` **by name**. PL/pgSQL bodies are not
   validated at creation, so all five would have installed cleanly, passed every structural check,
   and failed at runtime. The entire outbound email path, broken and invisible. Extension enabled
   and both queues created.
4. **Grants preceded views.** `p7_grants_04` referenced `bank_connections_safe` before the views
   existed. Views applied first, then the grants.
5. **`ALTER DEFAULT PRIVILEGES` needs a role we do not hold** — see §5.
6. **A migration-ledger version collision.** Two concurrent agents claimed the same timestamp
   second, so the bookkeeping insert violated the primary key and rolled the whole migration back.
   Not a SQL fault; resolved by re-applying once the ledger was quiet.
7. **Stray tables inside the function chunks** caused a `42P07` collision when the table chunks
   were rebuilt. Fixed by regenerating all 226 `CREATE TABLE` statements with `IF NOT EXISTS`,
   making re-application idempotent.
8. **`COPY … FROM stdin` cannot be applied through the management API.** The seed was originally
   extracted in pg_dump's native COPY text format and failed with
   `42601: syntax error at or near "a0000000"` on the first data row. COPY-from-stdin is a **psql
   client-side protocol**: the server parses the `COPY` statement, never enters copy-in mode, and
   then reads the first tab-separated data row as bare SQL. Nothing was committed. The seed was
   re-expressed as `INSERT … ON CONFLICT DO NOTHING`, unescaping COPY text-format sequences
   (`\t`, `\n`, `\\`, `\N` → NULL) and re-quoting each value.

   **This generalises:** any data restored into this project through the management API — rather
   than through `psql -f` — must be in INSERT form. Worth knowing before anyone tries to move
   real data.

## 4a. Edge Functions — 60 deployed

All 60 deployable functions are deployed and ACTIVE at version 1. **`mcp` is deliberately
excluded** — it is generated build output and Lovable-specific, with no role on London.

`verify_jwt` was set from `supabase/config.toml` (54 declared there). The 6 absent from it —
`automation-dry-run`, `clone-workpaper-template`, `gdpr-data-deletion`, `gdpr-data-export`,
`portal-qa-probe`, `seed-portal-test-users` — were deployed `true`, which matches the platform
default they previously ran under, so behaviour is unchanged.

### Three deployment findings

1. **`_shared` imports need a nested layout.** The platform roots uploaded files under `source/`,
   so `../_shared/…` escapes the upload tree and the bundle fails with `Module not found`. The
   fix is to upload the entrypoint as `<name>/index.ts` with `_shared/` alongside. Six agents hit
   this independently and all converged on the same solution; no source was modified. Affects
   `truelayer-auth`, `truelayer-callback`, `truelayer-sync`, `truelayer-sync-scheduled`,
   `sla-check`, `session-cleanup`, `hmrc-vat-submit`, `auth-email-hook`.
2. **Transitive `_shared` dependencies are easy to miss.** The dependency scan only read
   `index.ts`, so it missed that `_shared/hmrc-auth.ts` itself imports `_shared/logging.ts`.
   `hmrc-vat-submit` failed to bundle until that second file was included.
3. **A transcription corruption occurred and was caught.** One agent emitted `8&&` instead of
   `&&`; the bundler rejected it and it redeployed from source. This is the reason for §4b.

## 4b. Deployed source verified against the repo

Deploying by transcribing source through a tool argument carries a real risk: **a bundler catches
syntax corruption but not semantic corruption.** A mistyped URL, numeric constant or string
literal would deploy cleanly and fail only in production. So every deployed function was fetched
back with `get_edge_function` and diffed against its repo source (trailing whitespace normalised;
nothing else), with byte and line counts compared to catch truncation.

**Result: all 60 verified, no drift found.** Every deployed function is identical to its repo
source, including the largest (`generate-filing-pdf`, 51,674 bytes), the MD5 constant tables in
`hmrc-ct-delete`/`hmrc-ct-poll`, and `process-email-queue` (byte-exact).

The constant tables got more than a diff: the 67-entry table was extracted from both copies and
the `md5HashSync` implementation was run against Node's `crypto` across eight vectors including
the 55/56/64-byte boundary cases — so they are proven functionally correct, not merely textually
equal.

A methodological caveat worth recording, because it cuts both ways: having an agent *retype*
fetched source into a file is itself a transcription step. Several agents reported small byte
deltas that proved to be their own retyping artefacts rather than deployment drift — each was
traced line-by-line to specific trailing-whitespace lines present on both sides, not waved
through. One agent also raised a false alarm on the MD5 tables because it had recalled an
expected hash wrongly from memory, and cleared it by recomputing mechanically.

The stronger route is mechanical extraction from the raw tool result with no retyping at all.
That was used where the harness saved results to a file — including `generate-filing-pdf`,
`hmrc-ct-submit` and the entire `auth-email-hook` bundle. Where results came back inline the
mechanical path was unavailable, so that evidence is retyped-and-reconciled rather than
byte-exact. It is recorded as such rather than presented as stronger than it is.

**The `auth-email-hook` bundle was verified in full**, not just its entrypoint. All six
`_shared/email-templates/*.tsx` files and `deno.json` are byte-for-byte identical to the repo,
confirmed by `cmp` and MD5 with no retyping in the loop (the raw tool result was parsed
mechanically). The bundle contains exactly eight files — index.ts, deno.json and the six
templates — with nothing extra on either side.

This one was worth doing rather than assuming. Because passwords do not survive the migration,
**every user will pass through `recovery.tsx`**, and its `confirmationUrl` is now proven
unchanged by byte equality rather than by eye. `reauthentication.tsx` renders `{token}`
unchanged on the same evidence.

## 5. Known deviations — action required

**`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` could not be applied.** The connection is
`postgres`, which is not a member of `supabase_admin`, so the twelve statements targeting that
role failed with `42501`. The twelve `FOR ROLE postgres` equivalents **were** applied and are
confirmed in `pg_default_acl`.

This matters because **`DROP SCHEMA public CASCADE` destroyed Supabase's platform default
privileges** along with the stale schema. Without them, objects created in `public` in future do
not automatically grant to `anon`/`authenticated`/`service_role` — a silent divergence from a
stock project that would surface only when a later migration adds a table.

To close it, run as `supabase_admin` from the dashboard SQL editor:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
```

## 6. Deliberately NOT done

- **No cron jobs scheduled.** `london-cron.sql` is authored but requires the two Vault secrets
  (`cron_service_role_key`, `cron_shared_secret`) first, and it refuses to apply without them.
- **No secrets set** and no Auth configuration. The 60 deployed functions therefore cannot work
  yet — that is expected, not a defect. See `SECRETS.md` for the 31 that must be set (three more
  are injected by Supabase automatically and must NOT be set by hand).
- **No users, no tenant data.** The seed carries product reference data only.
- **The legacy project is untouched and still live.** Nothing has been cut over.

## 7. What the schema still carries, unchanged and deliberately

**DEF-032.** `public.filings.status` is gated by two CHECK constraints plus the
`filing_status_transition_check` trigger, whose combination makes `draft` a terminal state. It is
transcribed exactly as it exists on the source. Editing it during baselining would have turned a
verifiable transcription into an opinion and voided the reconciliation above. It needs a follow-on
migration once the ten rulings in
`docs/audits/2026-08-17-def-032-filings-status-investigation.md` are made.
