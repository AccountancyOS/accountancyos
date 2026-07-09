import { describe, it, expect } from "vitest";
import {
  validateVatBoxes,
  buildVatSnapshotData,
  type VatReturnFigures,
} from "@/lib/filing-vat-snapshot-model";

/**
 * Filing Stage A.1 — VAT snapshot population. Pins the box arithmetic guard and the normalised
 * model shape (the frozen 9-box payload basis) that a VAT submission will project from.
 */
const CONSISTENT: VatReturnFigures = {
  id: "vat-1",
  organization_id: "org-1",
  client_id: null,
  company_id: "co-1",
  period_start: "2026-01-01",
  period_end: "2026-03-31",
  box_1_vat_due_sales: 1000,
  box_2_vat_due_acquisitions: 200,
  box_3_total_vat_due: 1200, // = box1 + box2
  box_4_vat_reclaimed: 500,
  box_5_net_vat: 700, // = |box3 - box4|
  box_6_total_sales: 6000,
  box_7_total_purchases: 2500,
  box_8_total_supplies_eu: 0,
  box_9_total_acquisitions_eu: 0,
};

describe("validateVatBoxes (Stage A.1)", () => {
  it("accepts arithmetically consistent boxes", () => {
    expect(validateVatBoxes(CONSISTENT)).toEqual({ valid: true, errors: [] });
  });

  it("rejects box 3 != box 1 + box 2", () => {
    const r = validateVatBoxes({ ...CONSISTENT, box_3_total_vat_due: 1300 });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/Box 3/);
  });

  it("rejects box 5 != |box 3 - box 4|", () => {
    const r = validateVatBoxes({ ...CONSISTENT, box_5_net_vat: 999 });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/Box 5/);
  });

  it("box 5 is the absolute difference (reclaim position)", () => {
    // box4 > box3 -> net is reclaimable; box5 is still non-negative.
    const reclaim = { ...CONSISTENT, box_4_vat_reclaimed: 1500, box_5_net_vat: 300 };
    expect(validateVatBoxes(reclaim).valid).toBe(true);
  });
});

describe("buildVatSnapshotData (Stage A.1)", () => {
  it("freezes the 9-box HMRC payload basis + period + vrn", () => {
    const d = buildVatSnapshotData(CONSISTENT, "GB123456789") as any;
    expect(d.snapshot_type).toBe("vat_return");
    expect(d.vrn).toBe("GB123456789");
    expect(d.period).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(d.boxes).toEqual({
      vatDueSales: 1000,
      vatDueAcquisitions: 200,
      totalVatDue: 1200,
      vatReclaimedCurrPeriod: 500,
      netVatDue: 700,
      totalValueSalesExVAT: 6000,
      totalValuePurchasesExVAT: 2500,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    });
  });

  it("rounds figures to 2dp and tolerates a missing vrn", () => {
    const d = buildVatSnapshotData({ ...CONSISTENT, box_1_vat_due_sales: 1000.005 }, null) as any;
    expect(d.vrn).toBeNull();
    expect(d.boxes.vatDueSales).toBe(1000.01);
  });
});
