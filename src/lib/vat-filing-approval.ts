/**
 * Filing Stage B (VAT) — accountant approval service.
 * Creates the immutable VAT snapshot (Stage A.1) and records the accountant's approval of it
 * (server-side RPC, approved_by = auth.uid()). This is the internal filing control.
 */
import { supabase } from "@/integrations/supabase/client";
import { createVatFilingSnapshot } from "@/lib/filing-vat-snapshot";

export {
  vatFilingState,
  type VatFilingApprovalRow,
  type VatFilingState,
} from "@/lib/vat-filing-approval-model";

export interface ApproveVatResult {
  success: boolean;
  snapshotId?: string;
  snapshotHash?: string;
  error?: string;
}

/**
 * Approve a VAT return for filing: snapshot the figures immutably, then record the approval.
 * The two steps are ordered so an approval never exists without its snapshot.
 */
export async function approveVatReturnForFiling(vatReturnId: string): Promise<ApproveVatResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // 1) Build + freeze the immutable snapshot from the canonical VAT figures.
  const snap = await createVatFilingSnapshot(vatReturnId, user.id);
  if (!snap.success || !snap.snapshotId) {
    return { success: false, error: snap.error || "Could not create the VAT snapshot" };
  }

  // 2) Record the accountant approval of that exact snapshot (server-side, fail-closed).
  const { data, error } = await (supabase as any).rpc("record_vat_filing_approval", {
    _vat_return_id: vatReturnId,
    _snapshot_id: snap.snapshotId,
  });
  if (error) return { success: false, error: error.message };
  const res = data as { success?: boolean; error?: string; snapshot_hash?: string } | null;
  if (!res?.success) return { success: false, error: res?.error || "Could not record the approval" };

  return { success: true, snapshotId: snap.snapshotId, snapshotHash: res.snapshot_hash };
}

/** Clear the accountant approval (only while unsubmitted). */
export async function revokeVatFilingApproval(vatReturnId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await (supabase as any).rpc("revoke_vat_filing_approval", { _vat_return_id: vatReturnId });
  if (error) return { success: false, error: error.message };
  const res = data as { success?: boolean; error?: string } | null;
  if (!res?.success) return { success: false, error: res?.error || "Could not clear the approval" };
  return { success: true };
}
