# Job Workspace — Increment 2 (Overview tab)

Scope of THIS increment only. Full spec: `docs/briefs/2026-07-20-job-workspace-refinement-brief.md` §3.
Builds ON Increment 1 (header + consolidated workflow section + `src/lib/job-workflow-model.ts`).
Reuse existing query keys/loaders — add NO parallel model, fabricate NO counts/statuses.

## Deliverables

1. **Pure model `src/lib/job-overview-model.ts` (+ test, TDD first).**
   - `deriveNextAction(input): { label: string; reason: string | null }` — the single most important
     next action. Use `primaryAction(status)` from `job-workflow-model.ts` for the `label`; derive a
     short `reason` from the most relevant outstanding item (e.g. status `records_received` with new
     client uploads → reason "The client uploaded documents"; `records_requested` with outstanding
     requests → "Waiting on N requested items"). `reason` is null when there's nothing to add.
   - `deriveBlockers(input): { message: string }[]` — from ACTUAL state only:
     - status `records_requested` AND outstanding requests > 0 → "Waiting for the client to provide
       the N outstanding requested item(s)."
     - status at/after `ready_to_file` but no recorded client approval (approval flag false) →
       "Filing is blocked because client approval has not been recorded."
     - (Only add a workpaper-incomplete blocker if the workpaper data genuinely exposes an
       incomplete/validation count — otherwise omit it; never invent a count.)
     Return `[]` when nothing blocks. Keep the input a plain object of already-loaded facts
     (status, outstandingRequestCount, hasNewClientUploads, clientApprovalRecorded, workpaperStatus)
     so it stays pure and testable. Tests cover each rule + the empty case.

2. **`src/components/jobs/JobOverviewTab.tsx`** — a responsive two-column tab. Reuse these EXISTING
   query keys (share caches, do not re-key): `["job", jobId]`, `["job-documents", jobId]`
   (`job_documents`), `["job-records-requests", jobId]` (`client_tasks`), `["job-questionnaires",
   jobId]`, `["job-workpaper", jobId]` (`workpaper_instances`), `["job-tasks", jobId]`
   (`job_tasks`), `["job-conversations", jobId]` (`job_conversations`, `task_id IS NULL`),
   `["job-timeline", jobId]` (`job_timeline`), and the already-loaded `source-job`/`next-year-job`.

   **Main column:**
   - **Next action** card at top — from `deriveNextAction`, with a button that runs the workflow
     `primaryAction` (reuse Increment 1's mutation path / `updateJobStatus`, with the onError toast).
   - **Blockers** — a clear banner from `deriveBlockers` (only when non-empty).
   - **Recent documents & requests** — combined snapshot: latest uploaded `job_documents` + outstanding
     `client_tasks` (status != 'complete') + questionnaire completion if present. Max 5 items, with a
     "View all documents" link that switches to the Documents tab.
   - **Workpaper summary** — status + reviewer/preparer + last-edited from `workpaper_instances`;
     show a completion % / validation count ONLY if those fields genuinely exist on the row (check
     the type/columns; otherwise show status + who + when). "Open workpaper" button → Workpaper tab.
   - **Tasks summary** — short list of the most urgent open `job_tasks` (status != 'done'); show
     overdue/due-today only if a due-date field exists on `job_tasks`, else just open + recently done.
   - **Recent conversation** — latest 2-3 `job_conversations` messages (task_id IS NULL) + unread
     proxy (reuse Increment 1's approach); not the full thread. Link to the Conversation tab.
   - **Recent activity** — latest 5 `job_timeline` events; "View full timeline" → Timeline tab.

   **Side column (narrower):**
   - **Job details** — type (human label via `SERVICE_TYPE_LABELS`), period, due date, filing
     deadline, owner (resolved name), reviewer if present, workflow stage (human label), created.
   - **Client details** — client name + type, primary contact (for company jobs, resolve
     `companies.primary_contact_person_id` → `company_persons`), email, phone, portal status if known.
   - **Related work** — previous-period (`source_job`) / next-period (`next_year_job`) links; render
     ONLY rows that have a value (no empty fields, no dashes).

3. **Make Overview the default tab** in `src/pages/JobDetail.tsx` (add the `overview` `TabsTrigger` +
   `TabsContent` first; default the `Tabs` value to `overview`). Do NOT remove/merge the other tabs
   in this increment — the content merges (Records→Documents, Audit→Timeline) are Increments 3/5.
   Do not duplicate the workflow stepper inside Overview — it already lives above the tabs (Inc 1).

## Constraints
- Read-only aggregation (except the next-action button, which reuses the Inc-1 workflow mutation).
- Don't render empty fields as dashes/empty cards; omit them.
- Respect org scoping/RLS (reuse existing query patterns; no unscoped fetches).
- Gate: `npx tsc --noEmit` 0; the new model test green; `npx vite build` succeeds — then
  `git checkout HEAD -- supabase/functions/mcp/index.ts` and confirm `git status --porcelain
  supabase/functions/mcp/index.ts` empty before committing. Never commit `mcp/index.ts`.
