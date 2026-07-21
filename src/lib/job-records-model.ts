/**
 * Pure required-records checklist model (no React/DB import).
 *
 * Two sources feed this, both existing tables — no parallel model is
 * introduced here:
 *  - Definition: `job_templates.records_requests_template` (a JSON array of
 *    `RecordsRequestItem`, see src/lib/job-template-types.ts), the template a
 *    job was generated from, when the job has one.
 *  - Instances: `client_tasks` rows for the job — the actual records
 *    requests, fetched via the existing `["job-records-requests", jobId]`
 *    query (see `useJobRecordsRequests` in
 *    src/components/jobs/RecordsRequestManager.tsx).
 *
 * Matching a definition item to a client_task:
 *   `client_tasks.source_template_task_id` exists in the schema for exactly
 *   this purpose (see supabase/migrations/20251208013202_*.sql), but nothing
 *   in the app currently populates it —
 *   `createRecordsRequestsFromTemplate()` in src/lib/job-template-engine.ts
 *   inserts client_tasks without ever setting that column. So matching falls
 *   back to case-insensitive/whitespace-insensitive equality between the
 *   definition item's `name` and the client_task's `title`, which is exactly
 *   what template-generated requests carry verbatim (`title: request.name`).
 *   If source_template_task_id is ever populated, this function prefers it
 *   automatically over the title fallback.
 *
 * Fallback when there is no template definition (job has no template, or its
 * `records_requests_template` is empty): `buildRecordsChecklist` enumerates
 * the client_tasks themselves instead, one checklist row per existing
 * request, each resolved from its own status. In that fallback the
 * "not_requested" and "not_applicable" states can never occur — a
 * client_task, once created, already IS a request — which is a real property
 * of the fallback, not an omission.
 */

export type RecordState =
  | "not_requested"
  | "requested"
  | "received"
  | "reviewed"
  | "not_applicable";

/** Shape needed from a `records_requests_template` entry (RecordsRequestItem). */
export interface RecordDefinitionItem {
  id: string;
  name: string;
  description?: string;
  isRequired?: boolean;
}

/** Shape needed from a client_tasks row for state resolution. */
export interface RecordRequestTaskLite {
  id: string;
  title: string;
  /** client_tasks.status: not_started | in_progress | complete */
  status: string;
  is_verified: boolean | null;
  source_template_task_id: string | null;
}

export interface RecordChecklistItem {
  id: string;
  name: string;
  description?: string;
  isRequired: boolean;
  state: RecordState;
  matchedTaskId: string | null;
}

function findMatch(
  item: RecordDefinitionItem,
  tasks: RecordRequestTaskLite[]
): RecordRequestTaskLite | null {
  const byLink = tasks.find(
    (t) => t.source_template_task_id && t.source_template_task_id === item.id
  );
  if (byLink) return byLink;

  const normalizedName = item.name.trim().toLowerCase();
  return tasks.find((t) => t.title.trim().toLowerCase() === normalizedName) ?? null;
}

/** Resolves the checklist state for one definition item against a job's client_tasks. */
export function resolveRecordState(
  item: RecordDefinitionItem,
  tasks: RecordRequestTaskLite[]
): RecordState {
  const match = findMatch(item, tasks);
  if (!match) {
    return item.isRequired === false ? "not_applicable" : "not_requested";
  }
  if (match.is_verified) return "reviewed";
  if (match.status === "complete") return "received";
  return "requested"; // not_started | in_progress
}

function stateFromTaskAlone(task: RecordRequestTaskLite): RecordState {
  if (task.is_verified) return "reviewed";
  if (task.status === "complete") return "received";
  return "requested";
}

/**
 * Builds the required-records checklist for a job.
 *
 * - When `definitions` is non-empty, enumerates every definition item
 *   (preserving its order) and resolves each against `tasks`.
 * - When `definitions` is empty, falls back to a passthrough of `tasks`
 *   themselves (see module doc above).
 */
export function buildRecordsChecklist(
  definitions: RecordDefinitionItem[],
  tasks: RecordRequestTaskLite[]
): RecordChecklistItem[] {
  if (definitions.length > 0) {
    return definitions.map((item) => {
      const match = findMatch(item, tasks);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        isRequired: item.isRequired ?? true,
        state: resolveRecordState(item, tasks),
        matchedTaskId: match?.id ?? null,
      };
    });
  }

  return tasks.map((t) => ({
    id: t.id,
    name: t.title,
    isRequired: true,
    state: stateFromTaskAlone(t),
    matchedTaskId: t.id,
  }));
}
