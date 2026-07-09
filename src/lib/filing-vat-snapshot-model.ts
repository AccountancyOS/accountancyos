/**
 * Filing Stage A.1 — pure VAT snapshot model (no DB import, unit-tested directly).
 * Builds the normalised, frozen 9-box VAT payload basis and enforces HMRC's box arithmetic.
 */
import type { SnapshotData } from "@/lib/filing-snapshot-service";

/** The canonical VAT-return figures a snapshot is built from (boxes 1-9 + period + entity). */
export interface VatReturnFigures {
  id: string;
  organization_id: string;
  client_id: string | null;
  company_id: string | null;
  period_start: string;
  period_end: string;
  box_1_vat_due_sales: number;
  box_2_vat_due_acquisitions: number;
  box_3_total_vat_due: number;
  box_4_vat_reclaimed: number;
  box_5_net_vat: number;
  box_6_total_sales: number;
  box_7_total_purchases: number;
  box_8_total_supplies_eu: number;
  box_9_total_acquisitions_eu: number;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * HMRC's own arithmetic invariants for the 9-box VAT return:
 *   box3 = box1 + box2   (total VAT due)
 *   box5 = |box3 - box4| (net VAT payable/reclaimable — always non-negative)
 * A snapshot must not be built from figures that violate these.
 */
export function validateVatBoxes(f: VatReturnFigures): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const box3Expected = round2(f.box_1_vat_due_sales + f.box_2_vat_due_acquisitions);
  if (round2(f.box_3_total_vat_due) !== box3Expected) {
    errors.push(`Box 3 (${round2(f.box_3_total_vat_due)}) must equal Box 1 + Box 2 (${box3Expected})`);
  }
  const box5Expected = round2(Math.abs(round2(f.box_3_total_vat_due) - round2(f.box_4_vat_reclaimed)));
  if (round2(f.box_5_net_vat) !== box5Expected) {
    errors.push(`Box 5 (${round2(f.box_5_net_vat)}) must equal |Box 3 - Box 4| (${box5Expected})`);
  }
  return { valid: errors.length === 0, errors };
}

/** Pure: build the normalised VAT snapshot model from the return figures + resolved VRN. */
export function buildVatSnapshotData(f: VatReturnFigures, vrn: string | null): SnapshotData {
  return {
    snapshot_type: "vat_return",
    generator: "vat-snapshot@1",
    vat_return_id: f.id,
    vrn: vrn ?? null,
    period: { start: f.period_start, end: f.period_end },
    // HMRC MTD 9-box payload basis — the figures that will be submitted, frozen at snapshot time.
    boxes: {
      vatDueSales: round2(f.box_1_vat_due_sales),
      vatDueAcquisitions: round2(f.box_2_vat_due_acquisitions),
      totalVatDue: round2(f.box_3_total_vat_due),
      vatReclaimedCurrPeriod: round2(f.box_4_vat_reclaimed),
      netVatDue: round2(f.box_5_net_vat),
      totalValueSalesExVAT: round2(f.box_6_total_sales),
      totalValuePurchasesExVAT: round2(f.box_7_total_purchases),
      totalValueGoodsSuppliedExVAT: round2(f.box_8_total_supplies_eu),
      totalAcquisitionsExVAT: round2(f.box_9_total_acquisitions_eu),
    },
  };
}
