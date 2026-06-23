/**
 * CHECK-constraint vocabulary registry — the single source of truth for every
 * constrained status/enum-like column in the database.
 *
 * Each entry mirrors a Postgres CHECK constraint. The same registry drives:
 *   - src/test/regression/vocabulary-drift.test.ts  (unit: registry vs frozen
 *     expected values from the migrations — catches accidental edits)
 *   - scripts/smoke-test.ts                          (live: registry vs the
 *     real constraint via get_check_constraint_values() — catches DB drift)
 *
 * When a migration changes a CHECK constraint, update the matching entry here
 * AND the frozen `EXPECTED_CONSTRAINT_VALUES` in the regression test. Anything
 * that writes one of these columns should import the relevant array instead of
 * hardcoding string literals.
 */

import { JOB_STATUSES } from "@/lib/workflow-constants";

// --- Per-domain canonical value lists (import these in app code) -----------

/** job_tasks.status — job_tasks_status_check */
export const JOB_TASK_STATUSES = ["todo", "doing", "done", "blocked"] as const;

/** client_tasks.status — client_tasks_status_check */
export const CLIENT_TASK_STATUSES = ["not_started", "in_progress", "complete"] as const;

/** client_tasks.visibility — client_tasks_visibility_check */
export const CLIENT_TASK_VISIBILITIES = ["client_visible", "internal_only"] as const;

/** engagements.status — engagements_status_check */
export const ENGAGEMENT_STATUSES = ["draft", "active", "suspended", "terminated"] as const;

/** clients.status / companies.status — clients_status_check / companies_status_check */
export const ENTITY_LIFECYCLE_STATUSES = ["pending", "active", "disengaged", "archived"] as const;

/** portal_access.status — portal_access_status_check */
export const PORTAL_ACCESS_STATUSES = ["invited", "active", "revoked"] as const;

/** engagement_letters.status — engagement_letters_status_check */
export const ENGAGEMENT_LETTER_STATUSES = ["draft", "sent", "signed"] as const;

/** filings.status — chk_filing_status (canonical; matches FilingStatus union) */
export const FILING_STATUSES = [
  "not_started",
  "draft",
  "in_progress",
  "ready_for_review",
  "sent_to_client",
  "client_changes_requested",
  "awaiting_approval",
  "approved",
  "ready_to_file",
  "submitted",
  "accepted",
  "rejected",
  "filed",
] as const;

/** onboarding_applications.status — onboarding_applications_status_check */
export const ONBOARDING_STATUSES = [
  "draft",
  "in_progress",
  "engagement_pending",
  "aml_pending",
  "billing_pending",
  "portal_pending",
  "for_review",
  "needs_client_action",
  "approved",
  "rejected",
  "cancelled",
] as const;

/** onboarding_applications.aml_status — onboarding_applications_aml_status_check */
export const ONBOARDING_AML_STATUSES = ["pending", "verified", "failed", "manual_review"] as const;

/** onboarding_applications.billing_status — billing_status_check */
export const ONBOARDING_BILLING_STATUSES = ["pending", "skipped", "completed", "not_required"] as const;

/** quotes.status — quotes_status_check */
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "superseded"] as const;

/** deadlines.status — deadlines_status_check */
export const DEADLINE_STATUSES = ["pending", "in_progress", "completed", "filed", "overdue", "cancelled"] as const;

/** leads.pipeline_stage — leads_pipeline_stage_check */
export const LEAD_PIPELINE_STAGES = ["new", "qualified", "proposal_sent", "chasing", "won", "lost"] as const;

// --- Registry --------------------------------------------------------------

/** email_queue.context — email_queue_context_check (latest set after the 2026-06-22 remap). */
export const EMAIL_QUEUE_CONTEXTS = [
  "quote",
  "onboarding",
  "engagement",
  "job",
  "invoice",
  "system",
  "general",
] as const;

/** email_queue.status — email_queue_status_check. */
export const EMAIL_QUEUE_STATUSES = ["pending", "sent", "failed", "cancelled"] as const;

export interface CheckConstraintVocab {
  /** Table the constraint lives on. */
  table: string;
  /** Constrained column. */
  column: string;
  /** Exact Postgres constraint name (used by the live smoke check). */
  constraint: string;
  /** Canonical allowed values. */
  values: readonly string[];
}

/**
 * Every CHECK-constrained vocabulary with an app write/derive path. The live
 * smoke check looks up each `constraint` by exact name, so names must be exact.
 */
export const CHECK_CONSTRAINT_REGISTRY: readonly CheckConstraintVocab[] = [
  { table: "jobs", column: "status", constraint: "chk_jobs_status", values: JOB_STATUSES },
  { table: "job_tasks", column: "status", constraint: "job_tasks_status_check", values: JOB_TASK_STATUSES },
  { table: "client_tasks", column: "status", constraint: "client_tasks_status_check", values: CLIENT_TASK_STATUSES },
  { table: "client_tasks", column: "visibility", constraint: "client_tasks_visibility_check", values: CLIENT_TASK_VISIBILITIES },
  { table: "engagements", column: "status", constraint: "engagements_status_check", values: ENGAGEMENT_STATUSES },
  { table: "clients", column: "status", constraint: "clients_status_check", values: ENTITY_LIFECYCLE_STATUSES },
  { table: "companies", column: "status", constraint: "companies_status_check", values: ENTITY_LIFECYCLE_STATUSES },
  { table: "portal_access", column: "status", constraint: "portal_access_status_check", values: PORTAL_ACCESS_STATUSES },
  { table: "engagement_letters", column: "status", constraint: "engagement_letters_status_check", values: ENGAGEMENT_LETTER_STATUSES },
  { table: "filings", column: "status", constraint: "chk_filing_status", values: FILING_STATUSES },
  { table: "onboarding_applications", column: "status", constraint: "onboarding_applications_status_check", values: ONBOARDING_STATUSES },
  { table: "onboarding_applications", column: "aml_status", constraint: "onboarding_applications_aml_status_check", values: ONBOARDING_AML_STATUSES },
  { table: "onboarding_applications", column: "billing_status", constraint: "onboarding_applications_billing_status_check", values: ONBOARDING_BILLING_STATUSES },
  { table: "quotes", column: "status", constraint: "quotes_status_check", values: QUOTE_STATUSES },
  { table: "deadlines", column: "status", constraint: "deadlines_status_check", values: DEADLINE_STATUSES },
  { table: "leads", column: "pipeline_stage", constraint: "leads_pipeline_stage_check", values: LEAD_PIPELINE_STAGES },
  { table: "email_queue", column: "context", constraint: "email_queue_context_check", values: EMAIL_QUEUE_CONTEXTS },
  { table: "email_queue", column: "status", constraint: "email_queue_status_check", values: EMAIL_QUEUE_STATUSES },
] as const;
