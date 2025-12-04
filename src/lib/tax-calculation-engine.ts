/**
 * UK Tax Calculation Engine
 * All calculations are deterministic functions of the workpaper model
 * This engine is called from calculateWorkpaperFields(), never independently
 */

// ==================== TAX YEAR CONSTANTS ====================

export interface TaxYearConfig {
  year: string; // e.g., "2024/25"
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
  // CT rates
  ctSmallProfitsRate: number;
  ctMainRate: number;
  ctSmallProfitsLimit: number;
  ctMarginalReliefUpperLimit: number;
  ctMarginalReliefFraction: number;
}

// Tax year configurations (can be extended for multiple years)
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
    class4MainRate: 0.06, // 6% for 2024/25
    class4AdditionalRate: 0.02,
    ctSmallProfitsRate: 0.19,
    ctMainRate: 0.25,
    ctSmallProfitsLimit: 50000,
    ctMarginalReliefUpperLimit: 250000,
    ctMarginalReliefFraction: 3 / 200, // 0.015
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

export function getTaxYearConfig(taxYear?: string): TaxYearConfig {
  return TAX_YEAR_CONFIGS[taxYear || "2024/25"] || TAX_YEAR_CONFIGS["2024/25"];
}

// ==================== SELF ASSESSMENT CALCULATIONS ====================

export interface SAWorkpaperData {
  // Employment
  employment_income?: number;
  benefits_in_kind?: number;
  employment_expenses?: number;
  
  // Self-employment
  self_employment_profit?: number;
  
  // Dividends
  dividends?: number;
  
  // Other income
  bank_interest?: number;
  property_income?: number;
  other_income?: number;
  
  // Deductions
  pension_contributions?: number;
  gift_aid?: number;
  
  // Prior year (for PoA calculations)
  prior_year_tax_liability?: number;
  prior_year_poa_reduction?: number;
}

export interface SATaxResult {
  // Income breakdown
  total_employment_income: number;
  total_self_employment_profit: number;
  total_dividends: number;
  total_other_income: number;
  gross_income: number;
  
  // Deductions
  total_deductions: number;
  adjusted_net_income: number;
  
  // Allowances
  personal_allowance: number;
  personal_allowance_reduction: number;
  available_personal_allowance: number;
  
  // Taxable income
  taxable_income: number;
  taxable_income_non_dividend: number;
  taxable_dividends: number;
  
  // Tax calculations
  income_tax_basic: number;
  income_tax_higher: number;
  income_tax_additional: number;
  dividend_tax: number;
  total_income_tax: number;
  
  // National Insurance
  class2_nic: number;
  class4_nic: number;
  total_nic: number;
  
  // Summary
  total_tax_liability: number;
  
  // Payments on Account
  poa_first_payment: number;
  poa_second_payment: number;
  balancing_payment: number;
  
  // Payment dates
  first_poa_date: string;
  second_poa_date: string;
  balancing_payment_date: string;
}

export function calculateSelfAssessmentTax(
  data: SAWorkpaperData,
  taxYear?: string
): SATaxResult {
  const config = getTaxYearConfig(taxYear);
  
  // Calculate income totals
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
  
  // Calculate deductions (extend personal allowance for pension contributions via grossing up)
  const totalDeductions = (data.pension_contributions || 0) + (data.gift_aid || 0);
  const adjustedNetIncome = Math.max(0, grossIncome - totalDeductions);
  
  // Calculate personal allowance with tapering
  let personalAllowanceReduction = 0;
  if (adjustedNetIncome > config.personalAllowanceTaperThreshold) {
    personalAllowanceReduction = Math.min(
      config.personalAllowance,
      Math.floor((adjustedNetIncome - config.personalAllowanceTaperThreshold) / 2)
    );
  }
  const availablePersonalAllowance = config.personalAllowance - personalAllowanceReduction;
  
  // Calculate taxable income (non-dividend income uses allowance first)
  const nonDividendIncome = grossIncome - totalDividends - totalDeductions;
  const taxableNonDividend = Math.max(0, nonDividendIncome - availablePersonalAllowance);
  
  // Dividends taxed after other income
  const remainingAllowance = Math.max(0, availablePersonalAllowance - nonDividendIncome);
  const taxableDividendsBeforeAllowance = Math.max(0, totalDividends - remainingAllowance);
  const taxableDividends = Math.max(0, taxableDividendsBeforeAllowance - config.dividendAllowance);
  
  const taxableIncome = taxableNonDividend + taxableDividends;
  
  // Calculate income tax on non-dividend income
  let basicBandUsed = 0;
  let higherBandUsed = 0;
  let additionalBandUsed = 0;
  
  // Non-dividend income fills bands first
  if (taxableNonDividend > 0) {
    basicBandUsed = Math.min(taxableNonDividend, config.basicRateLimit);
    if (taxableNonDividend > config.basicRateLimit) {
      higherBandUsed = Math.min(
        taxableNonDividend - config.basicRateLimit,
        config.higherRateLimit - config.basicRateLimit
      );
    }
    if (taxableNonDividend > config.higherRateLimit) {
      additionalBandUsed = taxableNonDividend - config.higherRateLimit;
    }
  }
  
  const incomeTaxBasic = basicBandUsed * config.basicRate;
  const incomeTaxHigher = higherBandUsed * config.higherRate;
  const incomeTaxAdditional = additionalBandUsed * config.additionalRate;
  
  // Calculate dividend tax (on remaining band space)
  let dividendTax = 0;
  if (taxableDividends > 0) {
    const remainingBasicBand = Math.max(0, config.basicRateLimit - basicBandUsed);
    const remainingHigherBand = Math.max(0, config.higherRateLimit - config.basicRateLimit - higherBandUsed);
    
    let dividendInBasicBand = Math.min(taxableDividends, remainingBasicBand);
    let dividendInHigherBand = Math.min(
      Math.max(0, taxableDividends - remainingBasicBand),
      remainingHigherBand
    );
    let dividendInAdditionalBand = Math.max(0, taxableDividends - remainingBasicBand - remainingHigherBand);
    
    dividendTax = 
      (dividendInBasicBand * config.dividendBasicRate) +
      (dividendInHigherBand * config.dividendHigherRate) +
      (dividendInAdditionalBand * config.dividendAdditionalRate);
  }
  
  const totalIncomeTax = incomeTaxBasic + incomeTaxHigher + incomeTaxAdditional + dividendTax;
  
  // Calculate National Insurance
  let class2Nic = 0;
  let class4Nic = 0;
  
  if (totalSelfEmploymentProfit > 0) {
    // Class 2 NIC (if above threshold)
    if (totalSelfEmploymentProfit >= config.class2Threshold) {
      class2Nic = config.class2WeeklyRate * 52;
    }
    
    // Class 4 NIC
    if (totalSelfEmploymentProfit > config.class4LowerLimit) {
      const profitInMainBand = Math.min(
        totalSelfEmploymentProfit - config.class4LowerLimit,
        config.class4UpperLimit - config.class4LowerLimit
      );
      const profitAboveUpperLimit = Math.max(0, totalSelfEmploymentProfit - config.class4UpperLimit);
      
      class4Nic = (profitInMainBand * config.class4MainRate) + (profitAboveUpperLimit * config.class4AdditionalRate);
    }
  }
  
  const totalNic = class2Nic + class4Nic;
  const totalTaxLiability = totalIncomeTax + totalNic;
  
  // Calculate Payments on Account
  // PoA = 50% of previous year's liability (if > £1000 and > 80% from non-PAYE sources)
  const priorYearLiability = data.prior_year_tax_liability || 0;
  const priorYearReduction = data.prior_year_poa_reduction || 0;
  
  let poaBase = Math.max(0, priorYearLiability - priorYearReduction);
  // PoA not required if total liability < £1000
  if (poaBase < 1000) {
    poaBase = 0;
  }
  
  const poaFirstPayment = Math.ceil(poaBase / 2);
  const poaSecondPayment = Math.ceil(poaBase / 2);
  const balancingPayment = Math.max(0, totalTaxLiability - poaFirstPayment - poaSecondPayment);
  
  // Calculate payment dates based on tax year
  const taxYearStart = parseInt(taxYear?.split("/")[0] || "2024");
  
  return {
    total_employment_income: Math.round(totalEmploymentIncome * 100) / 100,
    total_self_employment_profit: Math.round(totalSelfEmploymentProfit * 100) / 100,
    total_dividends: Math.round(totalDividends * 100) / 100,
    total_other_income: Math.round(totalOtherIncome * 100) / 100,
    gross_income: Math.round(grossIncome * 100) / 100,
    
    total_deductions: Math.round(totalDeductions * 100) / 100,
    adjusted_net_income: Math.round(adjustedNetIncome * 100) / 100,
    
    personal_allowance: config.personalAllowance,
    personal_allowance_reduction: Math.round(personalAllowanceReduction * 100) / 100,
    available_personal_allowance: Math.round(availablePersonalAllowance * 100) / 100,
    
    taxable_income: Math.round(taxableIncome * 100) / 100,
    taxable_income_non_dividend: Math.round(taxableNonDividend * 100) / 100,
    taxable_dividends: Math.round(taxableDividends * 100) / 100,
    
    income_tax_basic: Math.round(incomeTaxBasic * 100) / 100,
    income_tax_higher: Math.round(incomeTaxHigher * 100) / 100,
    income_tax_additional: Math.round(incomeTaxAdditional * 100) / 100,
    dividend_tax: Math.round(dividendTax * 100) / 100,
    total_income_tax: Math.round(totalIncomeTax * 100) / 100,
    
    class2_nic: Math.round(class2Nic * 100) / 100,
    class4_nic: Math.round(class4Nic * 100) / 100,
    total_nic: Math.round(totalNic * 100) / 100,
    
    total_tax_liability: Math.round(totalTaxLiability * 100) / 100,
    
    poa_first_payment: poaFirstPayment,
    poa_second_payment: poaSecondPayment,
    balancing_payment: Math.round(balancingPayment * 100) / 100,
    
    first_poa_date: `${taxYearStart + 1}-01-31`,
    second_poa_date: `${taxYearStart + 1}-07-31`,
    balancing_payment_date: `${taxYearStart + 2}-01-31`,
  };
}

// ==================== CORPORATION TAX CALCULATIONS ====================

export interface CTWorkpaperData {
  accounting_profit?: number;
  depreciation_addback?: number;
  capital_allowances?: number;
  disallowable_expenses?: number;
  property_income?: number;
  chargeable_gains?: number;
  qualifying_donations?: number;
  
  // Associated companies for rate determination
  associated_companies_count?: number;
  
  // Accounting period (for marginal relief calculation)
  accounting_period_days?: number;
}

export interface CTTaxResult {
  // Profit calculations
  accounting_profit: number;
  add_depreciation: number;
  less_capital_allowances: number;
  add_disallowable_expenses: number;
  trading_profit: number;
  property_income: number;
  chargeable_gains: number;
  total_profits: number;
  less_qualifying_donations: number;
  profits_chargeable_to_ct: number;
  
  // Rate determination
  applicable_rate: number;
  small_profits_limit: number;
  marginal_relief_upper_limit: number;
  is_marginal_rate: boolean;
  
  // Tax calculation
  tax_at_main_rate: number;
  marginal_relief: number;
  corporation_tax_liability: number;
  
  // Payment dates
  payment_due_date: string;
}

export function calculateCorporationTax(
  data: CTWorkpaperData,
  periodEnd?: string,
  taxYear?: string
): CTTaxResult {
  const config = getTaxYearConfig(taxYear);
  
  // Calculate profits
  const accountingProfit = data.accounting_profit || 0;
  const addDepreciation = Math.abs(data.depreciation_addback || 0);
  const lessCapitalAllowances = Math.abs(data.capital_allowances || 0);
  const addDisallowable = Math.abs(data.disallowable_expenses || 0);
  
  const tradingProfit = Math.max(0, accountingProfit + addDepreciation - lessCapitalAllowances + addDisallowable);
  const propertyIncome = Math.max(0, data.property_income || 0);
  const chargeableGains = Math.max(0, data.chargeable_gains || 0);
  
  const totalProfits = tradingProfit + propertyIncome + chargeableGains;
  const qualifyingDonations = Math.min(totalProfits, Math.abs(data.qualifying_donations || 0));
  const profitsChargeable = Math.max(0, totalProfits - qualifyingDonations);
  
  // Adjust limits for associated companies
  const associatedCount = Math.max(1, data.associated_companies_count || 1);
  const adjustedSmallProfitsLimit = config.ctSmallProfitsLimit / associatedCount;
  const adjustedUpperLimit = config.ctMarginalReliefUpperLimit / associatedCount;
  
  // Adjust limits for short accounting period
  const periodDays = data.accounting_period_days || 365;
  const daysFraction = periodDays / 365;
  const proRataSmallLimit = adjustedSmallProfitsLimit * daysFraction;
  const proRataUpperLimit = adjustedUpperLimit * daysFraction;
  
  // Determine rate and calculate tax
  let applicableRate: number;
  let isMarginalRate = false;
  let taxAtMainRate = 0;
  let marginalRelief = 0;
  
  if (profitsChargeable <= proRataSmallLimit) {
    // Small profits rate
    applicableRate = config.ctSmallProfitsRate;
    taxAtMainRate = profitsChargeable * applicableRate;
  } else if (profitsChargeable >= proRataUpperLimit) {
    // Main rate
    applicableRate = config.ctMainRate;
    taxAtMainRate = profitsChargeable * applicableRate;
  } else {
    // Marginal relief applies
    isMarginalRate = true;
    applicableRate = config.ctMainRate; // Starts at main rate
    taxAtMainRate = profitsChargeable * config.ctMainRate;
    
    // Marginal relief formula: 3/200 × (Upper Limit - Profits) × (Profits / Profits)
    // Simplified: 3/200 × (Upper Limit - Profits)
    marginalRelief = config.ctMarginalReliefFraction * (proRataUpperLimit - profitsChargeable);
  }
  
  const corporationTaxLiability = Math.max(0, taxAtMainRate - marginalRelief);
  
  // Calculate payment due date (9 months + 1 day after period end)
  let paymentDueDate = "";
  if (periodEnd) {
    const endDate = new Date(periodEnd);
    endDate.setMonth(endDate.getMonth() + 9);
    endDate.setDate(endDate.getDate() + 1);
    paymentDueDate = endDate.toISOString().split("T")[0];
  }
  
  return {
    accounting_profit: Math.round(accountingProfit * 100) / 100,
    add_depreciation: Math.round(addDepreciation * 100) / 100,
    less_capital_allowances: Math.round(lessCapitalAllowances * 100) / 100,
    add_disallowable_expenses: Math.round(addDisallowable * 100) / 100,
    trading_profit: Math.round(tradingProfit * 100) / 100,
    property_income: Math.round(propertyIncome * 100) / 100,
    chargeable_gains: Math.round(chargeableGains * 100) / 100,
    total_profits: Math.round(totalProfits * 100) / 100,
    less_qualifying_donations: Math.round(qualifyingDonations * 100) / 100,
    profits_chargeable_to_ct: Math.round(profitsChargeable * 100) / 100,
    
    applicable_rate: applicableRate,
    small_profits_limit: Math.round(proRataSmallLimit),
    marginal_relief_upper_limit: Math.round(proRataUpperLimit),
    is_marginal_rate: isMarginalRate,
    
    tax_at_main_rate: Math.round(taxAtMainRate * 100) / 100,
    marginal_relief: Math.round(marginalRelief * 100) / 100,
    corporation_tax_liability: Math.round(corporationTaxLiability * 100) / 100,
    
    payment_due_date: paymentDueDate,
  };
}

// ==================== VAT CALCULATIONS ====================

export interface VATWorkpaperData {
  box1_vat_due_sales: number;
  box2_vat_due_acquisitions: number;
  box4_vat_reclaimed: number;
  box6_total_sales: number;
  box7_total_purchases: number;
  box8_goods_to_eu: number;
  box9_goods_from_eu: number;
}

export interface VATResult {
  box1_vat_due_sales: number;
  box2_vat_due_acquisitions: number;
  box3_total_vat_due: number;
  box4_vat_reclaimed: number;
  box5_net_vat: number;
  box6_total_sales: number;
  box7_total_purchases: number;
  box8_goods_to_eu: number;
  box9_goods_from_eu: number;
  vat_payable: boolean;
  vat_refundable: boolean;
}

export function calculateVAT(data: VATWorkpaperData): VATResult {
  const box3 = (data.box1_vat_due_sales || 0) + (data.box2_vat_due_acquisitions || 0);
  const box5 = box3 - (data.box4_vat_reclaimed || 0);
  
  return {
    box1_vat_due_sales: Math.round((data.box1_vat_due_sales || 0) * 100) / 100,
    box2_vat_due_acquisitions: Math.round((data.box2_vat_due_acquisitions || 0) * 100) / 100,
    box3_total_vat_due: Math.round(box3 * 100) / 100,
    box4_vat_reclaimed: Math.round((data.box4_vat_reclaimed || 0) * 100) / 100,
    box5_net_vat: Math.round(box5 * 100) / 100,
    box6_total_sales: Math.round((data.box6_total_sales || 0)),
    box7_total_purchases: Math.round((data.box7_total_purchases || 0)),
    box8_goods_to_eu: Math.round((data.box8_goods_to_eu || 0)),
    box9_goods_from_eu: Math.round((data.box9_goods_from_eu || 0)),
    vat_payable: box5 > 0,
    vat_refundable: box5 < 0,
  };
}

// ==================== WORKPAPER INTEGRATION ====================

/**
 * Apply tax calculations to workpaper field values
 * This is called from calculateWorkpaperFields() in workpaper-from-tb.ts
 */
export function applyTaxCalculationsToWorkpaper(
  fieldValues: Record<string, any>,
  workpaperType: string,
  taxYear?: string,
  periodEnd?: string
): Record<string, any> {
  const updatedFields = { ...fieldValues };
  
  if (workpaperType === "self_assessment" || workpaperType === "SA100") {
    // Extract SA data from workpaper fields
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
    
    const result = calculateSelfAssessmentTax(saData, taxYear);
    
    // Update workpaper with calculated values
    setFieldValue(updatedFields, "total_income", result.gross_income, "calculation");
    setFieldValue(updatedFields, "personal_allowance", result.available_personal_allowance, "calculation");
    setFieldValue(updatedFields, "taxable_income", result.taxable_income, "calculation");
    setFieldValue(updatedFields, "income_tax", result.total_income_tax, "calculation");
    setFieldValue(updatedFields, "national_insurance", result.total_nic, "calculation");
    setFieldValue(updatedFields, "total_tax_due", result.total_tax_liability, "calculation");
    
    // Store detailed breakdown
    setFieldValue(updatedFields, "tax_calculation_breakdown", result, "calculation");
    
  } else if (workpaperType === "ct600" || workpaperType === "corporation_tax") {
    // Extract CT data from workpaper fields
    const ctData: CTWorkpaperData = {
      accounting_profit: getFieldAmount(fieldValues, "accounting_profit") || getFieldAmount(fieldValues, "profit_before_tax"),
      depreciation_addback: getFieldAmount(fieldValues, "depreciation_addback") || getFieldAmount(fieldValues, "depreciation"),
      capital_allowances: getFieldAmount(fieldValues, "capital_allowances"),
      disallowable_expenses: getFieldAmount(fieldValues, "disallowable_expenses"),
      property_income: getFieldAmount(fieldValues, "property_income"),
      chargeable_gains: getFieldAmount(fieldValues, "chargeable_gains"),
      qualifying_donations: getFieldAmount(fieldValues, "qualifying_donations"),
      associated_companies_count: getFieldAmount(fieldValues, "associated_companies_count") || 1,
    };
    
    const result = calculateCorporationTax(ctData, periodEnd, taxYear);
    
    // Update workpaper with calculated values
    setFieldValue(updatedFields, "trading_profit", result.trading_profit, "calculation");
    setFieldValue(updatedFields, "total_profits", result.total_profits, "calculation");
    setFieldValue(updatedFields, "profits_chargeable", result.profits_chargeable_to_ct, "calculation");
    setFieldValue(updatedFields, "corporation_tax", result.corporation_tax_liability, "calculation");
    setFieldValue(updatedFields, "marginal_relief", result.marginal_relief, "calculation");
    setFieldValue(updatedFields, "tax_due", result.corporation_tax_liability, "calculation");
    setFieldValue(updatedFields, "payment_due_date", result.payment_due_date, "calculation");
    
    // Store detailed breakdown
    setFieldValue(updatedFields, "tax_calculation_breakdown", result, "calculation");
    
  } else if (workpaperType === "vat_return") {
    // Extract VAT data from workpaper fields
    const vatData: VATWorkpaperData = {
      box1_vat_due_sales: getFieldAmount(fieldValues, "box1_vat_due_sales"),
      box2_vat_due_acquisitions: getFieldAmount(fieldValues, "box2_vat_due_acquisitions"),
      box4_vat_reclaimed: getFieldAmount(fieldValues, "box4_vat_reclaimed"),
      box6_total_sales: getFieldAmount(fieldValues, "box6_total_sales"),
      box7_total_purchases: getFieldAmount(fieldValues, "box7_total_purchases"),
      box8_goods_to_eu: getFieldAmount(fieldValues, "box8_goods_to_eu"),
      box9_goods_from_eu: getFieldAmount(fieldValues, "box9_goods_from_eu"),
    };
    
    const result = calculateVAT(vatData);
    
    // Update workpaper with calculated values
    setFieldValue(updatedFields, "box3_total_vat_due", result.box3_total_vat_due, "calculation");
    setFieldValue(updatedFields, "box5_net_vat", result.box5_net_vat, "calculation");
    
    // Store detailed breakdown
    setFieldValue(updatedFields, "vat_calculation_breakdown", result, "calculation");
  }
  
  return updatedFields;
}

// Helper functions
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
