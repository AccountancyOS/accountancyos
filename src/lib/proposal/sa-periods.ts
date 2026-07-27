/**
 * Proposal Phase 1 Task 3 — Self-Assessment multiple exact tax years.
 *
 * A UK Self-Assessment tax year runs 6 April (year Y) → 5 April (year Y+1) and
 * is labelled `YYYY/YY` (e.g. 2023/24). `lifecycle_materialize_jobs` computes
 * exactly this for its SA branch:
 *
 *   period_start = make_date(Y, 4, 6)
 *   period_end   = make_date(Y+1, 4, 5)
 *   period_label = EXTRACT(YEAR FROM start) || '/' || substr(EXTRACT(YEAR FROM end)::text, 3, 2)
 *
 * When a proposal writes one `quote_lines` row per selected tax year with these
 * fields, the engine (which COALESCEs the explicit line period over its computed
 * fallback) emits one distinct SA job per year — the dedup key includes
 * `period_label`. The helpers below MIRROR the engine format byte-for-byte so
 * the two never drift.
 */

export const SA_SERVICE_CODES = ["sa_non_mtd", "sa_mtd"] as const;
export type SaServiceCode = (typeof SA_SERVICE_CODES)[number];

import type { BillingFrequency } from "@/lib/db-constants/check-constraints";
export type { BillingFrequency };

export interface SaPeriod {
  /** ISO date `YYYY-MM-DD`, 6 Apr of the tax-year start year. */
  period_start: string;
  /** ISO date `YYYY-MM-DD`, 5 Apr of the following year. */
  period_end: string;
  /** `YYYY/YY`, e.g. `2023/24`. */
  period_label: string;
}

/** A drafted SA quote line (period-carrying) ready to insert as a `quote_lines` row. */
export interface SaLineDraft extends SaPeriod {
  service_id: string;
  quantity: number;
  unit_price: number;
  billing_frequency: BillingFrequency;
}

export interface BuildSaLinesInput {
  service_id: string;
  default_price: number;
  /**
   * SA returns are per-year one-off deliverables — a historic-only `sa_non_mtd`
   * return must NOT be forced onto a monthly/ongoing plan. Defaults to `now`.
   */
  billing_frequency?: BillingFrequency;
}

/** True only for the two catalog codes the SA materialize branch keys on. */
export function isSaServiceCode(code: string | null | undefined): code is SaServiceCode {
  return code === "sa_non_mtd" || code === "sa_mtd";
}

/**
 * Convert a tax-year START year (the calendar year containing its 6 April) into
 * the exact `{ period_start, period_end, period_label }` the engine produces.
 *
 * @example saTaxYearToPeriod(2023) // → { '2023-04-06', '2024-04-05', '2023/24' }
 */
export function saTaxYearToPeriod(taxYearStartYear: number): SaPeriod {
  const endYear = taxYearStartYear + 1;
  // Two-digit end suffix, mirroring Postgres `substr(end_year::text, 3, 2)`.
  const endSuffix = String(endYear).slice(-2).padStart(2, "0");
  return {
    period_start: `${taxYearStartYear}-04-06`,
    period_end: `${endYear}-04-05`,
    period_label: `${taxYearStartYear}/${endSuffix}`,
  };
}

/** Recover the tax-year START year from a `YYYY/YY` label. */
export function saStartYearFromLabel(label: string): number {
  return parseInt(label.slice(0, 4), 10);
}

/**
 * The tax-year start year in effect for `now` — the SA year begins 6 April.
 * Before 6 April we are still in the previous tax year.
 */
export function currentTaxYearStartYear(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  if (month > 4 || (month === 4 && day >= 6)) return year;
  return year - 1;
}

/**
 * Offer a sensible recent range of tax years to select from — the current tax
 * year first, then the previous `count - 1` years (descending). Default 7 =
 * current + last 6.
 */
export function recentTaxYearStartYears(count = 7, now: Date = new Date()): number[] {
  const current = currentTaxYearStartYear(now);
  const years: number[] = [];
  for (let i = 0; i < count; i++) years.push(current - i);
  return years;
}

/**
 * Build one period-carrying SA line per selected tax-year start year. The input
 * list is de-duplicated and sorted ascending for stable, chronological ordering
 * (oldest return first). Each line is independently priced (default price; the
 * accountant can edit per line afterwards).
 */
export function buildSaLines(
  input: BuildSaLinesInput,
  taxYearStartYears: number[]
): SaLineDraft[] {
  const frequency: BillingFrequency = input.billing_frequency ?? "now";
  const years = Array.from(new Set(taxYearStartYears)).sort((a, b) => a - b);
  return years.map((year) => {
    const period = saTaxYearToPeriod(year);
    return {
      service_id: input.service_id,
      quantity: 1,
      unit_price: input.default_price,
      billing_frequency: frequency,
      ...period,
    };
  });
}
