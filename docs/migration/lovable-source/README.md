# Lovable backend — migration evidence pack

## Purpose and scope

An authoritative, security-sanitized record of the **legacy Lovable Cloud backend** so another
engineer can build a clean, company-owned Supabase project and independently verify it.

This pack is **evidence, not a deployment artefact.** Nothing here should be executed against
any project as-is. `live-schema.sql` in particular is a partial snapshot and is explicitly
**not** a rebuild script — see Known limitations.

- **Inspection date:** 2026-08-17
- **Legacy (source) project ref:** `moxpdejnucjjcplleefn`
- **Repo HEAD at capture:** `d30a63d363ba29d935611df176f0cd2183a40877`
- **Target project:** stated as `ezsvdsjdtardkxfswjvq` (London). **It was not accessed, linked,
  configured, deployed to, or referenced in any generated file.**

## Methodology — read-only

Every live fact came from read-only catalog projections over the source project's `public`
schema, through the Lovable database connector:

`db_schema` (tables and columns) · `catalog_rls_status` · `catalog_policies` ·
`catalog_indexes` · `catalog_grants` · `catalog_triggers` · `catalog_cron` ·
`catalog_functions` (with `pg_get_functiondef`) · plus two read-only RPCs,
`vault_secret_exists` (secret **presence** by name, never a value) and
`mcp_http_delivery_health` (aggregate HTTP response counts).

Git-side facts came from reading the repository. Every claim in this pack is labelled
**[LIVE]**, **[GIT]** or **[UNVERIFIED]**.

**No DDL, migration, repair, seed, insert, update, delete, truncate or role change was issued.**
No Auth user, storage object, queue, cron job, Vault entry, function, secret or configuration
value was modified.

## Security and redaction rules applied

- No database rows, Auth users, passwords, refresh tokens, storage files, API keys, OAuth
  secrets, tax identifiers, client names, email addresses or document contents were copied.
- Secret and Vault entries are recorded **by name only**, with present/missing status where it
  could be verified without reading a value.
- Five cron commands embedded a literal anon JWT; each was replaced with `[REDACTED]` while
  preserving the surrounding structure so the mechanism stays legible.
- `live-schema.sql` was verified to contain no `CREATE ROLE sandbox_exec`, no
  `ALTER ROLE sandbox_exec`, no `GRANT … TO sandbox_exec`, no `BYPASSRLS`, no hard-coded project
  URL, and no bearer token, JWT, service-role key, password or connection string.
- The legacy project ref appears only where it identifies the source (this README, the inventory
  metadata, the drift report). It is never an executable URL in the SQL snapshot.
- The string `service_role` appears only as a **role name** or a secret **name**, never a value.

## Files produced

| File | What it is |
|---|---|
| `README.md` | This file. |
| `live-inventory.json` | Machine-readable inventory: tables, columns, indexes, policies, RLS status, grants, triggers, function metadata, cron jobs, secret names, and an explicit `unavailable` list. Stable ordering so future runs diff meaningfully. |
| `live-schema.sql` | Sanitized, schema-only SQL snapshot of what could be read. **Partial — see limitations.** |
| `drift-report.md` | Live-versus-Git discrepancies, Lovable-only infrastructure, security-relevant differences, migrations that cannot be replayed, and the decisions the owner must make. |
| `manual-settings.md` | Everything that cannot be reconstructed from schema SQL: Auth config, OAuth registrations, Stripe webhooks, Vault and Edge Function secret names, storage, project settings. |
| `data-summary.json` | Counts only. No record contents, no personal data. |
| `checksums.json` | SHA-256 of every file above. |

## What was inventoried

226 tables · 3,783 columns · 226 RLS-enabled tables · 688 policies · 794 indexes ·
6,369 table grants · 155 triggers · 370 functions (345 SECURITY DEFINER) · 13 cron jobs ·
528 migrations · 62 Edge Function directories · 45 secret names.

## Known limitations — read before trusting this pack

**The pack is incomplete, and the gaps are structural rather than accidental.** The connector
that reaches the source project is scoped to the `public` schema, and the Supabase MCP connector
available here is bound to a **different** project (`vazeqolkxinsjvgzqrgj`) — proven, because
`sandbox_exec` does not exist there and every table reads zero rows. So there is no privileged
route to the source.

Consequently the following are recorded as `unavailable`, never guessed:

- **CHECK, FOREIGN KEY and exclusion constraints** — no `pg_constraint` access. This is the most
  serious gap. DEF-032 shows why: `public.filings.status` carries three overlapping CHECK
  constraints plus a transition trigger, mutually contradictory, and none of them is retrievable
  live.
- **Roles, including every `sandbox_exec` attribute** the brief asks to be evidenced. No
  `pg_roles` access, and a scan of all 370 live function bodies confirms **none** reads
  `pg_roles`, so no RPC route exists either. The only record is a repo note from 2026-08-06.
- Views and materialized views · sequences and identity ownership · extensions · non-public
  schemas · event triggers · publications and Realtime membership · default privileges ·
  column-level and function-level grants.
- **All Auth configuration**, and the Auth user count.
- **All storage** — buckets, policies, object counts, sizes.
- **Edge Function live deployment state**, so git cannot be reconciled against what is running.
- pgmq queues · database size.
- **Row counts.** Any count through this connector is RLS-scoped and undercounts — demonstrated
  on 2026-08-17, when a `status='pending'` filter on `email_queue` returned zero rows while the
  executor's unrestricted count reported one.

**Most of this is closed by Lovable's own export.** Its advanced-settings documentation (read
2026-08-17) states that *Export project data* "contains your full database, both structure and
data" — which supplies the constraints, views, sequences and extensions missing here, with no
Management API token required. It explicitly excludes **storage files, edge functions, secrets
and user passwords**, is capped at **5 GB / one export per 24 hours**, and is **not downloadable
once Lovable Cloud is removed**. Auth configuration, storage and project-level settings still
need a Dashboard capture. See `manual-settings.md` §10 for the sequencing constraints, including
the password/email trap that must be solved before cutover.

Until that export exists, absence of an object from this pack means *not readable*, never
*not present*.

## Fidelity caveats in `live-schema.sql`

- **Three function bodies were sanitized** — `email_queue_dispatch`, `email_queue_wake` and
  `redact_secrets`. Source-project URLs, `'Bearer '` header-prefix literals (concatenated with a
  runtime vault lookup, so no token value ever existed in them) and a JWT-prefix inside
  `redact_secrets`'s own regexp were replaced with bracketed placeholders. Each is marked
  `*** SANITIZED-BODY ***` and carries its **pre-sanitization** `definition_hash`, so the
  original is identifiable. Those three bodies are not executable as printed. The other 367 are
  verbatim.
- **Enum and array column types are partly inferred.** 12 of 14 user-defined types and 17 of 20
  array element types were derived from the column's default cast; the remaining 2 and 3 are
  emitted as `USER_DEFINED_TYPE_UNAVAILABLE` / `ARRAY_ELEMENT_TYPE_UNAVAILABLE[]`. **No
  `CREATE TYPE` statement exists in the file** — the type definitions themselves were not
  readable.
- Grants are collapsed from 6,369 catalog rows into 910 `GRANT` statements.
- The 253 `INSERT INTO` and 7 `auth.users` occurrences in the file are all **inside PL/pgSQL
  function bodies** (application logic), not data rows. No data row, Auth user or storage object
  is present.

## Live defects found during capture

Recorded because they were discovered here, **not repaired** — this was a read-only exercise:

1. **Four of thirteen cron jobs return 401 on every run**, so the chaser engine does not run and
   bank feeds do not sync. Evidence and attribution in `drift-report.md` §5.2.
2. **Vault secret `CRON_SECRET` does not exist**, yet live job `truelayer-sync-hourly` reads that
   exact name for its `x-cron-secret` header.
3. **Five cron jobs carry a literal anon JWT in plaintext** in `cron.job.command`. Those tokens
   must be rotated on migration, not copied.

## Repository test state at capture

`npx vitest run` — **914 passed, 0 failed, 89 files.** `npx tsc --noEmit` — clean.
No pre-existing failures to record, and no test was changed to produce this result.

## Confirmation

- The source project was treated as read-only throughout. **No mutation of any kind occurred.**
- The target project `ezsvdsjdtardkxfswjvq` was **not** accessed, linked, configured, deployed
  to, or written into any generated file.
- **No secret value and no record content was committed.**
