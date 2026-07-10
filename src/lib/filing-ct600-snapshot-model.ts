/**
 * Filing Stage A (CT600) — pure snapshot model (no DB import, unit-tested).
 * Freezes the corporation-tax computation basis (profit -> adjustments -> TTP -> tax) plus the
 * company identifiers and accounting period, and enforces CT sanity invariants before a snapshot
 * is built from potentially-inconsistent figures.
 */
import type { SnapshotData } from "@/lib/filing-snapshot-service";

/** The canonical CT computation a CT600 snapshot is built from (from ct_computation_snapshots). */
export interface CtComputationFigures {
  id: string;
  organization_id: string;
  company_id: string;
  accounts_snapshot_id: string;
  period_start: string;
  period_end: string;
  accounting_profit: number;
  add_backs: Record<string, unknown>;
  deductions: Record<string, unknown>;
  total_capital_allowances: number;
  balancing_charges: number;
  taxable_total_profits: number;
  corporation_tax_rate: number;
  marginal_relief: number;
  corporation_tax_due: number;
  pools_summary: unknown[];
  claims_summary: unknown[];
}

export interface CompanyIdentifiers {
  company_number: string | null;
  utr: string | null;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Corporation-tax invariants a computation must satisfy before we freeze it:
 *   - taxable total profits, tax due and marginal relief are finite; TTP and CT due are >= 0
 *   - the CT rate is a fraction in (0, 1]  (e.g. 0.19, 0.25)
 *   - CT due cannot exceed the tax before marginal relief (TTP * rate), since relief only reduces
 *   - CT due cannot exceed taxable total profits
 */
export function validateCt600Computation(f: CtComputationFigures): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isNum(f.taxable_total_profits)) errors.push("Taxable total profits is missing");
  if (!isNum(f.corporation_tax_due) || f.corporation_tax_due < 0) errors.push("Corporation tax due must be >= 0");
  if (!isNum(f.taxable_total_profits) || f.taxable_total_profits < 0) errors.push("Taxable total profits must be >= 0");
  if (!isNum(f.corporation_tax_rate) || f.corporation_tax_rate <= 0 || f.corporation_tax_rate > 1) {
    errors.push(`Corporation tax rate ${f.corporation_tax_rate} is out of range (0, 1]`);
  }
  if (isNum(f.marginal_relief) && f.marginal_relief < 0) errors.push("Marginal relief cannot be negative");

  if (isNum(f.taxable_total_profits) && isNum(f.corporation_tax_rate) && isNum(f.corporation_tax_due)) {
    const taxBeforeRelief = round2(f.taxable_total_profits * f.corporation_tax_rate);
    // +0.01 tolerance for rounding.
    if (round2(f.corporation_tax_due) > taxBeforeRelief + 0.01) {
      errors.push(`CT due (${round2(f.corporation_tax_due)}) exceeds tax before marginal relief (${taxBeforeRelief})`);
    }
    if (round2(f.corporation_tax_due) > round2(f.taxable_total_profits) + 0.01) {
      errors.push("CT due exceeds taxable total profits");
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Pure: build the normalised CT600 snapshot model from the computation + company identifiers. */
export function buildCt600SnapshotData(f: CtComputationFigures, company: CompanyIdentifiers): SnapshotData {
  return {
    snapshot_type: "ct600",
    generator: "ct600-snapshot@1",
    ct_computation_snapshot_id: f.id,
    accounts_snapshot_id: f.accounts_snapshot_id,
    company: { number: company.company_number ?? null, utr: company.utr ?? null },
    period: { start: f.period_start, end: f.period_end },
    // Frozen CT600 computation basis.
    computation: {
      accountingProfit: round2(f.accounting_profit),
      addBacks: f.add_backs ?? {},
      deductions: f.deductions ?? {},
      totalCapitalAllowances: round2(f.total_capital_allowances),
      balancingCharges: round2(f.balancing_charges),
      taxableTotalProfits: round2(f.taxable_total_profits),
      corporationTaxRate: f.corporation_tax_rate,
      marginalRelief: round2(f.marginal_relief),
      corporationTaxDue: round2(f.corporation_tax_due),
      poolsSummary: f.pools_summary ?? [],
      claimsSummary: f.claims_summary ?? [],
    },
  };
}
