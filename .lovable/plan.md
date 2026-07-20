## Short answer

Yes — very likely. A file-vs-database diff (allowing ±120 s for the small clock skew between the filename timestamp and the recorded `schema_migrations` version) shows **~87 migration files** in `supabase/migrations/` with no matching row in `supabase_migrations.schema_migrations`. The just-fixed `process-email-queue` cron migration is one of them; the same "authored but never approved/executed" pattern applies to the rest.

Some of those 87 will be *false positives* — a later consolidated migration created the same object, so the object exists in the DB even though the specific file was never approved. Others will be *real gaps* where the object simply doesn't exist and a feature is silently broken (exactly the mode we hit with the email cron).

Until each one is checked against the live schema we can't tell which is which just from the diff.

## What I'll do

1. **Produce the full unapplied list** (`docs/audits/unapplied-migrations.md`) — the 87 file versions, each with its filename, one-line purpose (parsed from the SQL header/first CREATE/ALTER statement), and the objects it touches (table / function / policy / cron / trigger / grant).

2. **Classify each entry** by probing the live DB for the objects it should have created:
   - `TABLE` / `COLUMN` → `information_schema`
   - `FUNCTION` → `pg_proc`
   - `POLICY` → `pg_policies`
   - `TRIGGER` → `pg_trigger`
   - `cron.schedule` → `cron.job`
   - `GRANT` → `information_schema.role_table_grants`

   Bucket into:
   - **A. Superseded** — object exists, created by a later migration. No action, just record.
   - **B. Genuinely missing** — object absent. Needs re-apply.
   - **C. Needs manual review** — file mutates data, drops/renames, or edits an object that has since been re-defined. Diff by hand before re-applying.

3. **Prioritise Bucket B** by feature area (email, cron, automation, portal, filing, security). Anything cron/security/RLS-related gets flagged as P0 because the failure mode is silent (same as the email cron).

4. **Fix plan per bucket-B entry**: for each, either
   - re-issue the original file through the migration tool (if still safe and idempotent), or
   - author a small "reconciliation" migration that creates only the missing objects (safer when the original file is no longer idempotent against the current schema).

5. **Add a standing guardrail** so this can't silently recur:
   - New Vitest regression test `src/test/regression/migration-application-drift.test.ts` that reads the file list from `supabase/migrations/`, queries `supabase_migrations.schema_migrations`, and fails if any file has no applied version within ±120 s. Runs in CI on every push.
   - Extend `scripts/smoke-test.ts` with the same check so `bun smoke` catches drift against Live post-publish (this is the "Test-approved ≠ Live-approved" gotcha you flagged).
   - Add a short entry to `docs/change-checklist.md` §3 ("Migration Safety") requiring the author to confirm the approval card returned green before closing the change.

## Deliverables

- `docs/audits/unapplied-migrations.md` — full audit with A/B/C classification and remediation owner per row.
- One or more reconciliation migrations for bucket B (batched by feature area, each idempotent).
- `src/test/regression/migration-application-drift.test.ts` + smoke-test extension.
- Updated `docs/change-checklist.md`.

## Technical details

- Diff basis: filename timestamp vs `supabase_migrations.schema_migrations.version` with a 120-second tolerance to absorb the small clock skew Lovable introduces when it records the applied version (observed: file `20251125162929` → applied `20251125162931`, i.e. ~2 s). Anything outside that window is treated as unapplied.
- Current head of `schema_migrations` is `20260720110128`; every file from `20260720120000` onward is unapplied by definition. Earlier gaps are the ones that need the object-existence probe to classify.
- No changes to `supabase/config.toml` — auto-generated.
- Reconciliation migrations will use `IF NOT EXISTS` / `CREATE OR REPLACE` / `DO $$ ... $$` guards so re-running against a partially-fixed DB is safe.
- Verification pattern I'll adopt from this point onward (per our working agreement): after any migration is authored, query `schema_migrations` for the exact version and, for the primary object it creates, query the relevant catalog to prove it exists. Report both back before saying "done".
