/**
 * Workflow Constants
 * 
 * Shared constants for the workflow automation engine.
 * All status-based gates reference these constants — no freeform strings in step configs.
 */

import type { JobStatus } from "./job-status-service";

/**
 * Canonical ordered list of job statuses permitted by the
 * `chk_jobs_status` CHECK constraint on `public.jobs`.
 *
 * Single source of truth for any UI, validator, or service that writes
 * to `jobs.status`. Do NOT inline string literals elsewhere — import this.
 *
 * Drift between this array and the DB constraint is asserted in:
 *   - src/test/regression/job-status-vocabulary.test.ts (unit)
 *   - scripts/smoke-test.ts                              (live DB)
 */
export const JOB_STATUSES = [
  "blank",
  "records_requested",
  "records_received",
  "accountant_queries",
  "client_queries",
  "accountant_review",
  "client_review",
  "ready_to_file",
  "completed",
] as const satisfies readonly JobStatus[];

/**
 * Job statuses that indicate records have been received or work has progressed
 * beyond the chasing stage. CONDITION gates use this to stop sending chase emails.
 */
export const CHASER_STOP_STATUSES: readonly JobStatus[] = [
  "records_received",
  "accountant_queries",
  "client_queries",
  "accountant_review",
  "client_review",
  "ready_to_file",
  "completed",
] as const;

/**
 * Job statuses representing open/active work — every canonical status except
 * the terminal `completed`. Use for "active jobs" lists/KPIs/pickers so they
 * never filter on retired status strings (which silently return zero rows).
 */
export const OPEN_JOB_STATUSES: readonly JobStatus[] = JOB_STATUSES.filter(
  (s) => s !== "completed",
);

/**
 * Map of values_ref identifiers to their resolved constant arrays.
 * The CONDITION step executor resolves values_ref at runtime using this map.
 * Unknown refs fail loudly — never silently.
 */
export const VALID_CONDITION_REFS: Record<string, readonly string[]> = {
  CHASER_STOP_STATUSES,
} as const;

/**
 * Anchor key constants — used in WAIT_UNTIL step configs and the context resolver.
 * These are string literals, not an enum, for simplicity.
 */
export const ANCHOR_KEYS = {
  /** 31 January following the 5 April tax year end */
  SA_FILING_DEADLINE: "SA_FILING_DEADLINE",
  /** Company year end + 9 months */
  COMPANY_ACCOUNTS_DUE_DATE: "COMPANY_ACCOUNTS_DUE_DATE",
  /** Company year end + 9 months + 1 day */
  CT_PAYMENT_DUE_DATE: "CT_PAYMENT_DUE_DATE",
  /** VAT quarter end + 1 month + 7 days */
  VAT_SUBMISSION_DEADLINE: "VAT_SUBMISSION_DEADLINE",
  /** 19th of month following period end */
  PAYROLL_EPS_DEADLINE: "PAYROLL_EPS_DEADLINE",
  /** 22nd of month following period end (electronic) */
  PAYROLL_PAYE_PAYMENT_DEADLINE: "PAYROLL_PAYE_PAYMENT_DEADLINE",
  /** 19th of month following period end (CIS period: 6th to 5th) */
  CIS_SUBMISSION_DEADLINE: "CIS_SUBMISSION_DEADLINE",
  /** Relative to the triggering event timestamp (non-deadline-anchored) */
  TRIGGERING_EVENT: "TRIGGERING_EVENT",
} as const;

export type AnchorKey = (typeof ANCHOR_KEYS)[keyof typeof ANCHOR_KEYS];

/**
 * Supported condition types for the CONDITION step.
 * v1 only supports JOB_STATUS_NOT_IN.
 */
export const CONDITION_TYPES = {
  JOB_STATUS_NOT_IN: "JOB_STATUS_NOT_IN",
} as const;

export type ConditionType = (typeof CONDITION_TYPES)[keyof typeof CONDITION_TYPES];
