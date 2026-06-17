# Change Checklist

**Every** change (feature, bugfix, refactor, migration, edge function) must complete this checklist before merge. Skipping a box requires a written justification in the PR description.

## 1. Impact Analysis
- [ ] Listed every workflow from [`critical-workflows.md`](./critical-workflows.md) this change touches (write "none" if none).
- [ ] Identified blast radius: which tables, edge functions, cron jobs, and frontend routes are affected.

## 2. Tests
- [ ] Added or updated Vitest tests covering the change.
- [ ] `bun test` runs green locally.
- [ ] For RLS or queue work: extended `scripts/smoke-test.ts` if a new invariant is introduced.

## 3. Migration Safety
- [ ] Migration is idempotent (`IF NOT EXISTS`, `ON CONFLICT`).
- [ ] Backfill plan documented if existing rows must be updated.
- [ ] RLS still enforced on every new public-schema table (with required `GRANT` block).
- [ ] No `ALTER DATABASE` statements.

## 4. Security
- [ ] No `USING (true)` policies on tenant-scoped tables.
- [ ] Anon role only granted on truly public tables.
- [ ] Edge functions validate JWTs in code (`getClaims`) when `verify_jwt = false`.
- [ ] No secrets, tokens, service-role keys in logs or response bodies.

## 5. Edge Functions
- [ ] New functions registered in `infra/supabase-manifest.json#edgeFunctions`.
- [ ] Deployed via `supabase--deploy_edge_functions`.
- [ ] `verify_jwt` setting matches the manifest entry.

## 6. Email / Auth Hook (if touched)
- [ ] `email_send_log` shows a row reaching `sent` after a manual trigger.
- [ ] `auth-email-hook` invocation visible in edge logs after the trigger.
- [ ] Redirect URL allow-listed in Supabase Auth config.

## 7. Smoke Test
- [ ] `bun smoke` runs green against the deployment, or the failing checks are explicitly waived in the PR.

## 8. Documentation
- [ ] `critical-workflows.md` updated when behaviour or state machine changes.
- [ ] `supabase-manifest.json` updated when infrastructure expectations change.
- [ ] User-facing release notes added when shipping a workflow change.