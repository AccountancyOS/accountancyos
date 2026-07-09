/**
 * Filing Stage B (VAT) — pure gating model for a VAT return's filing-approval state (no DB import).
 * This is the single source of truth for "is this VAT return submittable?" that the approve UI
 * (Stage B), the submit action (Stage C) and the enforcement gate (Stage D) all consult.
 */

export interface VatFilingApprovalRow {
  submitted_at?: string | null;
  model_snapshot_id?: string | null;
  filing_approved_at?: string | null;
  /** If the practice requires the client to approve VAT before submission. */
  client_approval_required?: boolean | null;
  client_approved_at?: string | null;
}

export interface VatFilingState {
  approved: boolean;
  submitted: boolean;
  clientApprovalPending: boolean;
  submittable: boolean;
  reason?: string;
}

export function vatFilingState(r: VatFilingApprovalRow): VatFilingState {
  const submitted = !!r.submitted_at;
  const approved = !!r.filing_approved_at && !!r.model_snapshot_id;
  const clientApprovalPending = !!r.client_approval_required && !r.client_approved_at;

  let reason: string | undefined;
  if (submitted) reason = "Already submitted";
  else if (!approved) reason = "Not approved for filing";
  else if (clientApprovalPending) reason = "Awaiting client approval";

  return {
    approved,
    submitted,
    clientApprovalPending,
    // Submittable only when the accountant has approved a snapshot, the client has approved (if
    // required), and it has not already been submitted.
    submittable: approved && !submitted && !clientApprovalPending,
    reason,
  };
}
