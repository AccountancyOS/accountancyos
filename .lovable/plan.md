## Goal
Clean-apply all pending Supabase migrations, identify the first failure, fix it, and report on the rest.

## Steps

1. **Inventory pending migrations**
   - List `supabase/migrations/` and compare against `supabase_migrations.schema_migrations` in the live DB via `supabase--read_query` to determine which versions have not been applied.

2. **Replay pending migrations in order**
   - For each unapplied migration (oldest first), read the SQL and re-issue it via `supabase--migration`.
   - Stop at the first hard failure. Capture the exact error (SQLSTATE, message, offending statement).

3. **Diagnose & fix the first failure**
   - Inspect the offending object (table/function/trigger/policy) with `supabase--read_query` to understand the drift between SQL and live schema (e.g. wrong column name, missing dependency, duplicate object, ordering).
   - Author a corrective migration: either patch the failing SQL (idempotent `CREATE OR REPLACE`, `IF NOT EXISTS`, column rename) or split it so the rest of the chain can apply.
   - Apply the fix via `supabase--migration`.

4. **Continue the chain**
   - Re-run the remaining pending migrations one by one until either all apply cleanly or another distinct failure surfaces.
   - For any further failures, stop and report — per the request, only the first failure is fixed in this pass.

5. **Verify**
   - Re-query `schema_migrations` to confirm new versions are recorded.
   - Run `supabase--linter` to surface any new warnings introduced.
   - Spot-check the two known-broken paths (quote acceptance trigger `tg_quote_accepted_activate_canonical`, deadline trigger `tg_job_canonical_generate_deadlines`) still have correct `audit_log` column names after the replay.

## Report back
- Total pending found, applied, skipped.
- First failure: file, statement, error, fix applied.
- Any subsequent failures still outstanding (with suggested next fix).
- Confirmation that the recent quote-acceptance trigger fix is intact.

## Notes
- No application code will change — DB-only.
- Migrations are replayed via the migration tool so the user approves each SQL batch.
- Idempotency: prefer `CREATE OR REPLACE` / `IF NOT EXISTS` / guarded `DO $$` blocks when re-issuing to avoid duplicate-object errors on partially-applied versions.
