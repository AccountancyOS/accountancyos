# Job Workspace — Increment 1 (Structure & Header)

Scope of THIS increment only. Full spec: `docs/briefs/2026-07-20-job-workspace-refinement-brief.md`.
Do NOT do the tab-content merges (Records→Documents, Questionnaire→Overview, Audit→Timeline) or
the Overview tab — those are Increments 2/3/5. Reuse existing data; add NO parallel status model.

## Deliverables

1. **Pure model `src/lib/job-workflow-model.ts` (+ test, TDD first).**
   - `jobs.status` domain (mirror `src/lib/job-status-service.ts` `JobStatus`):
     `blank | records_requested | records_received | accountant_queries | client_queries |
      accountant_review | client_review | ready_to_file | completed`.
   - **Transition map mirrored EXACTLY** from the DB trigger `validate_job_status_transition()` in
     `supabase/migrations/20260408203205_*.sql` (read it; the allowed transitions are authoritative).
     A wrong target status silently fails the trigger — byte-faithful mirroring matters.
   - `STAGE_LABEL: Record<JobStatus,string>` — human-readable stage names (e.g. `records_requested`
     → "Awaiting client records", `accountant_review` → "In preparation / review", `ready_to_file`
     → "Ready to file", `completed` → "Complete"). Pick clear labels; no raw enum to the user.
   - Ordered `STAGE_SEQUENCE: JobStatus[]` for the stepper, and
     `stepperState(current): { status, label, state: "done"|"current"|"future" }[]`.
   - `primaryAction(status): { label: string; targetStatus: JobStatus } | null` — the single
     state-aware next action, where `targetStatus` MUST be an allowed transition from the map
     (e.g. `records_requested` → "Mark records received" → `records_received`; `ready_to_file` →
     "Mark complete" → `completed`). `completed` → null.
   - Tests: transition-map correctness vs the migration, primaryAction per status, stepper states.

2. **Human-readable labels** — add the missing `sa_non_mtd` (and any other live client/job types
   from `src/lib/client-types.ts` missing from `SERVICE_TYPE_LABELS` in `src/lib/format-utils.ts`)
   so the header never renders "Sa Non Mtd".

3. **Denser header** in `src/pages/JobDetail.tsx` — job title; client name (clickable) + client type;
   period/tax-year (`period_label`); assigned owner (`jobs.assigned_to` → resolve display name via
   the org-users pattern already used elsewhere); due date; filing deadline + days remaining. Remove
   the two duplicate status/workflow widgets (the `Badge` at ~:348 and the `Select` at ~:376-405).

4. **One consolidated workflow section** (replaces the old Status + Workflow) — current stage as a
   badge (human label) + a horizontal stepper from `stepperState`. Keep the stage-change control
   (staff can still move the stage) but as part of this one section, via `updateJobStatus`.

5. **Compact job-health strip** (horizontal, not big cards) — due date + days remaining/overdue;
   owner; open tasks count (`job_tasks` where status != done); outstanding client requests
   (`client_tasks` pending); unread client messages (`job_conversations` unread, task_id IS NULL);
   last activity (`jobs.last_activity_at`). Lightweight count queries are fine; reuse existing keys.

6. **State-aware primary action** — replace the always-shown "Mark Complete" with the button from
   `primaryAction(job.status)` (hidden when null). It calls `updateJobStatus(jobId, targetStatus)`.
   **Add the missing `onError`** → `toast.error` with the message, so a rejected transition is
   visible (the current mutation swallows failures).

7. **Capability-driven tab visibility** — gate the Questionnaire / Workpaper / Filing tabs on
   `canonical_job_templates.requires_questionnaire / requires_workpaper / requires_filing`, looked up
   via `jobs.canonical_service_code`. **FAIL-OPEN**: show a tab if its flag is true OR the template
   row / flag is absent/unknown (never hide a tab just because the capability data is missing).
   Leave the other tabs as-is. Do NOT merge tab contents in this increment.

## Constraints
- Read `jobs.status`; do not introduce any new status column/table/store. The model is pure logic.
- Follow existing shadcn Card/Badge/Tabs patterns in `JobDetail.tsx`; reuse the org-user name
  resolution and query-key conventions already in the file.
- Gate: `npx tsc --noEmit` 0; new pure-model test green; `npx vite build` succeeds — then
  `git checkout HEAD -- supabase/functions/mcp/index.ts` and confirm `git status --porcelain
  supabase/functions/mcp/index.ts` is empty before committing. Never commit `mcp/index.ts`.
