/**
 * Proposal Phase 1 Task 6b-3 — MTD ITSA tax-year decomposition.
 *
 * A UK MTD ITSA tax year runs 6 April (year Y) → 5 April (year Y+1) and is
 * labelled `YYYY/YY` (e.g. 2025/26) — the SAME tax-year identity as Task 3's
 * Self-Assessment. An MTD ITSA obligation decomposes into:
 *   - FOUR standard 5th-ending quarters (`mtd_quarter`), and
 *   - ONE annual final declaration (`mtd_itsa_final`),
 * each a first-class, separately-priceable service that becomes its own job.
 *
 * Each line carries its exact `(period_start, period_end, period_label)`.
 * `lifecycle_materialize_jobs` COALESCEs the line's period over its computed
 * fallback, and the dedup key includes `period_label`, so:
 *   - 4 distinct quarter labels → 4 distinct MTD Quarterly jobs, and
 *   - 1 final label            → 1 MTD Final Declaration job,
 * per selected tax year. The live `calculate_deadline` arms then map:
 *   - `mtd_quarter`     period_end (5 Jul/Oct/Jan/Apr) → fixed 7 Aug/Nov/Feb/May
 *   - `mtd_itsa_final`  period_end (5 Apr Y+1)         → 31 Jan Y+2
 *
 * The `YYYY/YY` tax-year suffix is reused byte-for-byte from `sa-periods` so the
 * MTD and SA period identities for the same year never drift.
 */
import { saTaxYearToPeriod, type BillingFrequency } from "./sa-periods";

export const MTD_SERVICE_CODES = ["mtd_quarter", "mtd_itsa_final"] as const;
export type MtdServiceCode = (typeof MTD_SERVICE_CODES)[number];

export interface MtdPeriod {
  /** ISO date `YYYY-MM-DD`. */
  period_start: string;
  /** ISO date `YYYY-MM-DD`. */
  period_end: string;
  /** e.g. `MTD Q1 2025/26` or `MTD Final 2025/26`. */
  period_label: string;
}

/** A drafted MTD quote line (period-carrying) ready to insert as a `quote_lines` row. */
export interface MtdLineDraft extends MtdPeriod {
  service_id: string;
  quantity: number;
  unit_price: number;
  billing_frequency: BillingFrequency;
}

export interface BuildMtdLinesInput {
  service_id: string;
  default_price: number;
  /**
   * MTD filings are per-period one-off deliverables by default (`now`). An
   * accountant proposing an ongoing MTD engagement can override to `monthly`.
   */
  billing_frequency?: BillingFrequency;
}

/** True only for the dedicated MTD Quarterly Filing catalog code. */
export function isMtdQuarterServiceCode(code: string | null | undefined): code is "mtd_quarter" {
  return code === "mtd_quarter";
}

/** True only for the dedicated MTD Final Declaration catalog code. */
export function isMtdFinalServiceCode(code: string | null | undefined): code is "mtd_itsa_final" {
  return code === "mtd_itsa_final";
}

/** True for either MTD ITSA catalog code (quarter or final). */
export function isMtdServiceCode(code: string | null | undefined): code is MtdServiceCode {
  return isMtdQuarterServiceCode(code) || isMtdFinalServiceCode(code);
}

/** The `YYYY/YY` tax-year suffix for a start year — reused from the SA helper. */
function taxYearSuffix(taxYearStartYear: number): string {
  return saTaxYearToPeriod(taxYearStartYear).period_label; // e.g. '2025/26'
}

/**
 * The four STANDARD 5th-ending quarters of tax year `startYear/startYear+1`:
 *   Q1  startYear-04-06 … startYear-07-05
 *   Q2  startYear-07-06 … startYear-10-05
 *   Q3  startYear-10-06 … (startYear+1)-01-05
 *   Q4  (startYear+1)-01-06 … (startYear+1)-04-05
 * Labels are DISTINCT per quarter, `MTD Q{n} YYYY/YY`.
 *
 * @example mtdQuartersForTaxYear(2025)[0]
 *   // → { '2025-04-06', '2025-07-05', 'MTD Q1 2025/26' }
 */
export function mtdQuartersForTaxYear(taxYearStartYear: number): [MtdPeriod, MtdPeriod, MtdPeriod, MtdPeriod] {
  const y = taxYearStartYear;
  const n = taxYearStartYear + 1;
  const suffix = taxYearSuffix(taxYearStartYear);
  return [
    { period_start: `${y}-04-06`, period_end: `${y}-07-05`, period_label: `MTD Q1 ${suffix}` },
    { period_start: `${y}-07-06`, period_end: `${y}-10-05`, period_label: `MTD Q2 ${suffix}` },
    { period_start: `${y}-10-06`, period_end: `${n}-01-05`, period_label: `MTD Q3 ${suffix}` },
    { period_start: `${n}-01-06`, period_end: `${n}-04-05`, period_label: `MTD Q4 ${suffix}` },
  ];
}

/**
 * The annual MTD Final Declaration period for tax year `startYear/startYear+1` —
 * the whole tax year. The live `mtd_itsa_final` deadline arm turns its
 * `period_end` (5 Apr Y+1) into 31 Jan Y+2.
 *
 * @example mtdFinalForTaxYear(2025)
 *   // → { '2025-04-06', '2026-04-05', 'MTD Final 2025/26' }
 */
export function mtdFinalForTaxYear(taxYearStartYear: number): MtdPeriod {
  const { period_start, period_end } = saTaxYearToPeriod(taxYearStartYear);
  return { period_start, period_end, period_label: `MTD Final ${taxYearSuffix(taxYearStartYear)}` };
}

/** De-duplicate and sort tax-year start years ascending (oldest first). */
function normaliseYears(taxYearStartYears: number[]): number[] {
  return Array.from(new Set(taxYearStartYears)).sort((a, b) => a - b);
}

/**
 * Build FOUR period-carrying MTD Quarterly lines per selected tax-year start
 * year. Years are de-duplicated and sorted ascending (oldest quarter first), so
 * the resulting lines are chronological and every `period_label` is distinct.
 * Each line is independently priced (default price; editable per line after).
 */
export function buildMtdQuarterLines(
  input: BuildMtdLinesInput,
  taxYearStartYears: number[]
): MtdLineDraft[] {
  const frequency: BillingFrequency = input.billing_frequency ?? "now";
  return normaliseYears(taxYearStartYears).flatMap((year) =>
    mtdQuartersForTaxYear(year).map((period) => ({
      service_id: input.service_id,
      quantity: 1,
      unit_price: input.default_price,
      billing_frequency: frequency,
      ...period,
    }))
  );
}

/**
 * Build ONE period-carrying MTD Final Declaration line per selected tax-year
 * start year (de-duplicated, ascending).
 */
export function buildMtdFinalLines(
  input: BuildMtdLinesInput,
  taxYearStartYears: number[]
): MtdLineDraft[] {
  const frequency: BillingFrequency = input.billing_frequency ?? "now";
  return normaliseYears(taxYearStartYears).map((year) => ({
    service_id: input.service_id,
    quantity: 1,
    unit_price: input.default_price,
    billing_frequency: frequency,
    ...mtdFinalForTaxYear(year),
  }));
}

/** Recover the tax-year START year from any `MTD … YYYY/YY` label. */
export function mtdStartYearFromLabel(label: string): number {
  const match = label.match(/(\d{4})\/\d{2}$/);
  if (!match) return NaN;
  return parseInt(match[1], 10);
}
