/**
 * Filing Stage B (CT600) — accountant approval via the filings/filing_approvals infra.
 * This is the first real caller of createFilingApproval (the FIL-1 gap): snapshot the CT
 * computation immutably, link it to the filing, and record an ACCOUNTANT CT600 approval of that
 * exact snapshot + hash.
 */
import { supabase } from "@/integrations/supabase/client";
import { createCt600FilingSnapshot } from "@/lib/filing-ct600-snapshot";
import { createFilingApproval, revokeFilingApproval, getActiveApproval } from "@/lib/filing-approval-service";

export { ct600FilingState, type Ct600FilingState } from "@/lib/ct600-filing-model";

export interface ApproveCt600Result {
  success: boolean;
  snapshotId?: string;
  snapshotHash?: string;
  error?: string;
}

/**
 * Approve a CT600 filing: freeze the immutable CT snapshot, link it to the filing, and record the
 * accountant approval of that snapshot. Ordered so an approval never exists without its snapshot.
 */
export async function approveCt600Filing(filingId: string): Promise<ApproveCt600Result> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: filing, error: filingErr } = await supabase
    .from("filings")
    .select("id, organization_id, ct_snapshot_id, status")
    .eq("id", filingId)
    .maybeSingle();
  if (filingErr || !filing) return { success: false, error: filingErr?.message || "Filing not found" };
  const ctSnapshotId = (filing as { ct_snapshot_id?: string }).ct_snapshot_id;
  if (!ctSnapshotId) return { success: false, error: "This filing has no CT computation to approve" };

  // 1) Freeze the immutable CT600 snapshot from the computation.
  const snap = await createCt600FilingSnapshot(ctSnapshotId, user.id);
  if (!snap.success || !snap.snapshotId || !snap.snapshotHash) {
    return { success: false, error: snap.error || "Could not create the CT600 snapshot" };
  }

  // 2) Link the approved snapshot to the filing (this is what the Stage-D gate checks).
  const { error: linkErr } = await supabase
    .from("filings")
    .update({ model_snapshot_id: snap.snapshotId })
    .eq("id", filingId);
  if (linkErr) return { success: false, error: `Could not link the snapshot: ${linkErr.message}` };

  // 3) Record the accountant approval of that exact snapshot.
  const approval = await createFilingApproval({
    filingId,
    scope: "CT600",
    snapshotId: snap.snapshotId,
    snapshotHash: snap.snapshotHash,
    role: "ACCOUNTANT",
    method: "OVERRIDE",
  });
  if (!approval.success) return { success: false, error: approval.error || "Could not record the approval" };

  return { success: true, snapshotId: snap.snapshotId, snapshotHash: snap.snapshotHash };
}

/** Revoke the CT600 accountant approval (leaves the filing unapproved and not submittable). */
export async function revokeCt600Approval(
  filingId: string,
  reason = "Revoked by accountant",
): Promise<{ success: boolean; error?: string }> {
  const approval = await getActiveApproval(filingId, "CT600");
  if (!approval) return { success: true }; // nothing active to revoke
  return await revokeFilingApproval(approval.id, reason);
}

/** Whether an active ACCOUNTANT CT600 approval currently exists for a filing. */
export async function hasActiveCt600Approval(filingId: string): Promise<boolean> {
  const approval = await getActiveApproval(filingId, "CT600");
  return !!approval && approval.approved_by_role === "ACCOUNTANT";
}
