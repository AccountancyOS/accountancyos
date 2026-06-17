## Why job creation failed

`public.jobs.chk_jobs_status` only permits 9 canonical statuses:

`blank, records_requested, records_received, accountant_queries, client_queries, accountant_review, client_review, ready_to_file, completed`

`src/components/jobs/CreateJobDialog.tsx` still uses an old vocabulary (`not_started`, `in_progress`, `waiting_on_client`, `with_reviewer`) and defaults to `not_started`, so every manual job-create insert is rejected by the check constraint. That matches the toast in the session replay.

The DB is correct. The UI is wrong, and the regression net has no test asserting UI status options match the DB constraint.

## Fix

### 1. Single source of truth in `src/lib/workflow-constants.ts`
- Inspect the file. If an ordered canonical list already exists, reuse it.
- Otherwise add:
  ```ts
  export const JOB_STATUSES = [
    "blank","records_requested","records_received",
    "accountant_queries","client_queries",
    "accountant_review","client_review",
    "ready_to_file","completed",
  ] as const;
  export type JobStatus = typeof JOB_STATUSES[number];
  ```
- Do not duplicate the list elsewhere.

### 2. Fix `src/components/jobs/CreateJobDialog.tsx`
- Default `status` state → `"blank"`.
- Replace hardcoded `<SelectItem>` list with a map over `JOB_STATUSES`, labelled via existing `formatStatus()` from `@/lib/format-utils`.
- Render all 9 statuses in workflow order.
- No other behavior changes (priority, auto-gen paths, semantics untouched).

### 3. Repo-wide sweep for old vocabulary
Search the entire repo for `not_started`, `in_progress`, `waiting_on_client`, `with_reviewer` in any job creation/update/filter logic (components, services, hooks, edge functions, SQL). For each hit:
- If it writes to `jobs.status` or maps user-visible job status, replace with a canonical value from `JOB_STATUSES`.
- If it is unrelated (e.g. invoice status, payroll, automation execution state), leave it alone and note it.
Produce a short list of touched vs deliberately-skipped occurrences in the final message.

### 4. Regression test
New: `src/test/regression/job-status-vocabulary.test.ts`
- Assert `JOB_STATUSES` deep-equals the 9 canonical values in exact order.
- Assert it contains none of the old values (`not_started`, `in_progress`, `waiting_on_client`, `with_reviewer`).
- Follow the existing `src/test/regression/*` style (Vitest, no service-role usage).

### 5. Smoke-test drift check in `scripts/smoke-test.ts`
Add a check that compares the live DB constraint against `JOB_STATUSES`:
- Try a read-only SQL via the existing smoke pattern: `select pg_get_constraintdef(oid) from pg_constraint where conname='chk_jobs_status'`.
- If the smoke runner cannot execute raw SQL, add a tiny read-only SECURITY DEFINER helper `public.get_check_constraint_values(text)` returning `text[]`, granted to `authenticated`, used only for metadata introspection. No destructive SQL, no schema changes to `jobs`. Migration only added if strictly required for this helper.
- Parse the allowed values, compare as a set to `JOB_STATUSES`, fail loudly with a clear diff on mismatch.

### 6. Documentation
Update `docs/critical-workflows.md` under the Jobs / Deadline-job generation row:
- Add coverage links to `src/test/regression/job-status-vocabulary.test.ts` and the new smoke check.
- Note that manual job creation MUST source statuses from `JOB_STATUSES` in `workflow-constants.ts`.

## Out of scope
- No change to `chk_jobs_status` itself.
- No change to priority values, automation, onboarding, or unrelated job fields.
- No migration unless the read-only metadata helper is required.

## Acceptance
- Manual job creation succeeds; row lands with chosen canonical status, default `blank`.
- Status dropdown shows the 9 canonical statuses in workflow order, with no old values.
- `bun run test` passes including the new regression test.
- `bun smoke` passes including the new constraint-vs-`JOB_STATUSES` check.
- Future drift between DB constraint and `JOB_STATUSES` fails CI before reaching users.
- Repo sweep leaves no legacy status writes in job code paths.
