/**
 * UK Tax Calculation Engine — Self Assessment (SA) ONLY
 *
 * CANONICAL ENGINE ASSIGNMENTS:
 *   SA  → this file (calculateSelfAssessmentTax)
 *   CT  → ct-computation-engine.ts (computeCorporationTax)
 *   VAT → vat-ledger-aggregator.ts (aggregateVATFromLedger)
 *
 * Tax rates are fetched from DB via tax-rates-service.ts.
 * The synchronous getTaxYearConfig() is kept only as emergency fallback;
 * production code must use getTaxYearConfigFromDB().
 */

import { fetchSARates, saRateToTaxYearConfig } from "./tax-rates-service";

// ==================== TAX YEAR CONFIG INTERFACE ====================

export interface TaxYearConfig {
  year: string;
  personalAllowance: number;
  personalAllowanceTaperThreshold: number;
  basicRateLimit: number;
  higherRateLimit: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
  dividendAllowance: number;
  dividendBasicRate: number;
  dividendHigherRate: number;
  dividendAdditionalRate: number;
  class2Threshold: number;
  class2WeeklyRate: number;
  class4LowerLimit: number;
  class4UpperLimit: number;
  class4MainRate: number;
  class4AdditionalRate: number;
  // CT rates — DO NOT USE. CT uses ct-computation-engine + ct_rate_tables.
  ctSmallProfitsRate: number;
  ctMainRate: number;
  ctSmallProfitsLimit: number;
  ctMarginalReliefUpperLimit: number;
  ctMarginalReliefFraction: number;
}

// ==================== DEPRECATED — hardcoded configs ====================
/** @deprecated Use getTaxYearConfigFromDB() instead */
export const TAX_YEAR_CONFIGS: Record<string, TaxYearConfig> = {
  "2024/25": {
    year: "2024/25",
    personalAllowance: 12570,
    personalAllowanceTaperThreshold: 100000,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.20,
    higherRate: 0.40,
    additionalRate: 0.45,
    dividendAllowance: 500,
    dividendBasicRate: 0.0875,
    dividendHigherRate: 0.3375,
    dividendAdditionalRate: 0.3935,
    class2Threshold: 12570,
    class2WeeklyRate: 3.45,
    class4LowerLimit: 12570,
    class4UpperLimit: 50270,
    class4MainRate: 0.06,
    class4AdditionalRate: 0.02,
    ctSmallProfitsRate: 0.19,
    ctMainRate: 0.25,
    ctSmallProfitsLimit: 50000,
    ctMarginalReliefUpperLimit: 250000,
    ctMarginalReliefFraction: 3 / 200,
  },
  "2023/24": {
    year: "2023/24",
    personalAllowance: 12570,
    personalAllowanceTaperThreshold: 100000,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.20,
    higherRate: 0.40,
    additionalRate: 0.45,
    dividendAllowance: 1000,
    dividendBasicRate: 0.0875,
    dividendHigherRate: 0.3375,
    dividendAdditionalRate: 0.3935,
    class2Threshold: 12570,
    class2WeeklyRate: 3.45,
    class4LowerLimit: 12570,
    class4UpperLimit: 50270,
    class4MainRate: 0.09,
    class4AdditionalRate: 0.02,
    ctSmallProfitsRate: 0.19,
    ctMainRate: 0.25,
    ctSmallProfitsLimit: 50000,
    ctMarginalReliefUpperLimit: 250000,
    ctMarginalReliefFraction: 3 / 200,
  },
};

/** @deprecated Synchronous fallback — use getTaxYearConfigFromDB() for new code */
export function getTaxYearConfig(taxYear?: string): TaxYearConfig {
  return TAX_YEAR_CONFIGS[taxYear || "2024/25"] || TAX_YEAR_CONFIGS["2024/25"];
}

/**
 * Fetch tax year config from DB (preferred path).
 * Returns DB-driven rates; falls back to hardcoded only if DB unreachable.
 */
export async function getTaxYearConfigFromDB(taxYear?: string): Promise<TaxYearConfig> {
  const year = taxYear || "2024/25";
  try {
    const row = await fetchSARates(year);
    return saRateToTaxYearConfig(row);
  } catch {
    console.warn(`DB rate fetch failed for ${year}, using sync fallback`);
    return getTaxYearConfig(year);
  }
}

// ==================== SELF ASSESSMENT CALCULATIONS ====================

export interface SAWorkpaperData {
  employment_income?: number;
  benefits_in_kind?: number;
  employment_expenses?: number;
  self_employment_profit?: number;
  dividends?: number;
  bank_interest?: number;
  property_income?: number;
  other_income?: number;
  pension_contributions?: number;
  gift_aid?: number;
  prior_year_tax_liability?: number;
  prior_year_poa_reduction?: number;
}

export interface SATaxResult {
  total_employment_income: number;
  total_self_employment_profit: number;
  total_dividends: number;
  total_other_income: number;
  gross_income: number;
  total_deductions: number;
  adjusted_net_income: number;
  personal_allowance: number;
  personal_allowance_reduction: number;
  available_personal_allowance: number;
  taxable_income: number;
  taxable_income_non_dividend: number;
  taxable_dividends: number;
  income_tax_basic: number;
  income_tax_higher: number;
  income_tax_additional: number;
  dividend_tax: number;
  total_income_tax: number;
  class2_nic: number;
  class4_nic: number;
  total_nic: number;
  total_tax_liability: number;
  poa_first_payment: number;
  poa_second_payment: number;
  balancing_payment: number;
  first_poa_date: string;
  second_poa_date: string;
  balancing_payment_date: string;
}

/**
 * Calculate Self Assessment tax — pure deterministic function.
 * Accepts an optional pre-fetched config for DB-driven rates.
 * If no config provided, falls back to hardcoded (deprecated).
 */
export function calculateSelfAssessmentTax(
  data: SAWorkpaperData,
  taxYear?: string,
  config?: TaxYearConfig
): SATaxResult {
  const cfg = config || getTaxYearConfig(taxYear);

  const totalEmploymentIncome = Math.max(0,
    (data.employment_income || 0) +
    (data.benefits_in_kind || 0) -
    (data.employment_expenses || 0)
  );

  const totalSelfEmploymentProfit = Math.max(0, data.self_employment_profit || 0);
  const totalDividends = Math.max(0, data.dividends || 0);
  const totalOtherIncome = Math.max(0,
    (data.bank_interest || 0) +
    (data.property_income || 0) +
    (data.other_income || 0)
  );

  const grossIncome = totalEmploymentIncome + totalSelfEmploymentProfit + totalDividends + totalOtherIncome;

  const totalDeductions = (data.pension_contributions || 0) + (data.gift_aid || 0);
  const adjustedNetIncome = Math.max(0, grossIncome - totalDeductions);

  let personalAllowanceReduction = 0;
  if (adjustedNetIncome > cfg.personalAllowanceTaperThreshold) {
    personalAllowanceReduction = Math.min(
      cfg.personalAllowance,
      Math.floor((adjustedNetIncome - cfg.personalAllowanceTaperThreshold) / 2)
    );
  }
  const availablePersonalAllowance = cfg.personalAllowance - personalAllowanceReduction;

  const nonDividendIncome = grossIncome - totalDividends - totalDeductions;
  const taxableNonDividend = Math.max(0, nonDividendIncome - availablePersonalAllowance);

  const remainingAllowance = Math.max(0, availablePersonalAllowance - nonDividendIncome);
  const taxableDividendsBeforeAllowance = Math.max(0, totalDividends - remainingAllowance);
  const taxableDividends = Math.max(0, taxableDividendsBeforeAllowance - cfg.dividendAllowance);

  const taxableIncome = taxableNonDividend + taxableDividends;

  let basicBandUsed = 0;
  let higherBandUsed = 0;
  let additionalBandUsed = 0;

  if (taxableNonDividend > 0) {
    basicBandUsed = Math.min(taxableNonDividend, cfg.basicRateLimit);
    if (taxableNonDividend > cfg.basicRateLimit) {
      higherBandUsed = Math.min(
        taxableNonDividend - cfg.basicRateLimit,
        cfg.higherRateLimit - cfg.basicRateLimit
      );
    }
    if (taxableNonDividend > cfg.higherRateLimit) {
      additionalBandUsed = taxableNonDividend - cfg.higherRateLimit;
    }
  }

  const incomeTaxBasic = basicBandUsed * cfg.basicRate;
  const incomeTaxHigher = higherBandUsed * cfg.higherRate;
  const incomeTaxAdditional = additionalBandUsed * cfg.additionalRate;

  let dividendTax = 0;
  if (taxableDividends > 0) {
    const remainingBasicBand = Math.max(0, cfg.basicRateLimit - basicBandUsed);
    const remainingHigherBand = Math.max(0, cfg.higherRateLimit - cfg.basicRateLimit - higherBandUsed);

    const dividendInBasicBand = Math.min(taxableDividends, remainingBasicBand);
    const dividendInHigherBand = Math.min(
      Math.max(0, taxableDividends - remainingBasicBand),
      remainingHigherBand
    );
    const dividendInAdditionalBand = Math.max(0, taxableDividends - remainingBasicBand - remainingHigherBand);

    dividendTax =
      (dividendInBasicBand * cfg.dividendBasicRate) +
      (dividendInHigherBand * cfg.dividendHigherRate) +
      (dividendInAdditionalBand * cfg.dividendAdditionalRate);
  }

  const totalIncomeTax = incomeTaxBasic + incomeTaxHigher + incomeTaxAdditional + dividendTax;

  let class2Nic = 0;
  let class4Nic = 0;

  if (totalSelfEmploymentProfit > 0) {
    if (totalSelfEmploymentProfit >= cfg.class2Threshold) {
      class2Nic = cfg.class2WeeklyRate * 52;
    }
    if (totalSelfEmploymentProfit > cfg.class4LowerLimit) {
      const profitInMainBand = Math.min(
        totalSelfEmploymentProfit - cfg.class4LowerLimit,
        cfg.class4UpperLimit - cfg.class4LowerLimit
      );
      const profitAboveUpperLimit = Math.max(0, totalSelfEmploymentProfit - cfg.class4UpperLimit);
      class4Nic = (profitInMainBand * cfg.class4MainRate) + (profitAboveUpperLimit * cfg.class4AdditionalRate);
    }
  }

  const totalNic = class2Nic + class4Nic;
  const totalTaxLiability = totalIncomeTax + totalNic;

  const priorYearLiability = data.prior_year_tax_liability || 0;
  const priorYearReduction = data.prior_year_poa_reduction || 0;

  let poaBase = Math.max(0, priorYearLiability - priorYearReduction);
  if (poaBase < 1000) {
    poaBase = 0;
  }

  const poaFirstPayment = Math.ceil(poaBase / 2);
  const poaSecondPayment = Math.ceil(poaBase / 2);
  const balancingPayment = Math.max(0, totalTaxLiability - poaFirstPayment - poaSecondPayment);

  const taxYearStart = parseInt(taxYear?.split("/")[0] || cfg.year?.split("/")[0] || "2024");

  const r = (v: number) => Math.round(v * 100) / 100;

  return {
    total_employment_income: r(totalEmploymentIncome),
    total_self_employment_profit: r(totalSelfEmploymentProfit),
    total_dividends: r(totalDividends),
    total_other_income: r(totalOtherIncome),
    gross_income: r(grossIncome),
    total_deductions: r(totalDeductions),
    adjusted_net_income: r(adjustedNetIncome),
    personal_allowance: cfg.personalAllowance,
    personal_allowance_reduction: r(personalAllowanceReduction),
    available_personal_allowance: r(availablePersonalAllowance),
    taxable_income: r(taxableIncome),
    taxable_income_non_dividend: r(taxableNonDividend),
    taxable_dividends: r(taxableDividends),
    income_tax_basic: r(incomeTaxBasic),
    income_tax_higher: r(incomeTaxHigher),
    income_tax_additional: r(incomeTaxAdditional),
    dividend_tax: r(dividendTax),
    total_income_tax: r(totalIncomeTax),
    class2_nic: r(class2Nic),
    class4_nic: r(class4Nic),
    total_nic: r(totalNic),
    total_tax_liability: r(totalTaxLiability),
    poa_first_payment: poaFirstPayment,
    poa_second_payment: poaSecondPayment,
    balancing_payment: r(balancingPayment),
    first_poa_date: `${taxYearStart + 1}-01-31`,
    second_poa_date: `${taxYearStart + 1}-07-31`,
    balancing_payment_date: `${taxYearStart + 2}-01-31`,
  };
}

// ==================== ASYNC SA CALCULATION (DB-DRIVEN) ====================

/**
 * Calculate Self Assessment tax with DB-driven rates.
 * This is the canonical async entry point for production code.
 */
export async function calculateSelfAssessmentTaxAsync(
  data: SAWorkpaperData,
  taxYear?: string
): Promise<SATaxResult> {
  const config = await getTaxYearConfigFromDB(taxYear);
  return calculateSelfAssessmentTax(data, taxYear, config);
}

// ==================== WORKPAPER INTEGRATION ====================

/**
 * Apply tax calculations to workpaper field values (async, DB-driven).
 * Routes to canonical engines:
 *   SA  → calculateSelfAssessmentTaxAsync (this file)
 *   CT  → computeCorporationTax (ct-computation-engine.ts)
 *   VAT → pass-through (VAT boxes come from vat-ledger-aggregator)
 */
export async function applyTaxCalculationsToWorkpaper(
  fieldValues: Record<string, any>,
  workpaperType: string,
  taxYear?: string,
  periodEnd?: string
): Promise<Record<string, any>> {
  const updatedFields = { ...fieldValues };

  if (workpaperType === "self_assessment" || workpaperType === "SA100") {
    const saData: SAWorkpaperData = {
      employment_income: getFieldAmount(fieldValues, "employment_income"),
      benefits_in_kind: getFieldAmount(fieldValues, "benefits_in_kind"),
      employment_expenses: getFieldAmount(fieldValues, "employment_expenses"),
      self_employment_profit: getFieldAmount(fieldValues, "self_employment_profit"),
      dividends: getFieldAmount(fieldValues, "dividends"),
      bank_interest: getFieldAmount(fieldValues, "bank_interest"),
      property_income: getFieldAmount(fieldValues, "property_income"),
      pension_contributions: getFieldAmount(fieldValues, "pension_contributions"),
      gift_aid: getFieldAmount(fieldValues, "gift_aid"),
      prior_year_tax_liability: getFieldAmount(fieldValues, "prior_year_tax_liability"),
      prior_year_poa_reduction: getFieldAmount(fieldValues, "prior_year_poa_reduction"),
    };

    // DB-driven SA calculation
    const result = await calculateSelfAssessmentTaxAsync(saData, taxYear);

    setFieldValue(updatedFields, "total_income", result.gross_income, "calculation");
    setFieldValue(updatedFields, "personal_allowance", result.available_personal_allowance, "calculation");
    setFieldValue(updatedFields, "taxable_income", result.taxable_income, "calculation");
    setFieldValue(updatedFields, "income_tax", result.total_income_tax, "calculation");
    setFieldValue(updatedFields, "national_insurance", result.total_nic, "calculation");
    setFieldValue(updatedFields, "total_tax_due", result.total_tax_liability, "calculation");
    setFieldValue(updatedFields, "tax_calculation_breakdown", result, "calculation");

  } else if (workpaperType === "ct600" || workpaperType === "corporation_tax") {
    // CT: Route to canonical ct-computation-engine
    // The CT computation requires async DB rate lookup — done inside computeCorporationTax
    const { computeCorporationTax } = await import("./ct-computation-engine");

    const accountingProfit = getFieldAmount(fieldValues, "accounting_profit") || getFieldAmount(fieldValues, "profit_before_tax");
    const depreciation = getFieldAmount(fieldValues, "depreciation_addback") || getFieldAmount(fieldValues, "depreciation");
    const capitalAllowances = getFieldAmount(fieldValues, "capital_allowances");
    const disallowable = getFieldAmount(fieldValues, "disallowable_expenses");
    const propertyIncome = getFieldAmount(fieldValues, "property_income");
    const chargeableGains = getFieldAmount(fieldValues, "chargeable_gains");
    const qualifyingDonations = getFieldAmount(fieldValues, "qualifying_donations");
    const associatedCount = getFieldAmount(fieldValues, "associated_companies_count") || 0;

    const ctResult = await computeCorporationTax({
      company_id: fieldValues._company_id || '',
      organization_id: fieldValues._organization_id || '',
      accounts_snapshot_id: fieldValues._accounts_snapshot_id || '',
      period_start: fieldValues._period_start || '',
      period_end: periodEnd || '',
      accounting_profit: accountingProfit,
      add_backs: [
        { description: 'Depreciation', amount: Math.abs(depreciation), category: 'depreciation' as const },
        { description: 'Disallowable expenses', amount: Math.abs(disallowable), category: 'other_disallowable' as const },
      ].filter(a => a.amount > 0),
      deductions: [
        { description: 'Capital allowances', amount: Math.abs(capitalAllowances), category: 'capital_allowances' as const },
      ].filter(d => d.amount > 0),
      associated_companies_count: associatedCount,
    });

    setFieldValue(updatedFields, "trading_profit", ctResult.taxable_total_profits, "calculation");
    setFieldValue(updatedFields, "total_profits", ctResult.taxable_total_profits, "calculation");
    setFieldValue(updatedFields, "profits_chargeable", ctResult.taxable_total_profits, "calculation");
    setFieldValue(updatedFields, "corporation_tax", ctResult.corporation_tax_due, "calculation");
    setFieldValue(updatedFields, "marginal_relief", ctResult.marginal_relief_amount, "calculation");
    setFieldValue(updatedFields, "tax_due", ctResult.corporation_tax_due, "calculation");
    setFieldValue(updatedFields, "tax_calculation_breakdown", ctResult, "calculation");

  } else if (workpaperType === "vat_return") {
    // VAT: Boxes 3 and 5 are derived. Boxes 1,2,4,6-9 come from vat-ledger-aggregator.
    // The aggregator populates these boxes directly; here we just compute derived fields.
    const box1 = getFieldAmount(fieldValues, "box1_vat_due_sales");
    const box2 = getFieldAmount(fieldValues, "box2_vat_due_acquisitions");
    const box4 = getFieldAmount(fieldValues, "box4_vat_reclaimed");
    const box3 = box1 + box2;
    const box5 = box3 - box4;

    setFieldValue(updatedFields, "box3_total_vat_due", Math.round(box3 * 100) / 100, "calculation");
    setFieldValue(updatedFields, "box5_net_vat", Math.round(box5 * 100) / 100, "calculation");
    setFieldValue(updatedFields, "vat_calculation_breakdown", {
      box1_vat_due_sales: box1,
      box2_vat_due_acquisitions: box2,
      box3_total_vat_due: Math.round(box3 * 100) / 100,
      box4_vat_reclaimed: box4,
      box5_net_vat: Math.round(box5 * 100) / 100,
      box6_total_sales: getFieldAmount(fieldValues, "box6_total_sales"),
      box7_total_purchases: getFieldAmount(fieldValues, "box7_total_purchases"),
      box8_goods_to_eu: getFieldAmount(fieldValues, "box8_goods_to_eu"),
      box9_goods_from_eu: getFieldAmount(fieldValues, "box9_goods_from_eu"),
      vat_payable: box5 > 0,
      vat_refundable: box5 < 0,
    }, "calculation");
  }

  return updatedFields;
}

// ==================== HELPERS ====================

function getFieldAmount(fieldValues: Record<string, any>, fieldName: string): number {
  const field = fieldValues[fieldName];
  if (!field) return 0;
  if (typeof field === "number") return field;
  if (typeof field === "object" && field.amount !== undefined) return field.amount;
  return 0;
}

function setFieldValue(
  fieldValues: Record<string, any>,
  fieldName: string,
  value: any,
  source: string
): void {
  if (fieldValues[fieldName] && typeof fieldValues[fieldName] === "object") {
    fieldValues[fieldName] = {
      ...fieldValues[fieldName],
      amount: value,
      source,
      calculatedAt: new Date().toISOString(),
    };
  } else {
    fieldValues[fieldName] = {
      amount: value,
      source,
      calculatedAt: new Date().toISOString(),
    };
  }
}
