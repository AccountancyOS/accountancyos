/**
 * Database CHECK-constraint enums.
 *
 * These mirror Postgres CHECK constraints. Use these constants for any
 * `.insert()` / `.update()` of CHECK-constrained columns so TypeScript catches
 * stale literal values at compile time.
 */

export const JOB_STATUS = {
  BLANK: "blank",
  RECORDS_REQUESTED: "records_requested",
  RECORDS_RECEIVED: "records_received",
  ACCOUNTANT_QUERIES: "accountant_queries",
  CLIENT_QUERIES: "client_queries",
  ACCOUNTANT_REVIEW: "accountant_review",
  CLIENT_REVIEW: "client_review",
  READY_TO_FILE: "ready_to_file",
  COMPLETED: "completed",
} as const;
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

// Canonical filings.status vocabulary = chk_filing_status (13 values). The
// ordered array `FILING_STATUSES` in ./check-constraints is the SSOT; this
// object is the keyed-accessor form. Both must match the DB constraint.
export const FILING_STATUS = {
  NOT_STARTED: "not_started",
  DRAFT: "draft",
  IN_PROGRESS: "in_progress",
  READY_FOR_REVIEW: "ready_for_review",
  SENT_TO_CLIENT: "sent_to_client",
  CLIENT_CHANGES_REQUESTED: "client_changes_requested",
  AWAITING_APPROVAL: "awaiting_approval",
  APPROVED: "approved",
  READY_TO_FILE: "ready_to_file",
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  FILED: "filed",
} as const;
export type FilingStatus = (typeof FILING_STATUS)[keyof typeof FILING_STATUS];

export const EMAIL_QUEUE_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
export type EmailQueueStatus =
  (typeof EMAIL_QUEUE_STATUS)[keyof typeof EMAIL_QUEUE_STATUS];

export const QUESTIONNAIRE_STATUS = {
  SENT: "sent",
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  REVIEWED: "reviewed",
} as const;
export type QuestionnaireStatus =
  (typeof QUESTIONNAIRE_STATUS)[keyof typeof QUESTIONNAIRE_STATUS];

export const ENGAGEMENT_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  TERMINATED: "terminated",
} as const;
export type EngagementStatus =
  (typeof ENGAGEMENT_STATUS)[keyof typeof ENGAGEMENT_STATUS];

export const CLIENT_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  DISENGAGED: "disengaged",
  ARCHIVED: "archived",
} as const;
export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];

export const COMPANY_STATUS = CLIENT_STATUS;
export type CompanyStatus = ClientStatus;

export const PORTAL_ACCESS_STATUS = {
  INVITED: "invited",
  ACTIVE: "active",
  REVOKED: "revoked",
} as const;
export type PortalAccessStatus =
  (typeof PORTAL_ACCESS_STATUS)[keyof typeof PORTAL_ACCESS_STATUS];

export const TB_SNAPSHOT_STATUS = {
  DRAFT: "draft",
  FINALISED: "finalised",
  SUPERSEDED: "superseded",
} as const;
export type TbSnapshotStatus =
  (typeof TB_SNAPSHOT_STATUS)[keyof typeof TB_SNAPSHOT_STATUS];

export const LEAD_PIPELINE_STAGE = {
  NEW: "new",
  QUALIFIED: "qualified",
  PROPOSAL_SENT: "proposal_sent",
  CHASING: "chasing",
  WON: "won",
  LOST: "lost",
} as const;
export type LeadPipelineStage =
  (typeof LEAD_PIPELINE_STAGE)[keyof typeof LEAD_PIPELINE_STAGE];

/**
 * Generate a unique random token for legacy UNIQUE token columns where the
 * canonical secure-link RPC writes the *real* token but the legacy column is
 * still NOT NULL UNIQUE. Never hardcode placeholder strings into such columns.
 */
export function uniqueLegacyToken(prefix = "legacy"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}