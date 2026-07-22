# Job Workspace — Increment 3 (Documents = Records + Documents merged)

Scope of THIS increment only. Full spec: `docs/briefs/2026-07-20-job-workspace-refinement-brief.md` §4.
Builds on Increments 1–2. Reuse existing loaders — add NO parallel model, fabricate NO statuses.

## Goal
The current screen has a **"Records" tab** (`RecordsRequestManager` over `client_tasks`) and a
separate **"Documents" tab** (`JobDocumentsTab` over `job_documents`). Merge them into ONE Documents
tab with three sections: document requests, uploaded documents, and a required-records checklist —
with real filters and useful empty states. Remove the standalone "Records" tab.

## Investigate first
- Find the source of "required records" for a job type. Candidates: `canonical_job_templates`,
  `job_templates`, or a dedicated checklist/definition table. Grep the schema + `src/`.
  - If a real required-records definition exists, drive the checklist from it (each item: Not
    requested / Requested / Received / Reviewed / Not applicable, resolved by matching against
    `client_tasks` + `job_documents`).
  - If NONE exists, derive the checklist from the existing `client_tasks` request items (their
    titles + statuses) and note the limitation in your report — do NOT invent a hardcoded
    self-assessment list.

## Deliverables

1. **`src/components/jobs/JobDocumentsTab.tsx` becomes the merged workspace** (or a new
   `JobDocumentsWorkspace` mounted in the existing Documents tab — your call, keep it one file/area):
   - **A. Document requests** — from `client_tasks` (`["job-records-requests", jobId]`, reuse the key
     + queryFn shape from `RecordsRequestManager`). Per request: title, description, requested date,
     due date, status (use the REAL enum `not_started/in_progress/complete` — map to human labels;
     do NOT introduce "pending"), linked document if received. Keep the existing actions that already
     work (Add request, Mark received, etc.) — reuse `RecordsRequestManager`'s mutations rather than
     reimplementing; if simplest, embed `RecordsRequestManager` as this section.
   - **B. Uploaded documents** — from `job_documents` (`["job-documents", jobId]`, reuse
     `JobDocumentsTab`'s existing key + upload path `uploadJobDocument`). Per doc: file name,
     category, source (client vs accountant — use the existing `client_visible`/uploader signal),
     uploaded by/date, related request if linked, review status. Keep the existing upload/preview/
     download actions.
   - **C. Required-records checklist** — per the investigation above; each item shows its state and
     links to the matching request/document. This drives readiness (a later increment consumes it).
   - **Filters** over the uploaded-documents list: All / Client uploads / Accountant uploads /
     Outstanding review / Linked to request / Uncategorised — implement only the filters whose
     backing signal genuinely exists on `job_documents`; omit (don't fake) any whose column is absent,
     and say which in your report.
   - **Empty states** that state what's missing + a useful next action (e.g. "No documents uploaded
     yet — Request documents or upload one directly", with the Request/Upload buttons), NOT a bare
     "No data".

2. **Remove the standalone "Records" tab** from `src/pages/JobDetail.tsx` (its content now lives in
   Documents). Do NOT touch Questionnaire/Workpaper/Filing/Tasks/Conversation/Timeline tabs — those
   merges/rebuilds are later increments. Preserve any deep link to the old records tab by redirecting
   its tab value to `documents` if that's cheap; otherwise note it.

3. **A small pure helper + test IF there's real checklist logic** — e.g.
   `src/lib/job-records-model.ts` `resolveRecordState(item, requests, documents)` →
   `"not_requested"|"requested"|"received"|"reviewed"|"not_applicable"`, TDD'd. If the checklist is
   only a passthrough of request items with no derivation, skip the model (no need to invent one).

## Constraints
- Reuse existing query keys + mutations (share caches; don't duplicate fetches or reimplement working
  mutations). Real enums only (`client_tasks`: not_started/in_progress/complete). No fabricated
  columns/filters. Respect org scoping/RLS (existing patterns).
- Gate: `npx tsc --noEmit` 0; any new model test green; `npx vite build` succeeds — then
  `git checkout HEAD -- supabase/functions/mcp/index.ts` and confirm `git status --porcelain
  supabase/functions/mcp/index.ts` empty before committing. Never commit `mcp/index.ts`.
