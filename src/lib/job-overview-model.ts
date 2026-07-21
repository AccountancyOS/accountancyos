/**
 * Pure Job Overview model (no React/DB import), unit-tested.
 *
 * Layers "next action" and "blockers" decision logic on top of already-loaded
 * facts about a single job. This introduces NO parallel status/model — it
 * reuses `primaryAction()` from `job-workflow-model.ts` (the same
 * jobs.status-driven source of truth used by the Increment-1 workflow
 * section) for the next-action label, and otherwise only reads plain facts
 * the caller has already fetched from the existing tab queries
 * (job_documents, client_tasks, filings, workpaper_instances, ...).
 *
 * Keep this file pure: plain-object input, no Supabase/React imports, so it
 * stays trivially unit-testable (see
 * src/test/regression/job-overview-model.test.ts).
 */

import { primaryAction, STAGE_SEQUENCE, type JobStatus } from "./job-workflow-model";

/**
 * Already-loaded facts an Overview tab caller assembles from its own
 * queries. Nothing here is fetched by this module — it's a plain snapshot.
 */
export interface JobOverviewFacts {
  status: JobStatus;
  /** count of client_tasks for this job with status != 'complete'. */
  outstandingRequestCount: number;
  /** whether any job_documents row looks like a fresh client-originated upload. */
  hasNewClientUploads: boolean;
  /** whether a client approval has actually been recorded (e.g. filings.approved_at). */
  clientApprovalRecorded: boolean;
  /**
   * workpaper_instances.status, when known. NOT a completion percentage or
   * validation count (workpaper_instances exposes no such column) — kept
   * here for context only; deriveBlockers deliberately does not turn a bare
   * status string into a fabricated count-based blocker.
   */
  workpaperStatus?: string | null;
}

export interface NextActionResult {
  /** primaryAction(status)'s label, verbatim. */
  label: string;
  /** short reason for the action, or null when there's nothing to add. */
  reason: string | null;
}

/**
 * The single most important next action for a job, or null when there is
 * none (status "completed" — primaryAction returns null there too).
 */
export function deriveNextAction(facts: JobOverviewFacts): NextActionResult | null {
  const action = primaryAction(facts.status);
  if (!action) return null;

  let reason: string | null = null;

  if (facts.status === "records_requested" && facts.outstandingRequestCount > 0) {
    const n = facts.outstandingRequestCount;
    reason = `Waiting on ${n} requested item${n === 1 ? "" : "s"}`;
  } else if (facts.status === "records_received" && facts.hasNewClientUploads) {
    reason = "The client uploaded documents";
  }

  return { label: action.label, reason };
}

export interface Blocker {
  message: string;
}

const READY_TO_FILE_INDEX = STAGE_SEQUENCE.indexOf("ready_to_file");

/**
 * Blockers derived from ACTUAL loaded state only — never a placeholder or a
 * fabricated count. Returns [] when nothing blocks.
 */
export function deriveBlockers(facts: JobOverviewFacts): Blocker[] {
  const blockers: Blocker[] = [];

  if (facts.status === "records_requested" && facts.outstandingRequestCount > 0) {
    const n = facts.outstandingRequestCount;
    blockers.push({
      message: `Waiting for the client to provide the ${n} outstanding requested item${n === 1 ? "" : "s"}.`,
    });
  }

  const statusIndex = STAGE_SEQUENCE.indexOf(facts.status);
  if (statusIndex >= READY_TO_FILE_INDEX && !facts.clientApprovalRecorded) {
    blockers.push({
      message: "Filing is blocked because client approval has not been recorded.",
    });
  }

  // Deliberately no workpaper-incomplete blocker: workpaper_instances has no
  // completion percentage or validation-count column to derive one from
  // (facts.workpaperStatus is a bare status string), and the brief is
  // explicit that we must never invent a count.

  return blockers;
}
