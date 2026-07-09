/**
 * Filing Stage C (VAT) — real transport.
 * Replaces the fake status-flip: submits the APPROVED immutable snapshot to HMRC via
 * hmrc-vat-submit (which records the filing attempt and is idempotent on an accepted submission),
 * and only reflects 'submitted' when the transport actually returns success — never optimistically.
 */
import { supabase } from "@/integrations/supabase/client";
import { vatFilingState, type VatFilingApprovalRow } from "@/lib/vat-filing-approval-model";

export interface VatSubmitRow extends VatFilingApprovalRow {
  id: string;
  model_snapshot_id?: string | null;
}

export interface SubmitVatResult {
  success: boolean;
  error?: string;
  receipt?: unknown;
}

/**
 * Submit an approved VAT return to HMRC. Sandbox by default; production must be chosen explicitly.
 * On success the vat_returns row is stamped from the transport RESPONSE (status + receipt), so the
 * UI status derives from the real submission, not local state. On failure nothing is mutated, so
 * it is safely retryable (hmrc-vat-submit dedupes an already-accepted submission).
 */
export async function submitVatReturnToHmrc(
  vr: VatSubmitRow,
  environment: "sandbox" | "production" = "sandbox",
): Promise<SubmitVatResult> {
  const state = vatFilingState(vr);
  if (!state.submittable) {
    return { success: false, error: state.reason || "This VAT return is not ready to submit" };
  }
  if (!vr.model_snapshot_id) {
    return { success: false, error: "No approved snapshot to submit" };
  }

  const { data, error } = await supabase.functions.invoke("hmrc-vat-submit", {
    body: { snapshotId: vr.model_snapshot_id, environment },
  });
  if (error) return { success: false, error: error.message };

  const res = (data ?? {}) as { success?: boolean; message?: string; alreadySubmitted?: boolean };
  if (!res.success) {
    return { success: false, error: res.message || "HMRC did not accept the submission" };
  }

  // Reflect the transport result on the VAT return (derived from the real response, post-success).
  const { error: updErr } = await supabase
    .from("vat_returns")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      hmrc_receipt: data as never,
    })
    .eq("id", vr.id)
    .is("submitted_at", null); // don't clobber an already-recorded submission
  if (updErr) {
    // The submission succeeded at HMRC; surface the bookkeeping error but don't imply failure.
    return { success: true, error: `Submitted, but could not update the record: ${updErr.message}`, receipt: data };
  }
  return { success: true, receipt: data };
}
