/**
 * Pure job-workflow model (no React/DB import), unit-tested.
 *
 * jobs.status is the single source of truth for job workflow state — this file
 * introduces NO parallel status column/table/store. It is pure display/decision
 * logic layered on top of the existing `jobs.status` field (see
 * src/lib/job-status-service.ts for the JobStatus domain and the DB write path).
 *
 * The transition map below is mirrored byte-faithful from `valid_transitions`
 * inside the DB trigger `validate_job_status_transition()`
 * (supabase/migrations/20260408203205_2c7ea4c6-d4d7-4a98-904d-7e85a69e88df.sql).
 * That trigger is the authority — a target status accepted here but rejected
 * by the trigger fails silently at the DB layer, so keep this in sync with the
 * migration rather than guessing at "reasonable" transitions.
 */

export type JobStatus =
  | "blank"
  | "records_requested"
  | "records_received"
  | "accountant_queries"
  | "client_queries"
  | "accountant_review"
  | "client_review"
  | "ready_to_file"
  | "completed";

/**
 * Allowed next statuses per current status. MUST match
 * validate_job_status_transition()'s `valid_transitions` jsonb exactly.
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  blank: ["records_requested"],
  records_requested: ["records_received", "client_queries", "blank"],
  records_received: ["accountant_queries", "client_queries", "accountant_review", "blank"],
  accountant_queries: ["records_received", "client_queries", "accountant_review", "blank"],
  client_queries: ["records_received", "accountant_queries", "accountant_review", "blank"],
  accountant_review: [
    "client_review",
    "ready_to_file",
    "accountant_queries",
    "client_queries",
    "blank",
  ],
  client_review: ["accountant_review", "ready_to_file", "client_queries", "blank"],
  ready_to_file: ["completed", "accountant_review", "client_review", "blank"],
  completed: ["blank"],
};

/** All statuses the trigger allows moving to from `current`. */
export function getAllowedNextStatuses(current: JobStatus): JobStatus[] {
  return JOB_STATUS_TRANSITIONS[current] ?? [];
}

/** Whether `from -> to` is an allowed transition per the DB trigger's map. */
export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  return getAllowedNextStatuses(from).includes(to);
}

/** Human-readable stage labels — never show a raw `jobs.status` enum value to a user. */
export const STAGE_LABEL: Record<JobStatus, string> = {
  blank: "Not started",
  records_requested: "Awaiting client records",
  records_received: "Records received",
  accountant_queries: "Accountant queries outstanding",
  client_queries: "Client queries outstanding",
  accountant_review: "In preparation / review",
  client_review: "With client for review",
  ready_to_file: "Ready to file",
  completed: "Complete",
};

/**
 * Ordered domain for the workflow stepper — mirrors the JobStatus enum order
 * used in src/lib/job-status-service.ts and the increment-1 brief. Includes
 * every status exactly once; the query states (accountant_queries /
 * client_queries) are shown as their own steps rather than folded into an
 * adjacent "main path" stage, since they can be entered from more than one
 * prior stage and there's no single correct anchor point for them.
 */
export const STAGE_SEQUENCE: JobStatus[] = [
  "blank",
  "records_requested",
  "records_received",
  "accountant_queries",
  "client_queries",
  "accountant_review",
  "client_review",
  "ready_to_file",
  "completed",
];

export interface StepperStep {
  status: JobStatus;
  label: string;
  state: "done" | "current" | "future";
}

/** Stepper steps for `current`, positioned relative to STAGE_SEQUENCE. */
export function stepperState(current: JobStatus): StepperStep[] {
  const currentIndex = STAGE_SEQUENCE.indexOf(current);
  return STAGE_SEQUENCE.map((status, index) => ({
    status,
    label: STAGE_LABEL[status],
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "future",
  }));
}

export interface PrimaryAction {
  label: string;
  targetStatus: JobStatus;
}

/**
 * The single state-aware "next action" per status. Every non-null
 * targetStatus here MUST be an allowed transition per JOB_STATUS_TRANSITIONS
 * (verified by src/test/regression/job-workflow-model.test.ts) — otherwise
 * clicking the primary action would silently fail the DB trigger.
 */
const PRIMARY_ACTION_BY_STATUS: Record<JobStatus, PrimaryAction | null> = {
  blank: { label: "Request records", targetStatus: "records_requested" },
  records_requested: { label: "Mark records received", targetStatus: "records_received" },
  records_received: { label: "Send to review", targetStatus: "accountant_review" },
  accountant_queries: { label: "Resolve & send to review", targetStatus: "accountant_review" },
  client_queries: { label: "Resume review", targetStatus: "accountant_review" },
  accountant_review: { label: "Send to client for review", targetStatus: "client_review" },
  client_review: { label: "Mark ready to file", targetStatus: "ready_to_file" },
  ready_to_file: { label: "Mark complete", targetStatus: "completed" },
  completed: null,
};

/** The single state-aware primary action for `status`, or null when there is none (completed). */
export function primaryAction(status: JobStatus): PrimaryAction | null {
  return PRIMARY_ACTION_BY_STATUS[status];
}

/**
 * Fail-open capability gate for tab visibility (canonical_job_templates.requires_*).
 * A tab is visible when its flag is true, OR when the flag/template row is
 * absent (null/undefined) — capability data being missing must never hide a
 * tab. It is hidden ONLY when the flag is explicitly false.
 */
export function capabilityTabVisible(flag: boolean | null | undefined): boolean {
  return flag !== false;
}
