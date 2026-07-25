/**
 * Proposal Phase 1 Task 5b — VAT frequency/stagger period selection.
 *
 * The DB function is the SINGLE source of truth for the stagger math and the
 * period_label:
 *
 *   public.generate_vat_periods(p_frequency text, p_stagger int, p_from date, p_to date)
 *     RETURNS TABLE(period_start date, period_end date, period_label text)
 *
 *   - monthly           → 12 periods/yr; p_stagger ignored; label 'VAT M/E DD Mon YYYY'
 *   - quarterly         → p_stagger 1|2|3 (Mar/Jun/Sep/Dec | Apr/Jul/Oct/Jan |
 *                         May/Aug/Nov/Feb quarter-ends); label 'VAT Q/E DD Mon YYYY'
 *   - annual_accounting → one period/yr; p_stagger is the period-END MONTH 1..12;
 *                         label 'VAT Y/E DD Mon YYYY'  (alias: 'annual')
 *
 * The engine's own VAT branch produces only a 'Setup Pending' placeholder, so
 * there is NO engine label to mirror — the generator's `period_label` is
 * authoritative. These helpers therefore NEVER re-implement stagger math or
 * construct labels. They only:
 *   (a) translate the accountant's frequency/stagger choice into the function's
 *       `p_stagger` integer + `generate_vat_periods` args,
 *   (b) gate the UI on a complete config + at least one selected period (and, for
 *       ongoing VAT work, an identified first ongoing period), and
 *   (c) map already-generated periods to one `vat_return` quote line each.
 */

export const VAT_SERVICE_CODE = "vat_return" as const;
export type VatServiceCode = typeof VAT_SERVICE_CODE;

export type BillingFrequency = "now" | "monthly";

/** The three VAT return frequencies the generator supports. */
export const VAT_FREQUENCIES = ["monthly", "quarterly", "annual_accounting"] as const;
export type VatFrequency = (typeof VAT_FREQUENCIES)[number];

/** A generated candidate period (a single row from `generate_vat_periods`). */
export interface VatPeriod {
  /** ISO date `YYYY-MM-DD`, first day of the VAT period. */
  period_start: string;
  /** ISO date `YYYY-MM-DD`, the VAT period-end. */
  period_end: string;
  /** e.g. `VAT Q/E 31 Mar 2026` — authoritative, straight from the DB function. */
  period_label: string;
}

/** The accountant's frequency + stagger selection for one VAT service group. */
export interface VatConfig {
  frequency: VatFrequency | null;
  /** Quarterly only: the 1/2/3 HMRC stagger group. */
  staggerGroup: 1 | 2 | 3 | null;
  /** Annual accounting only: the period-END month (1 = Jan … 12 = Dec). */
  annualEndMonth: number | null;
}

/** True only for the catalog code the VAT materialize branch keys on. */
export function isVatServiceCode(code: string | null | undefined): code is VatServiceCode {
  return code === VAT_SERVICE_CODE;
}

/** Narrow an arbitrary value to a supported VAT frequency. */
export function isVatFrequency(x: unknown): x is VatFrequency {
  return typeof x === "string" && (VAT_FREQUENCIES as readonly string[]).includes(x);
}

/**
 * Translate a config into the DB function's `p_stagger` integer:
 *   quarterly → the 1/2/3 group; annual → the end-month; monthly → null.
 * Returns `null` when the required value for the frequency is not set.
 */
export function vatStaggerParam(config: VatConfig): number | null {
  if (config.frequency === "quarterly") return config.staggerGroup ?? null;
  if (config.frequency === "annual_accounting") return config.annualEndMonth ?? null;
  return null; // monthly (or unset) — the function ignores stagger for monthly
}

/**
 * Whether the config is complete enough to call the generator: frequency set,
 * and (for quarterly) a valid 1/2/3 group / (for annual) a valid 1..12 month.
 */
export function isVatConfigComplete(config: VatConfig): boolean {
  if (config.frequency === "monthly") return true;
  if (config.frequency === "quarterly") {
    return config.staggerGroup === 1 || config.staggerGroup === 2 || config.staggerGroup === 3;
  }
  if (config.frequency === "annual_accounting") {
    return (
      typeof config.annualEndMonth === "number" &&
      config.annualEndMonth >= 1 &&
      config.annualEndMonth <= 12
    );
  }
  return false;
}

/** The exact argument shape for `supabase.rpc('generate_vat_periods', …)`. */
export interface VatGeneratorArgs {
  p_frequency: string;
  p_stagger: number | null;
  p_from: string;
  p_to: string;
}

/**
 * Build the `generate_vat_periods` RPC payload for `[from, to]`, or `null` when
 * the config is incomplete (so the caller never fires an invalid RPC). Note the
 * generator rejects a NULL `p_stagger` for annual — `isVatConfigComplete`
 * guarantees a month is present before we get here.
 */
export function vatGeneratorArgs(
  config: VatConfig,
  from: string,
  to: string
): VatGeneratorArgs | null {
  if (!isVatConfigComplete(config) || !config.frequency) return null;
  return {
    p_frequency: config.frequency,
    p_stagger: vatStaggerParam(config),
    p_from: from,
    p_to: to,
  };
}

/** Shift a Date by whole years (UTC) and format as ISO `YYYY-MM-DD`. */
function isoShiftYears(now: Date, deltaYears: number): string {
  return new Date(
    Date.UTC(now.getUTCFullYear() + deltaYears, now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * The default candidate window to query: ~2 years back (catch-up returns) to
 * ~1 year forward (upcoming ongoing returns) from `now`.
 */
export function defaultVatWindow(now: Date = new Date()): { from: string; to: string } {
  return { from: isoShiftYears(now, -2), to: isoShiftYears(now, 1) };
}

/** A drafted VAT quote line (period-carrying) ready to insert as a `quote_lines` row. */
export interface VatLineDraft extends VatPeriod {
  service_id: string;
  quantity: number;
  unit_price: number;
  billing_frequency: BillingFrequency;
}

export interface BuildVatLinesInput {
  service_id: string;
  default_price: number;
  /** VAT is an ongoing engagement — defaults to `monthly`. */
  billing_frequency?: BillingFrequency;
}

/**
 * Map the accountant's SELECTED generator rows to one `vat_return` line each.
 * The generator already computed period_start/end/label; this helper only
 * copies those verbatim onto priced lines — it never re-derives stagger math or
 * labels. Periods are de-duplicated by `period_label` and sorted ascending by
 * period_end (oldest catch-up first). Empty selection → `[]`.
 */
export function buildVatLines(
  input: BuildVatLinesInput,
  selectedPeriods: VatPeriod[]
): VatLineDraft[] {
  const frequency: BillingFrequency = input.billing_frequency ?? "monthly";
  const byLabel = new Map<string, VatPeriod>();
  for (const p of selectedPeriods) byLabel.set(p.period_label, p);
  const unique = Array.from(byLabel.values()).sort((a, b) =>
    a.period_end < b.period_end ? -1 : a.period_end > b.period_end ? 1 : 0
  );
  return unique.map((period) => ({
    service_id: input.service_id,
    quantity: 1,
    unit_price: input.default_price,
    billing_frequency: frequency,
    period_start: period.period_start,
    period_end: period.period_end,
    period_label: period.period_label,
  }));
}

/** The gating state for one VAT service group (drives submit + inline errors). */
export interface VatGroupState {
  config: VatConfig;
  /** Labels of the periods the accountant has selected. */
  selectedLabels: string[];
  /** Whether ongoing VAT work (not just historic catch-up) is being proposed. */
  ongoing: boolean;
  /** The label the accountant marked as the FIRST ongoing VAT period. */
  ongoingStartLabel: string | null;
}

/**
 * Validation gate for a VAT service group: complete config, at least one
 * selected period, and — when ongoing VAT work is proposed — an identified
 * first ongoing period that is itself one of the selected periods.
 */
export function isVatGroupValid(state: VatGroupState): boolean {
  if (!isVatConfigComplete(state.config)) return false;
  if (state.selectedLabels.length === 0) return false;
  if (state.ongoing) {
    if (!state.ongoingStartLabel) return false;
    if (!state.selectedLabels.includes(state.ongoingStartLabel)) return false;
  }
  return true;
}

/** Minimal company shape carrying the stored VAT registration settings. */
export interface CompanyVatSource {
  vat_frequency?: string | null;
  vat_stagger_group?: number | null;
}

/**
 * Best-effort prefill of a VAT config from a linked company's stored settings
 * (`companies.vat_frequency` / `vat_stagger_group`). Frequency strings are
 * normalised case-insensitively (`'QUARTERLY'` → `'quarterly'`, `'ANNUAL'` /
 * `'ANNUAL_ACCOUNTING'` → `'annual_accounting'`). The accountant must still
 * confirm/complete it (an annual period-end month is never inferred here).
 * Returns an all-null config when nothing usable is available.
 */
export function vatConfigFromCompany(company: CompanyVatSource | null | undefined): VatConfig {
  const empty: VatConfig = { frequency: null, staggerGroup: null, annualEndMonth: null };
  if (!company || !company.vat_frequency) return empty;
  const raw = company.vat_frequency.toLowerCase();
  let frequency: VatFrequency | null = null;
  if (raw === "monthly") frequency = "monthly";
  else if (raw === "quarterly") frequency = "quarterly";
  else if (raw === "annual" || raw === "annual_accounting") frequency = "annual_accounting";
  if (!frequency) return empty;

  const g = company.vat_stagger_group;
  const staggerGroup: 1 | 2 | 3 | null =
    frequency === "quarterly" && (g === 1 || g === 2 || g === 3) ? g : null;

  return { frequency, staggerGroup, annualEndMonth: null };
}
