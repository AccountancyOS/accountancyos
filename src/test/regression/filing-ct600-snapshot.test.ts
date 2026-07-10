import { describe, it, expect } from "vitest";
import {
  validateCt600Computation,
  buildCt600SnapshotData,
  type CtComputationFigures,
} from "@/lib/filing-ct600-snapshot-model";

const OK: CtComputationFigures = {
  id: "ct-1",
  organization_id: "org-1",
  company_id: "co-1",
  accounts_snapshot_id: "acc-1",
  period_start: "2025-04-01",
  period_end: "2026-03-31",
  accounting_profit: 100000,
  add_backs: { depreciation: 5000 },
  deductions: { capital_allowances: 8000 },
  total_capital_allowances: 8000,
  balancing_charges: 0,
  taxable_total_profits: 97000,
  corporation_tax_rate: 0.19,
  marginal_relief: 0,
  corporation_tax_due: 18430, // 97000 * 0.19
  pools_summary: [],
  claims_summary: [],
};

describe("validateCt600Computation (Stage A CT600)", () => {
  it("accepts a consistent computation", () => {
    expect(validateCt600Computation(OK)).toEqual({ valid: true, errors: [] });
  });

  it("rejects CT due greater than tax before marginal relief", () => {
    const r = validateCt600Computation({ ...OK, corporation_tax_due: 30000 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("exceeds tax before marginal relief"))).toBe(true);
  });

  it("rejects an out-of-range tax rate", () => {
    expect(validateCt600Computation({ ...OK, corporation_tax_rate: 1.5 }).valid).toBe(false);
    expect(validateCt600Computation({ ...OK, corporation_tax_rate: 0 }).valid).toBe(false);
  });

  it("rejects negative tax due and negative marginal relief", () => {
    expect(validateCt600Computation({ ...OK, corporation_tax_due: -1 }).valid).toBe(false);
    expect(validateCt600Computation({ ...OK, marginal_relief: -5 }).valid).toBe(false);
  });

  it("accepts marginal relief that reduces CT due below tax-before-relief", () => {
    // 25% main rate with marginal relief.
    const mr = { ...OK, corporation_tax_rate: 0.25, corporation_tax_due: 22000, marginal_relief: 2250 };
    expect(validateCt600Computation(mr).valid).toBe(true);
  });
});

describe("buildCt600SnapshotData (Stage A CT600)", () => {
  it("freezes the computation basis + company identifiers + period", () => {
    const d = buildCt600SnapshotData(OK, { company_number: "12345678", utr: null }) as any;
    expect(d.snapshot_type).toBe("ct600");
    expect(d.company).toEqual({ number: "12345678", utr: null });
    expect(d.period).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(d.computation.taxableTotalProfits).toBe(97000);
    expect(d.computation.corporationTaxDue).toBe(18430);
    expect(d.computation.corporationTaxRate).toBe(0.19);
    expect(d.accounts_snapshot_id).toBe("acc-1");
  });
});
