/**
 * Filing Stage A (CT600) — snapshot population (DB wiring).
 * Reads a CT computation, validates it, resolves the company identifiers, and creates an
 * immutable CT600 filing snapshot (so submission projects from a frozen, hashed model rather than
 * the mutable ct_computation_snapshots row).
 */
import { supabase } from "@/integrations/supabase/client";
import { createSnapshot } from "@/lib/filing-snapshot-service";
import {
  validateCt600Computation,
  buildCt600SnapshotData,
  type CtComputationFigures,
} from "@/lib/filing-ct600-snapshot-model";

export { validateCt600Computation, buildCt600SnapshotData };
export type { CtComputationFigures };

export interface CreateCt600SnapshotResult {
  success: boolean;
  snapshotId?: string;
  snapshotHash?: string;
  error?: string;
}

export async function createCt600FilingSnapshot(
  ctComputationSnapshotId: string,
  approvedBy?: string,
): Promise<CreateCt600SnapshotResult> {
  const { data: comp, error: compErr } = await supabase
    .from("ct_computation_snapshots")
    .select(
      "id, organization_id, company_id, accounts_snapshot_id, period_start, period_end, accounting_profit, add_backs, deductions, total_capital_allowances, balancing_charges, taxable_total_profits, corporation_tax_rate, marginal_relief, corporation_tax_due, pools_summary, claims_summary",
    )
    .eq("id", ctComputationSnapshotId)
    .maybeSingle();
  if (compErr || !comp) return { success: false, error: compErr?.message || "CT computation not found" };

  const figures = comp as unknown as CtComputationFigures;
  const check = validateCt600Computation(figures);
  if (!check.valid) {
    return { success: false, error: `CT computation is inconsistent: ${check.errors.join("; ")}` };
  }

  const { data: co } = await supabase
    .from("companies")
    .select("company_number")
    .eq("id", figures.company_id)
    .maybeSingle();

  const snapshotData = buildCt600SnapshotData(figures, {
    company_number: (co as { company_number?: string } | null)?.company_number ?? null,
    utr: null, // CT UTR is resolved at submission (Stage C) from tax authorisations / HMRC auth.
  });

  const res = await createSnapshot({
    organizationId: figures.organization_id,
    companyId: figures.company_id,
    snapshotType: "ct600",
    periodStart: figures.period_start,
    periodEnd: figures.period_end,
    snapshotData,
    approvedBy,
  });
  return {
    success: res.success,
    snapshotId: (res.snapshot as { id?: string } | undefined)?.id,
    snapshotHash: res.snapshotHash,
    error: res.error,
  };
}
