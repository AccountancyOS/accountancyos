/**
 * Filing engine state machine & projection/submission gates.
 *
 * The filing engine is strictly downstream of the accounting core:
 *
 *   Approved Financial Model Version (filing_model_snapshots + filing_approvals)
 *       -> Projection (provider-specific payload bound to an approved snapshot)
 *       -> Submission (sent to HMRC via hmrc-call-proxy)
 *
 * This module encodes those rules as pure, testable guards. It MIRRORS — it does
 * not replace — the database-level enforcement that already exists
 * (validate_filing_submission(), the immutable snapshot triggers, period locks).
 * Having the same invariant expressed in the engine layer lets us fail fast with
 * a clear error before any IO, and lets the enforcement tests prove the rules.
 *
 * Runtime-agnostic (no Deno/Node globals, no external imports).
 */

/** filings.status domain — must match the CHECK constraint on public.filings. */
export type FilingStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'ready_to_file'
  | 'filed'
  | 'rejected';

/** Allowed forward transitions for a filing. */
export const FILING_TRANSITIONS: Record<FilingStatus, readonly FilingStatus[]> = {
  draft: ['awaiting_approval', 'rejected'],
  awaiting_approval: ['approved', 'rejected', 'draft'],
  approved: ['ready_to_file', 'rejected'],
  ready_to_file: ['filed', 'rejected'],
  filed: [], // terminal — a filed return is immutable
  rejected: ['draft'], // may be reworked from scratch
};

export function isValidFilingTransition(from: FilingStatus, to: FilingStatus): boolean {
  const allowed = FILING_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export class FilingStateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FilingStateError';
    this.code = code;
  }
}

export function assertValidFilingTransition(from: FilingStatus, to: FilingStatus): void {
  if (!isValidFilingTransition(from, to)) {
    throw new FilingStateError(
      'INVALID_STATE_TRANSITION',
      `Invalid filing transition: ${from} -> ${to}`,
    );
  }
}

/** Inputs describing the approved artefact a projection would be built from. */
export interface ApprovedArtefactRef {
  /** A non-revoked filing_approvals row exists for the relevant scope. */
  hasActiveApproval: boolean;
  /** snapshot_hash recorded on the approval at approval time. */
  approvalSnapshotHash?: string | null;
  /** snapshot_hash currently stored on the immutable model snapshot. */
  modelSnapshotHash?: string | null;
}

/**
 * Gate 1 — a Projection cannot exist without an approved artefact, and the
 * approved snapshot hash must still match the model snapshot (source-hash
 * validation). Mirrors validate_filing_submission().
 */
export function assertProjectionAllowed(artefact: ApprovedArtefactRef): void {
  if (!artefact.hasActiveApproval) {
    throw new FilingStateError(
      'NO_APPROVED_ARTEFACT',
      'Projection requires an active (non-revoked) approval of a financial model snapshot',
    );
  }
  if (!artefact.approvalSnapshotHash || !artefact.modelSnapshotHash) {
    throw new FilingStateError(
      'SOURCE_HASH_MISSING',
      'Projection requires both approval and model snapshot hashes for source-hash validation',
    );
  }
  if (artefact.approvalSnapshotHash !== artefact.modelSnapshotHash) {
    throw new FilingStateError(
      'SOURCE_HASH_MISMATCH',
      'Approved snapshot hash no longer matches the model snapshot — re-approval required',
    );
  }
}

/** Inputs describing whether a projection exists for a submission attempt. */
export interface ProjectionRef {
  /** A projection (provider payload) has been produced and persisted. */
  hasProjection: boolean;
  /** The projection is bound to the approved snapshot hash. */
  projectionSnapshotHash?: string | null;
  approvalSnapshotHash?: string | null;
}

/**
 * Gate 2 — a Submission cannot exist without a Projection, and that projection
 * must be bound to the approved snapshot hash.
 */
export function assertSubmissionAllowed(projection: ProjectionRef): void {
  if (!projection.hasProjection) {
    throw new FilingStateError(
      'NO_PROJECTION',
      'Submission requires a projection bound to an approved snapshot',
    );
  }
  if (
    projection.projectionSnapshotHash &&
    projection.approvalSnapshotHash &&
    projection.projectionSnapshotHash !== projection.approvalSnapshotHash
  ) {
    throw new FilingStateError(
      'PROJECTION_HASH_MISMATCH',
      'Projection is not bound to the currently approved snapshot',
    );
  }
}
