/**
 * Filing Stage B/C/D (CT600) — pure gating model (no DB import, unit-tested).
 * CT600 uses the filings + filing_approvals infra: submittable requires an active ACCOUNTANT
 * CT600 approval of a snapshot and a filing that is not already submitted.
 */

export interface Ct600FilingState {
  approved: boolean;
  submitted: boolean;
  submittable: boolean;
  reason?: string;
}

export interface Ct600GateInput {
  /** filings.status – 'submitted' is terminal. */
  status?: string | null;
  /** filings.model_snapshot_id – the approved immutable snapshot. */
  modelSnapshotId?: string | null;
  /** An active (non-revoked) ACCOUNTANT CT600 approval exists for this filing. */
  hasActiveApproval: boolean;
}

export function ct600FilingState(i: Ct600GateInput): Ct600FilingState {
  const submitted = i.status === "submitted" || i.status === "filed" || i.status === "accepted";
  const approved = i.hasActiveApproval && !!i.modelSnapshotId;

  let reason: string | undefined;
  if (submitted) reason = "Already submitted";
  else if (!approved) reason = "Not approved for filing";

  return { approved, submitted, submittable: approved && !submitted, reason };
}

/**
 * Stage D contract: mirrors the DB trigger. Returns true if the proposed filings update would be
 * BLOCKED — transitioning into submitted/filed without an approved model snapshot.
 */
export function ct600SubmissionGateBlocked(
  prev: { status?: string | null },
  next: { status?: string | null; model_snapshot_id?: string | null },
): boolean {
  const terminal = (s?: string | null) => s === "submitted" || s === "filed" || s === "accepted";
  if (terminal(prev.status) || !terminal(next.status)) return false; // not a fresh transition in
  return !next.model_snapshot_id;
}
