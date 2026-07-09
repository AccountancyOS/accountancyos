/**
 * Filing Stage A.1 — VAT model-snapshot population.
 *
 * Builds an immutable filing_model_snapshot (snapshot_type='vat_return') from the canonical VAT
 * return figures, so that a VAT submission (Stage C) projects from a locked, hashed model rather
 * than from mutable live rows. Stage A only POPULATES the snapshot; approval (Stage B) and the
 * enforcement gate (Stage D) are separate.
 *
 * The pure builder + box validator have no DB dependency and are unit-tested; createVatFilingSnapshot
 * reads the VAT return, resolves the VRN, and delegates to the immutable createSnapshot service.
 */
import { supabase } from "@/integrations/supabase/client";
import { createSnapshot } from "@/lib/filing-snapshot-service";
import {
  validateVatBoxes,
  buildVatSnapshotData,
  type VatReturnFigures,
} from "@/lib/filing-vat-snapshot-model";

export { validateVatBoxes, buildVatSnapshotData };
export type { VatReturnFigures };

export interface CreateVatSnapshotResult {
  success: boolean;
  snapshotId?: string;
  error?: string;
}

/**
 * Read a VAT return, validate its boxes, resolve the VRN from the entity, and create an immutable
 * VAT filing snapshot. Returns the snapshot id (which Stage B links to the filing / approval).
 */
export async function createVatFilingSnapshot(
  vatReturnId: string,
  approvedBy?: string,
): Promise<CreateVatSnapshotResult> {
  const { data: vat, error: vatErr } = await supabase
    .from("vat_returns")
    .select(
      "id, organization_id, client_id, company_id, period_start, period_end, box_1_vat_due_sales, box_2_vat_due_acquisitions, box_3_total_vat_due, box_4_vat_reclaimed, box_5_net_vat, box_6_total_sales, box_7_total_purchases, box_8_total_supplies_eu, box_9_total_acquisitions_eu",
    )
    .eq("id", vatReturnId)
    .maybeSingle();
  if (vatErr || !vat) return { success: false, error: vatErr?.message || "VAT return not found" };

  const figures = vat as unknown as VatReturnFigures;
  const check = validateVatBoxes(figures);
  if (!check.valid) {
    return { success: false, error: `VAT figures are inconsistent: ${check.errors.join("; ")}` };
  }

  // Resolve the VRN from the entity (best-effort; a missing VRN is a Stage-C submission concern).
  let vrn: string | null = null;
  if (figures.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("vat_number")
      .eq("id", figures.company_id)
      .maybeSingle();
    vrn = (co as { vat_number?: string } | null)?.vat_number ?? null;
  }

  const snapshotData = buildVatSnapshotData(figures, vrn);
  const res = await createSnapshot({
    organizationId: figures.organization_id,
    companyId: figures.company_id ?? undefined,
    clientId: figures.client_id ?? undefined,
    snapshotType: "vat_return",
    periodStart: figures.period_start,
    periodEnd: figures.period_end,
    snapshotData,
    approvedBy,
  });
  return {
    success: res.success,
    snapshotId: (res.snapshot as { id?: string } | undefined)?.id,
    error: res.error,
  };
}
