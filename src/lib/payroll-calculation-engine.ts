/**
 * Payroll Calculation Engine
 * Pure, deterministic calculation functions for UK payroll
 * Following the same architectural pattern as tax-calculation-engine.ts
 * 
 * All functions are pure (no database calls, no side effects) and tax-year configurable.
 * YTD figures are DERIVED from payslips - payslips are the canonical source of truth.
 */

// ============================================================================
// TAX YEAR CONFIGURATION
// ============================================================================

export interface PayrollTaxYearConfig {
  year: string;
  
  // PAYE thresholds and rates (annual values)
  personalAllowance: number;
  personalAllowanceLimit: number; // Income level where PA starts reducing
  basicRateLimit: number;
  higherRateLimit: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
  
  // Scottish rates (different from rUK)
  scottishStarterRate: number;
  scottishStarterLimit: number;
  scottishBasicRate: number;
  scottishBasicLimit: number;
  scottishIntermediateRate: number;
  scottishIntermediateLimit: number;
  scottishHigherRate: number;
  scottishHigherLimit: number;
  scottishAdvancedRate: number;
  scottishAdvancedLimit: number;
  scottishTopRate: number;
  
  // Welsh rates (currently same as rUK but separate for future)
  welshBasicRate: number;
  welshHigherRate: number;
  welshAdditionalRate: number;
  
  // NIC thresholds (weekly values)
  nicLEL: number;              // Lower Earnings Limit
  nicPT: number;               // Primary Threshold
  nicST: number;               // Secondary Threshold
  nicFUST: number;             // Freeport Upper Secondary Threshold
  nicUEL: number;              // Upper Earnings Limit
  nicEmployeeMainRate: number;
  nicEmployeeUpperRate: number;
  nicEmployerRate: number;
  
  // Student loan thresholds (annual)
  studentLoanPlan1Threshold: number;
  studentLoanPlan2Threshold: number;
  studentLoanPlan4Threshold: number;
  postgraduateLoanThreshold: number;
  studentLoanRate: number;     // 9% for all undergraduate plans
  postgraduateLoanRate: number; // 6%
  
  // Pension auto-enrolment (annual)
  pensionQualifyingEarningsLower: number;
  pensionQualifyingEarningsUpper: number;
  pensionMinEmployeeRate: number;
  pensionMinEmployerRate: number;
  
  // Statutory payments (weekly rates)
  sspWeeklyRate: number;
  sspQualifyingDays: number;   // Waiting days before SSP
  sspLEL: number;              // LEL for SSP eligibility
  smpFirstSixWeeksRate: number; // 90% of AWE
  smpStandardWeeklyRate: number;
  smpWeeks: number;            // Total weeks of SMP
  sppWeeklyRate: number;
  sapWeeklyRate: number;
  shppWeeklyRate: number;
  spbpWeeklyRate: number;
}

export const PAYROLL_TAX_YEAR_CONFIGS: Record<string, PayrollTaxYearConfig> = {
  '2024/25': {
    year: '2024/25',
    
    // PAYE (annual)
    personalAllowance: 12570,
    personalAllowanceLimit: 100000,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.20,
    higherRate: 0.40,
    additionalRate: 0.45,
    
    // Scottish rates
    scottishStarterRate: 0.19,
    scottishStarterLimit: 2306,
    scottishBasicRate: 0.20,
    scottishBasicLimit: 13991,
    scottishIntermediateRate: 0.21,
    scottishIntermediateLimit: 31092,
    scottishHigherRate: 0.42,
    scottishHigherLimit: 62430,
    scottishAdvancedRate: 0.45,
    scottishAdvancedLimit: 125140,
    scottishTopRate: 0.48,
    
    // Welsh (same as rUK for now)
    welshBasicRate: 0.20,
    welshHigherRate: 0.40,
    welshAdditionalRate: 0.45,
    
    // NIC (weekly)
    nicLEL: 123,
    nicPT: 242,
    nicST: 175,
    nicFUST: 481,
    nicUEL: 967,
    nicEmployeeMainRate: 0.08,
    nicEmployeeUpperRate: 0.02,
    nicEmployerRate: 0.138,
    
    // Student loans (annual)
    studentLoanPlan1Threshold: 24990,
    studentLoanPlan2Threshold: 27295,
    studentLoanPlan4Threshold: 31395,
    postgraduateLoanThreshold: 21000,
    studentLoanRate: 0.09,
    postgraduateLoanRate: 0.06,
    
    // Pension (annual)
    pensionQualifyingEarningsLower: 6240,
    pensionQualifyingEarningsUpper: 50270,
    pensionMinEmployeeRate: 0.05,
    pensionMinEmployerRate: 0.03,
    
    // Statutory payments (weekly)
    sspWeeklyRate: 116.75,
    sspQualifyingDays: 3,
    sspLEL: 123,
    smpFirstSixWeeksRate: 0.90,
    smpStandardWeeklyRate: 184.03,
    smpWeeks: 39,
    sppWeeklyRate: 184.03,
    sapWeeklyRate: 184.03,
    shppWeeklyRate: 184.03,
    spbpWeeklyRate: 184.03,
  },
  '2023/24': {
    year: '2023/24',
    
    personalAllowance: 12570,
    personalAllowanceLimit: 100000,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.20,
    higherRate: 0.40,
    additionalRate: 0.45,
    
    scottishStarterRate: 0.19,
    scottishStarterLimit: 2162,
    scottishBasicRate: 0.20,
    scottishBasicLimit: 13118,
    scottishIntermediateRate: 0.21,
    scottishIntermediateLimit: 31092,
    scottishHigherRate: 0.42,
    scottishHigherLimit: 125140,
    scottishAdvancedRate: 0.45,
    scottishAdvancedLimit: 125140,
    scottishTopRate: 0.47,
    
    welshBasicRate: 0.20,
    welshHigherRate: 0.40,
    welshAdditionalRate: 0.45,
    
    nicLEL: 123,
    nicPT: 242,
    nicST: 175,
    nicFUST: 481,
    nicUEL: 967,
    nicEmployeeMainRate: 0.12,
    nicEmployeeUpperRate: 0.02,
    nicEmployerRate: 0.138,
    
    studentLoanPlan1Threshold: 22015,
    studentLoanPlan2Threshold: 27295,
    studentLoanPlan4Threshold: 27660,
    postgraduateLoanThreshold: 21000,
    studentLoanRate: 0.09,
    postgraduateLoanRate: 0.06,
    
    pensionQualifyingEarningsLower: 6240,
    pensionQualifyingEarningsUpper: 50270,
    pensionMinEmployeeRate: 0.05,
    pensionMinEmployerRate: 0.03,
    
    sspWeeklyRate: 109.40,
    sspQualifyingDays: 3,
    sspLEL: 123,
    smpFirstSixWeeksRate: 0.90,
    smpStandardWeeklyRate: 172.48,
    smpWeeks: 39,
    sppWeeklyRate: 172.48,
    sapWeeklyRate: 172.48,
    shppWeeklyRate: 172.48,
    spbpWeeklyRate: 172.48,
  },
};

export function getPayrollTaxYearConfig(taxYear?: string): PayrollTaxYearConfig {
  const year = taxYear || '2024/25';
  return PAYROLL_TAX_YEAR_CONFIGS[year] || PAYROLL_TAX_YEAR_CONFIGS['2024/25'];
}

// ============================================================================
// TAX CODE PARSER
// ============================================================================

export interface ParsedTaxCode {
  allowance: number;
  isScottish: boolean;
  isWelsh: boolean;
  isWeek1Month1: boolean;
  isKCode: boolean;
  isBRCode: boolean;
  isD0Code: boolean;
  isD1Code: boolean;
  isNTCode: boolean;
  is0TCode: boolean;
  isEmergency: boolean;
  numericPart: number;
  suffix: string;
  originalCode: string;
}

export function parseTaxCode(taxCode: string): ParsedTaxCode {
  const code = taxCode.toUpperCase().trim();
  
  const result: ParsedTaxCode = {
    allowance: 0,
    isScottish: false,
    isWelsh: false,
    isWeek1Month1: false,
    isKCode: false,
    isBRCode: false,
    isD0Code: false,
    isD1Code: false,
    isNTCode: false,
    is0TCode: false,
    isEmergency: false,
    numericPart: 0,
    suffix: '',
    originalCode: taxCode,
  };
  
  let workingCode = code;
  
  // Check for Scottish prefix
  if (workingCode.startsWith('S')) {
    result.isScottish = true;
    workingCode = workingCode.substring(1);
  }
  
  // Check for Welsh prefix
  if (workingCode.startsWith('C')) {
    result.isWelsh = true;
    workingCode = workingCode.substring(1);
  }
  
  // Check for Week1/Month1 suffix
  if (workingCode.endsWith('W1') || workingCode.endsWith('M1') || 
      workingCode.endsWith(' W1') || workingCode.endsWith(' M1') ||
      workingCode.includes('X')) {
    result.isWeek1Month1 = true;
    result.isEmergency = true;
    workingCode = workingCode.replace(/\s*[WM]1$/, '').replace('X', '');
  }
  
  // Handle special codes
  if (workingCode === 'BR') {
    result.isBRCode = true;
    return result;
  }
  
  if (workingCode === 'D0') {
    result.isD0Code = true;
    return result;
  }
  
  if (workingCode === 'D1') {
    result.isD1Code = true;
    return result;
  }
  
  if (workingCode === 'NT') {
    result.isNTCode = true;
    return result;
  }
  
  if (workingCode === '0T') {
    result.is0TCode = true;
    result.allowance = 0;
    return result;
  }
  
  // Handle K codes (negative allowance)
  if (workingCode.startsWith('K')) {
    result.isKCode = true;
    const numMatch = workingCode.match(/K(\d+)/);
    if (numMatch) {
      result.numericPart = parseInt(numMatch[1], 10);
      result.allowance = -(result.numericPart * 10);
    }
    return result;
  }
  
  // Standard code with number and suffix (e.g., 1257L)
  const standardMatch = workingCode.match(/^(\d+)([A-Z]*)$/);
  if (standardMatch) {
    result.numericPart = parseInt(standardMatch[1], 10);
    result.suffix = standardMatch[2];
    result.allowance = result.numericPart * 10;
    return result;
  }
  
  // If we can't parse, treat as 0T (no allowance)
  result.is0TCode = true;
  result.allowance = 0;
  return result;
}

// ============================================================================
// TAX PERIOD UTILITIES
// ============================================================================

export type PayFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';

export function getPeriodsInYear(payFrequency: PayFrequency): number {
  switch (payFrequency) {
    case 'weekly': return 52;
    case 'fortnightly': return 26;
    case 'four_weekly': return 13;
    case 'monthly': return 12;
    default: return 12;
  }
}

export function getTaxYearFromDate(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  
  // Tax year runs 6 April to 5 April
  if (month > 4 || (month === 4 && day >= 6)) {
    return `${year}/${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}/${year.toString().slice(-2)}`;
}

export function getTaxYearStart(taxYear: string): Date {
  const startYear = parseInt(taxYear.split('/')[0], 10);
  return new Date(startYear, 3, 6); // 6 April
}

export function getTaxPeriodNumber(
  paymentDate: string,
  payFrequency: PayFrequency,
  taxYear?: string
): number {
  const date = new Date(paymentDate);
  const yearStart = taxYear ? getTaxYearStart(taxYear) : getTaxYearStart(getTaxYearFromDate(paymentDate));
  
  const daysDiff = Math.floor((date.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  
  switch (payFrequency) {
    case 'weekly':
      return Math.min(52, Math.max(1, Math.floor(daysDiff / 7) + 1));
    case 'fortnightly':
      return Math.min(26, Math.max(1, Math.floor(daysDiff / 14) + 1));
    case 'four_weekly':
      return Math.min(13, Math.max(1, Math.floor(daysDiff / 28) + 1));
    case 'monthly':
      // Month 1 = April (month index 3)
      const monthIndex = date.getMonth();
      const monthNum = monthIndex >= 3 ? monthIndex - 2 : monthIndex + 10;
      return Math.min(12, Math.max(1, monthNum));
    default:
      return 1;
  }
}

export function getPeriodBoundaries(
  taxPeriod: number,
  payFrequency: PayFrequency,
  taxYear: string
): { start: Date; end: Date } {
  const yearStart = getTaxYearStart(taxYear);
  
  let startDays: number;
  let endDays: number;
  
  switch (payFrequency) {
    case 'weekly':
      startDays = (taxPeriod - 1) * 7;
      endDays = taxPeriod * 7 - 1;
      break;
    case 'fortnightly':
      startDays = (taxPeriod - 1) * 14;
      endDays = taxPeriod * 14 - 1;
      break;
    case 'four_weekly':
      startDays = (taxPeriod - 1) * 28;
      endDays = taxPeriod * 28 - 1;
      break;
    case 'monthly':
      const startMonth = new Date(yearStart);
      startMonth.setMonth(yearStart.getMonth() + taxPeriod - 1);
      const endMonth = new Date(startMonth);
      endMonth.setMonth(endMonth.getMonth() + 1);
      endMonth.setDate(endMonth.getDate() - 1);
      return { start: startMonth, end: endMonth };
    default:
      startDays = 0;
      endDays = 6;
  }
  
  const start = new Date(yearStart);
  start.setDate(start.getDate() + startDays);
  const end = new Date(yearStart);
  end.setDate(end.getDate() + endDays);
  
  return { start, end };
}

// ============================================================================
// PAYE CALCULATION
// ============================================================================

export interface PAYEInput {
  grossPay: number;
  taxCode: string;
  taxBasis: 'cumulative' | 'week1_month1';
  payFrequency: PayFrequency;
  taxPeriod: number;
  ytdGrossPay?: number;
  ytdTaxPaid?: number;
}

export interface PAYEResult {
  taxablePayThisPeriod: number;
  taxDueThisPeriod: number;
  taxDueYTD: number;
  freePayThisPeriod: number;
  cumulativeTaxablePay: number;
  breakdown: {
    basicRateTax: number;
    higherRateTax: number;
    additionalRateTax: number;
    scottishBreakdown?: {
      starterRateTax: number;
      basicRateTax: number;
      intermediateRateTax: number;
      higherRateTax: number;
      advancedRateTax: number;
      topRateTax: number;
    };
  };
}

export function calculatePAYE(input: PAYEInput, taxYear?: string): PAYEResult {
  const config = getPayrollTaxYearConfig(taxYear);
  const parsedCode = parseTaxCode(input.taxCode);
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  
  // Determine if Week1/Month1 basis
  const isNonCumulative = input.taxBasis === 'week1_month1' || parsedCode.isWeek1Month1;
  
  // Handle special codes
  if (parsedCode.isNTCode) {
    return {
      taxablePayThisPeriod: input.grossPay,
      taxDueThisPeriod: 0,
      taxDueYTD: (input.ytdTaxPaid || 0),
      freePayThisPeriod: input.grossPay,
      cumulativeTaxablePay: (input.ytdGrossPay || 0) + input.grossPay,
      breakdown: { basicRateTax: 0, higherRateTax: 0, additionalRateTax: 0 },
    };
  }
  
  if (parsedCode.isBRCode) {
    const rate = parsedCode.isScottish ? config.scottishBasicRate : config.basicRate;
    const tax = roundTax(input.grossPay * rate);
    return {
      taxablePayThisPeriod: input.grossPay,
      taxDueThisPeriod: tax,
      taxDueYTD: (input.ytdTaxPaid || 0) + tax,
      freePayThisPeriod: 0,
      cumulativeTaxablePay: (input.ytdGrossPay || 0) + input.grossPay,
      breakdown: { basicRateTax: tax, higherRateTax: 0, additionalRateTax: 0 },
    };
  }
  
  if (parsedCode.isD0Code) {
    const rate = parsedCode.isScottish ? config.scottishHigherRate : config.higherRate;
    const tax = roundTax(input.grossPay * rate);
    return {
      taxablePayThisPeriod: input.grossPay,
      taxDueThisPeriod: tax,
      taxDueYTD: (input.ytdTaxPaid || 0) + tax,
      freePayThisPeriod: 0,
      cumulativeTaxablePay: (input.ytdGrossPay || 0) + input.grossPay,
      breakdown: { basicRateTax: 0, higherRateTax: tax, additionalRateTax: 0 },
    };
  }
  
  if (parsedCode.isD1Code) {
    const rate = parsedCode.isScottish ? config.scottishTopRate : config.additionalRate;
    const tax = roundTax(input.grossPay * rate);
    return {
      taxablePayThisPeriod: input.grossPay,
      taxDueThisPeriod: tax,
      taxDueYTD: (input.ytdTaxPaid || 0) + tax,
      freePayThisPeriod: 0,
      cumulativeTaxablePay: (input.ytdGrossPay || 0) + input.grossPay,
      breakdown: { basicRateTax: 0, higherRateTax: 0, additionalRateTax: tax },
    };
  }
  
  // Standard calculation
  const annualAllowance = parsedCode.allowance;
  
  if (isNonCumulative) {
    // Week1/Month1 - treat each period independently
    const periodAllowance = annualAllowance / periodsInYear;
    const taxablePay = Math.max(0, input.grossPay - periodAllowance);
    
    const tax = parsedCode.isScottish
      ? calculateScottishTax(taxablePay * periodsInYear, config) / periodsInYear
      : calculateRUKTax(taxablePay * periodsInYear, config) / periodsInYear;
    
    const roundedTax = roundTax(tax);
    
    return {
      taxablePayThisPeriod: taxablePay,
      taxDueThisPeriod: roundedTax,
      taxDueYTD: (input.ytdTaxPaid || 0) + roundedTax,
      freePayThisPeriod: Math.min(periodAllowance, input.grossPay),
      cumulativeTaxablePay: taxablePay,
      breakdown: parsedCode.isScottish
        ? { basicRateTax: roundedTax, higherRateTax: 0, additionalRateTax: 0 }
        : calculateRUKBreakdown(taxablePay * periodsInYear, config, periodsInYear),
    };
  }
  
  // Cumulative calculation
  const cumulativeAllowance = (annualAllowance / periodsInYear) * input.taxPeriod;
  const cumulativeGross = (input.ytdGrossPay || 0) + input.grossPay;
  
  // Handle K codes - add to taxable income instead of reducing it
  let cumulativeTaxablePay: number;
  if (parsedCode.isKCode) {
    cumulativeTaxablePay = cumulativeGross + Math.abs(cumulativeAllowance);
  } else {
    cumulativeTaxablePay = Math.max(0, cumulativeGross - cumulativeAllowance);
  }
  
  // Calculate cumulative tax due
  const annualizedTaxable = (cumulativeTaxablePay / input.taxPeriod) * periodsInYear;
  const annualTax = parsedCode.isScottish
    ? calculateScottishTax(annualizedTaxable, config)
    : calculateRUKTax(annualizedTaxable, config);
  
  const cumulativeTaxDue = (annualTax / periodsInYear) * input.taxPeriod;
  const taxThisPeriod = roundTax(Math.max(0, cumulativeTaxDue - (input.ytdTaxPaid || 0)));
  
  const periodAllowance = annualAllowance / periodsInYear;
  const taxableThisPeriod = parsedCode.isKCode
    ? input.grossPay + Math.abs(periodAllowance)
    : Math.max(0, input.grossPay - periodAllowance);
  
  return {
    taxablePayThisPeriod: taxableThisPeriod,
    taxDueThisPeriod: taxThisPeriod,
    taxDueYTD: roundTax(cumulativeTaxDue),
    freePayThisPeriod: parsedCode.isKCode ? 0 : Math.min(periodAllowance, input.grossPay),
    cumulativeTaxablePay,
    breakdown: parsedCode.isScottish
      ? { basicRateTax: taxThisPeriod, higherRateTax: 0, additionalRateTax: 0 }
      : calculateRUKBreakdown(annualizedTaxable, config, periodsInYear),
  };
}

function calculateRUKTax(annualTaxable: number, config: PayrollTaxYearConfig): number {
  if (annualTaxable <= 0) return 0;
  
  let tax = 0;
  let remaining = annualTaxable;
  
  // Basic rate band
  const basicBand = Math.min(remaining, config.basicRateLimit);
  tax += basicBand * config.basicRate;
  remaining -= basicBand;
  
  if (remaining <= 0) return tax;
  
  // Higher rate band
  const higherBand = Math.min(remaining, config.higherRateLimit - config.basicRateLimit);
  tax += higherBand * config.higherRate;
  remaining -= higherBand;
  
  if (remaining <= 0) return tax;
  
  // Additional rate
  tax += remaining * config.additionalRate;
  
  return tax;
}

function calculateRUKBreakdown(
  annualTaxable: number,
  config: PayrollTaxYearConfig,
  periodsInYear: number
): { basicRateTax: number; higherRateTax: number; additionalRateTax: number } {
  if (annualTaxable <= 0) {
    return { basicRateTax: 0, higherRateTax: 0, additionalRateTax: 0 };
  }
  
  let remaining = annualTaxable;
  
  const basicBand = Math.min(remaining, config.basicRateLimit);
  const basicTax = basicBand * config.basicRate;
  remaining -= basicBand;
  
  let higherTax = 0;
  let additionalTax = 0;
  
  if (remaining > 0) {
    const higherBand = Math.min(remaining, config.higherRateLimit - config.basicRateLimit);
    higherTax = higherBand * config.higherRate;
    remaining -= higherBand;
    
    if (remaining > 0) {
      additionalTax = remaining * config.additionalRate;
    }
  }
  
  return {
    basicRateTax: roundTax(basicTax / periodsInYear),
    higherRateTax: roundTax(higherTax / periodsInYear),
    additionalRateTax: roundTax(additionalTax / periodsInYear),
  };
}

function calculateScottishTax(annualTaxable: number, config: PayrollTaxYearConfig): number {
  if (annualTaxable <= 0) return 0;
  
  let tax = 0;
  let remaining = annualTaxable;
  
  // Starter rate
  const starterBand = Math.min(remaining, config.scottishStarterLimit);
  tax += starterBand * config.scottishStarterRate;
  remaining -= starterBand;
  
  if (remaining <= 0) return tax;
  
  // Basic rate
  const basicBand = Math.min(remaining, config.scottishBasicLimit - config.scottishStarterLimit);
  tax += basicBand * config.scottishBasicRate;
  remaining -= basicBand;
  
  if (remaining <= 0) return tax;
  
  // Intermediate rate
  const intermediateBand = Math.min(remaining, config.scottishIntermediateLimit - config.scottishBasicLimit);
  tax += intermediateBand * config.scottishIntermediateRate;
  remaining -= intermediateBand;
  
  if (remaining <= 0) return tax;
  
  // Higher rate
  const higherBand = Math.min(remaining, config.scottishHigherLimit - config.scottishIntermediateLimit);
  tax += higherBand * config.scottishHigherRate;
  remaining -= higherBand;
  
  if (remaining <= 0) return tax;
  
  // Advanced rate
  const advancedBand = Math.min(remaining, config.scottishAdvancedLimit - config.scottishHigherLimit);
  tax += advancedBand * config.scottishAdvancedRate;
  remaining -= advancedBand;
  
  if (remaining <= 0) return tax;
  
  // Top rate
  tax += remaining * config.scottishTopRate;
  
  return tax;
}

function roundTax(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ============================================================================
// NIC CALCULATION
// ============================================================================

export type NICCategory = 'A' | 'B' | 'C' | 'F' | 'H' | 'I' | 'J' | 'L' | 'M' | 'S' | 'V' | 'Z';

export interface NICInput {
  grossPay: number;
  nicCategory: NICCategory;
  payFrequency: PayFrequency;
  isDirector: boolean;
  directorNICMethod?: 'cumulative' | 'annual';
  taxPeriod: number;
  ytdGrossPay?: number;
  ytdEmployeeNIC?: number;
  ytdEmployerNIC?: number;
}

export interface NICResult {
  employeeNIC: number;
  employerNIC: number;
  nicablePay: number;
  ytdEmployeeNIC: number;
  ytdEmployerNIC: number;
  breakdown: {
    employeeMainBand: number;
    employeeUpperBand: number;
    employerContribution: number;
  };
}

interface NICCategoryRates {
  employeeMainRate: number;
  employeeUpperRate: number;
  employerRate: number;
  employeePT: number;  // Primary Threshold multiplier (1 = normal, 0 = exempt)
  employerST: number;  // Secondary Threshold multiplier
}

function getNICCategoryRates(
  category: NICCategory,
  config: PayrollTaxYearConfig
): NICCategoryRates {
  // Base rates
  const baseRates: NICCategoryRates = {
    employeeMainRate: config.nicEmployeeMainRate,
    employeeUpperRate: config.nicEmployeeUpperRate,
    employerRate: config.nicEmployerRate,
    employeePT: 1,
    employerST: 1,
  };
  
  switch (category) {
    case 'A': // Standard
      return baseRates;
    
    case 'B': // Married women's reduced rate
      return { ...baseRates, employeeMainRate: 0.0585, employeeUpperRate: 0.02 };
    
    case 'C': // Over state pension age (no employee NIC)
      return { ...baseRates, employeeMainRate: 0, employeeUpperRate: 0 };
    
    case 'F': // Freeport
      return baseRates;
    
    case 'H': // Apprentice under 25
      return { ...baseRates, employerRate: 0 }; // No employer NIC up to UEL
    
    case 'I': // Freeport + married women
      return { ...baseRates, employeeMainRate: 0.0585 };
    
    case 'J': // Deferment
      return { ...baseRates, employeeMainRate: 0, employeePT: 0 };
    
    case 'L': // Freeport + deferment
      return { ...baseRates, employeeMainRate: 0, employeePT: 0 };
    
    case 'M': // Under 21
      return { ...baseRates, employerRate: 0 }; // No employer NIC up to UEL
    
    case 'S': // Freeport + state pension age
      return { ...baseRates, employeeMainRate: 0, employeeUpperRate: 0 };
    
    case 'V': // Investment zone
      return baseRates;
    
    case 'Z': // Under 21 deferment
      return { ...baseRates, employeeMainRate: 0, employeePT: 0, employerRate: 0 };
    
    default:
      return baseRates;
  }
}

export function calculateNIC(input: NICInput, taxYear?: string): NICResult {
  const config = getPayrollTaxYearConfig(taxYear);
  const rates = getNICCategoryRates(input.nicCategory, config);
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  
  // Convert weekly thresholds to period thresholds
  const periodMultiplier = {
    weekly: 1,
    fortnightly: 2,
    four_weekly: 4,
    monthly: 52 / 12,
  }[input.payFrequency];
  
  const periodLEL = config.nicLEL * periodMultiplier;
  const periodPT = config.nicPT * periodMultiplier;
  const periodST = config.nicST * periodMultiplier;
  const periodUEL = config.nicUEL * periodMultiplier;
  
  // Director calculation
  if (input.isDirector && input.directorNICMethod === 'annual') {
    return calculateDirectorAnnualNIC(input, config, rates);
  }
  
  // Standard calculation
  const grossPay = input.grossPay;
  
  // Employee NIC
  let employeeMainBand = 0;
  let employeeUpperBand = 0;
  
  if (grossPay > periodPT && rates.employeePT > 0) {
    employeeMainBand = Math.min(grossPay, periodUEL) - periodPT;
    if (grossPay > periodUEL) {
      employeeUpperBand = grossPay - periodUEL;
    }
  }
  
  const employeeNIC = roundNIC(
    (employeeMainBand * rates.employeeMainRate) + 
    (employeeUpperBand * rates.employeeUpperRate)
  );
  
  // Employer NIC
  let employerContribution = 0;
  if (grossPay > periodST) {
    // For categories H, M, Z - no employer NIC up to UEL
    if (['H', 'M', 'Z'].includes(input.nicCategory)) {
      if (grossPay > periodUEL) {
        employerContribution = (grossPay - periodUEL) * rates.employerRate;
      }
    } else {
      employerContribution = (grossPay - periodST) * rates.employerRate;
    }
  }
  
  const employerNIC = roundNIC(employerContribution);
  
  return {
    employeeNIC,
    employerNIC,
    nicablePay: grossPay,
    ytdEmployeeNIC: (input.ytdEmployeeNIC || 0) + employeeNIC,
    ytdEmployerNIC: (input.ytdEmployerNIC || 0) + employerNIC,
    breakdown: {
      employeeMainBand: roundNIC(employeeMainBand * rates.employeeMainRate),
      employeeUpperBand: roundNIC(employeeUpperBand * rates.employeeUpperRate),
      employerContribution: employerNIC,
    },
  };
}

function calculateDirectorAnnualNIC(
  input: NICInput,
  config: PayrollTaxYearConfig,
  rates: NICCategoryRates
): NICResult {
  // Director annual method: apply full annual limits
  const annualLEL = config.nicLEL * 52;
  const annualPT = config.nicPT * 52;
  const annualST = config.nicST * 52;
  const annualUEL = config.nicUEL * 52;
  
  const cumulativeGross = (input.ytdGrossPay || 0) + input.grossPay;
  
  // Calculate total NIC due based on cumulative earnings
  let cumulativeEmployeeMainBand = 0;
  let cumulativeEmployeeUpperBand = 0;
  
  if (cumulativeGross > annualPT && rates.employeePT > 0) {
    cumulativeEmployeeMainBand = Math.min(cumulativeGross, annualUEL) - annualPT;
    if (cumulativeGross > annualUEL) {
      cumulativeEmployeeUpperBand = cumulativeGross - annualUEL;
    }
  }
  
  const cumulativeEmployeeNIC = roundNIC(
    (cumulativeEmployeeMainBand * rates.employeeMainRate) +
    (cumulativeEmployeeUpperBand * rates.employeeUpperRate)
  );
  
  const employeeNICThisPeriod = Math.max(0, cumulativeEmployeeNIC - (input.ytdEmployeeNIC || 0));
  
  // Employer NIC
  let cumulativeEmployerNIC = 0;
  if (cumulativeGross > annualST) {
    cumulativeEmployerNIC = (cumulativeGross - annualST) * rates.employerRate;
  }
  
  const employerNICThisPeriod = roundNIC(Math.max(0, cumulativeEmployerNIC - (input.ytdEmployerNIC || 0)));
  
  return {
    employeeNIC: roundNIC(employeeNICThisPeriod),
    employerNIC: employerNICThisPeriod,
    nicablePay: input.grossPay,
    ytdEmployeeNIC: cumulativeEmployeeNIC,
    ytdEmployerNIC: roundNIC(cumulativeEmployerNIC),
    breakdown: {
      employeeMainBand: roundNIC(cumulativeEmployeeMainBand * rates.employeeMainRate),
      employeeUpperBand: roundNIC(cumulativeEmployeeUpperBand * rates.employeeUpperRate),
      employerContribution: employerNICThisPeriod,
    },
  };
}

function roundNIC(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ============================================================================
// STUDENT LOAN CALCULATION
// ============================================================================

export type StudentLoanPlan = 'plan_1' | 'plan_2' | 'plan_4' | null;

export interface StudentLoanInput {
  grossPay: number;
  studentLoanPlan: StudentLoanPlan;
  hasPostgraduateLoan: boolean;
  payFrequency: PayFrequency;
}

export interface StudentLoanResult {
  studentLoanDeduction: number;
  postgraduateLoanDeduction: number;
  totalStudentLoanDeduction: number;
}

export function calculateStudentLoan(input: StudentLoanInput, taxYear?: string): StudentLoanResult {
  const config = getPayrollTaxYearConfig(taxYear);
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  
  let studentLoanDeduction = 0;
  let postgraduateLoanDeduction = 0;
  
  // Student loan calculation
  if (input.studentLoanPlan) {
    let annualThreshold: number;
    
    switch (input.studentLoanPlan) {
      case 'plan_1':
        annualThreshold = config.studentLoanPlan1Threshold;
        break;
      case 'plan_2':
        annualThreshold = config.studentLoanPlan2Threshold;
        break;
      case 'plan_4':
        annualThreshold = config.studentLoanPlan4Threshold;
        break;
      default:
        annualThreshold = 0;
    }
    
    const periodThreshold = annualThreshold / periodsInYear;
    
    if (input.grossPay > periodThreshold) {
      studentLoanDeduction = roundToWholePounds((input.grossPay - periodThreshold) * config.studentLoanRate);
    }
  }
  
  // Postgraduate loan calculation
  if (input.hasPostgraduateLoan) {
    const periodThreshold = config.postgraduateLoanThreshold / periodsInYear;
    
    if (input.grossPay > periodThreshold) {
      postgraduateLoanDeduction = roundToWholePounds((input.grossPay - periodThreshold) * config.postgraduateLoanRate);
    }
  }
  
  return {
    studentLoanDeduction,
    postgraduateLoanDeduction,
    totalStudentLoanDeduction: studentLoanDeduction + postgraduateLoanDeduction,
  };
}

function roundToWholePounds(amount: number): number {
  return Math.floor(amount);
}

// ============================================================================
// PENSION CALCULATION
// ============================================================================

export interface PensionInput {
  grossPay: number;
  payFrequency: PayFrequency;
  employeeRateOverride?: number;
  employerRateOverride?: number;
  salarySacrifice: boolean;
  isOptedOut: boolean;
  pensionSchemeType: 'qualifying_earnings' | 'basic_pay' | 'total_earnings';
}

export interface PensionResult {
  employeePensionContribution: number;
  employerPensionContribution: number;
  qualifyingEarningsThisPeriod: number;
  pensionablePay: number;
  salarySacrificeAmount: number;
}

export function calculatePension(input: PensionInput, taxYear?: string): PensionResult {
  const config = getPayrollTaxYearConfig(taxYear);
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  
  if (input.isOptedOut) {
    return {
      employeePensionContribution: 0,
      employerPensionContribution: 0,
      qualifyingEarningsThisPeriod: 0,
      pensionablePay: 0,
      salarySacrificeAmount: 0,
    };
  }
  
  const periodLowerLimit = config.pensionQualifyingEarningsLower / periodsInYear;
  const periodUpperLimit = config.pensionQualifyingEarningsUpper / periodsInYear;
  
  const employeeRate = input.employeeRateOverride ?? config.pensionMinEmployeeRate;
  const employerRate = input.employerRateOverride ?? config.pensionMinEmployerRate;
  
  let pensionablePay: number;
  let qualifyingEarnings: number;
  
  switch (input.pensionSchemeType) {
    case 'qualifying_earnings':
      // Standard auto-enrolment: contributions on qualifying earnings only
      qualifyingEarnings = Math.max(0, Math.min(input.grossPay, periodUpperLimit) - periodLowerLimit);
      pensionablePay = qualifyingEarnings;
      break;
    
    case 'basic_pay':
      // Contributions on basic pay only (above LEL)
      qualifyingEarnings = Math.max(0, input.grossPay - periodLowerLimit);
      pensionablePay = qualifyingEarnings;
      break;
    
    case 'total_earnings':
      // Contributions on total earnings
      qualifyingEarnings = input.grossPay;
      pensionablePay = input.grossPay;
      break;
    
    default:
      qualifyingEarnings = Math.max(0, Math.min(input.grossPay, periodUpperLimit) - periodLowerLimit);
      pensionablePay = qualifyingEarnings;
  }
  
  let employeeContribution: number;
  let employerContribution: number;
  let salarySacrificeAmount = 0;
  
  if (input.salarySacrifice) {
    // Salary sacrifice: employee contribution becomes employer contribution
    salarySacrificeAmount = roundPension(pensionablePay * employeeRate);
    employeeContribution = 0;
    employerContribution = roundPension(pensionablePay * (employeeRate + employerRate));
  } else {
    employeeContribution = roundPension(pensionablePay * employeeRate);
    employerContribution = roundPension(pensionablePay * employerRate);
  }
  
  return {
    employeePensionContribution: employeeContribution,
    employerPensionContribution: employerContribution,
    qualifyingEarningsThisPeriod: qualifyingEarnings,
    pensionablePay,
    salarySacrificeAmount,
  };
}

function roundPension(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ============================================================================
// STATUTORY PAY CALCULATION
// ============================================================================

export type AbsenceType = 'ssp' | 'smp' | 'spp' | 'sap' | 'shpp' | 'spbp';

export interface StatutoryPayInput {
  averageWeeklyEarnings: number;
  absenceType: AbsenceType;
  weeksIntoAbsence: number;
  qualifyingDaysInPeriod?: number;  // For SSP
  payFrequency: PayFrequency;
}

export interface StatutoryPayResult {
  statutoryPayThisPeriod: number;
  weeksPaid: number;
  rate: 'higher' | 'standard' | 'nil';
  breakdown: {
    daysAtHigherRate: number;
    daysAtStandardRate: number;
    higherRateAmount: number;
    standardRateAmount: number;
  };
}

export function calculateStatutoryPay(input: StatutoryPayInput, taxYear?: string): StatutoryPayResult {
  const config = getPayrollTaxYearConfig(taxYear);
  
  // Check eligibility (AWE must be at least LEL)
  if (input.averageWeeklyEarnings < config.sspLEL) {
    return {
      statutoryPayThisPeriod: 0,
      weeksPaid: 0,
      rate: 'nil',
      breakdown: {
        daysAtHigherRate: 0,
        daysAtStandardRate: 0,
        higherRateAmount: 0,
        standardRateAmount: 0,
      },
    };
  }
  
  switch (input.absenceType) {
    case 'ssp':
      return calculateSSP(input, config);
    case 'smp':
      return calculateSMP(input, config);
    case 'spp':
    case 'sap':
    case 'shpp':
    case 'spbp':
      return calculateOtherStatutoryPay(input, config);
    default:
      return {
        statutoryPayThisPeriod: 0,
        weeksPaid: 0,
        rate: 'nil',
        breakdown: {
          daysAtHigherRate: 0,
          daysAtStandardRate: 0,
          higherRateAmount: 0,
          standardRateAmount: 0,
        },
      };
  }
}

function calculateSSP(
  input: StatutoryPayInput,
  config: PayrollTaxYearConfig
): StatutoryPayResult {
  // SSP is paid for qualifying days (max 5 per week) after 3 waiting days
  // Max 28 weeks
  const maxWeeks = 28;
  
  if (input.weeksIntoAbsence >= maxWeeks) {
    return {
      statutoryPayThisPeriod: 0,
      weeksPaid: 0,
      rate: 'nil',
      breakdown: {
        daysAtHigherRate: 0,
        daysAtStandardRate: 0,
        higherRateAmount: 0,
        standardRateAmount: 0,
      },
    };
  }
  
  const qualifyingDays = input.qualifyingDaysInPeriod || 0;
  const dailyRate = config.sspWeeklyRate / 5; // Assuming 5 qualifying days per week
  
  const sspAmount = roundStatutory(qualifyingDays * dailyRate);
  
  // Calculate weeks based on pay frequency
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  const weeksPaid = qualifyingDays / 5;
  
  return {
    statutoryPayThisPeriod: sspAmount,
    weeksPaid,
    rate: 'standard',
    breakdown: {
      daysAtHigherRate: 0,
      daysAtStandardRate: qualifyingDays,
      higherRateAmount: 0,
      standardRateAmount: sspAmount,
    },
  };
}

function calculateSMP(
  input: StatutoryPayInput,
  config: PayrollTaxYearConfig
): StatutoryPayResult {
  // SMP: 90% of AWE for first 6 weeks, then standard rate for remaining 33 weeks
  const maxWeeks = config.smpWeeks;
  const higherRateWeeks = 6;
  
  if (input.weeksIntoAbsence >= maxWeeks) {
    return {
      statutoryPayThisPeriod: 0,
      weeksPaid: 0,
      rate: 'nil',
      breakdown: {
        daysAtHigherRate: 0,
        daysAtStandardRate: 0,
        higherRateAmount: 0,
        standardRateAmount: 0,
      },
    };
  }
  
  // Calculate weeks in this pay period
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  const weeksInPeriod = 52 / periodsInYear;
  
  const weekStart = input.weeksIntoAbsence;
  const weekEnd = Math.min(weekStart + weeksInPeriod, maxWeeks);
  
  let higherRateAmount = 0;
  let standardRateAmount = 0;
  let daysAtHigherRate = 0;
  let daysAtStandardRate = 0;
  
  // Calculate higher rate (90% of AWE or standard rate, whichever is lower)
  const higherRateWeekly = Math.min(
    input.averageWeeklyEarnings * config.smpFirstSixWeeksRate,
    input.averageWeeklyEarnings
  );
  
  for (let week = weekStart; week < weekEnd; week++) {
    if (week < higherRateWeeks) {
      // Higher rate period
      higherRateAmount += higherRateWeekly;
      daysAtHigherRate += 7;
    } else {
      // Standard rate period (lesser of standard rate or 90% of AWE)
      const standardWeekly = Math.min(config.smpStandardWeeklyRate, input.averageWeeklyEarnings * 0.9);
      standardRateAmount += standardWeekly;
      daysAtStandardRate += 7;
    }
  }
  
  const totalAmount = roundStatutory(higherRateAmount + standardRateAmount);
  const weeksPaid = weekEnd - weekStart;
  
  return {
    statutoryPayThisPeriod: totalAmount,
    weeksPaid,
    rate: weekStart < higherRateWeeks ? 'higher' : 'standard',
    breakdown: {
      daysAtHigherRate,
      daysAtStandardRate,
      higherRateAmount: roundStatutory(higherRateAmount),
      standardRateAmount: roundStatutory(standardRateAmount),
    },
  };
}

function calculateOtherStatutoryPay(
  input: StatutoryPayInput,
  config: PayrollTaxYearConfig
): StatutoryPayResult {
  // SPP, SAP, ShPP, SPBP follow similar rules to SMP
  let weeklyRate: number;
  let maxWeeks: number;
  
  switch (input.absenceType) {
    case 'spp':
      weeklyRate = config.sppWeeklyRate;
      maxWeeks = 2;
      break;
    case 'sap':
      weeklyRate = config.sapWeeklyRate;
      maxWeeks = 39;
      break;
    case 'shpp':
      weeklyRate = config.shppWeeklyRate;
      maxWeeks = 37; // Shared with SMP/SPP
      break;
    case 'spbp':
      weeklyRate = config.spbpWeeklyRate;
      maxWeeks = 2;
      break;
    default:
      weeklyRate = 0;
      maxWeeks = 0;
  }
  
  if (input.weeksIntoAbsence >= maxWeeks) {
    return {
      statutoryPayThisPeriod: 0,
      weeksPaid: 0,
      rate: 'nil',
      breakdown: {
        daysAtHigherRate: 0,
        daysAtStandardRate: 0,
        higherRateAmount: 0,
        standardRateAmount: 0,
      },
    };
  }
  
  // Use lesser of standard rate or 90% of AWE
  const effectiveRate = Math.min(weeklyRate, input.averageWeeklyEarnings * 0.9);
  
  const periodsInYear = getPeriodsInYear(input.payFrequency);
  const weeksInPeriod = 52 / periodsInYear;
  const weeksRemaining = maxWeeks - input.weeksIntoAbsence;
  const weeksToPay = Math.min(weeksInPeriod, weeksRemaining);
  
  const amount = roundStatutory(effectiveRate * weeksToPay);
  
  return {
    statutoryPayThisPeriod: amount,
    weeksPaid: weeksToPay,
    rate: 'standard',
    breakdown: {
      daysAtHigherRate: 0,
      daysAtStandardRate: Math.round(weeksToPay * 7),
      higherRateAmount: 0,
      standardRateAmount: amount,
    },
  };
}

function roundStatutory(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ============================================================================
// MASTER PAYSLIP CALCULATOR
// ============================================================================

export interface PayslipInput {
  employee: {
    taxCode: string;
    nicCategory: NICCategory;
    isDirector: boolean;
    directorNICMethod?: 'cumulative' | 'annual';
    studentLoanPlan: StudentLoanPlan;
    hasPostgraduateLoan: boolean;
    pensionEmployeeRate: number;
    pensionEmployerRate: number;
    salarySacrificePension: boolean;
    pensionOptedOut: boolean;
    pensionSchemeType: 'qualifying_earnings' | 'basic_pay' | 'total_earnings';
  };
  payRun: {
    payFrequency: PayFrequency;
    taxPeriod: number;
    taxYear: string;
    paymentDate: string;
    periodStart: string;
    periodEnd: string;
    taxBasis: 'cumulative' | 'week1_month1';
  };
  earnings: {
    basicPay: number;
    overtimePay?: number;
    bonusPay?: number;
    commissionPay?: number;
    holidayPay?: number;
    sickPay?: number;
    otherPay?: number;
  };
  deductions: {
    salarySacrificePension?: number;
    salarySacrificeOther?: number;
    attachmentOfEarnings?: number;
    otherDeductions?: number;
  };
  ytdFigures: {
    grossPay: number;
    taxablePay: number;
    taxPaid: number;
    employeeNIC: number;
    employerNIC: number;
    employeePension: number;
    employerPension: number;
    studentLoan: number;
  };
  absences?: {
    type: AbsenceType;
    averageWeeklyEarnings: number;
    weeksIntoAbsence: number;
    qualifyingDaysInPeriod?: number;
  }[];
}

export interface PayslipResult {
  grossPay: number;
  taxablePay: number;
  nicablePay: number;
  pensionablePay: number;
  
  paye: PAYEResult;
  nic: NICResult;
  studentLoan: StudentLoanResult;
  pension: PensionResult;
  statutoryPay: StatutoryPayResult[];
  
  totalDeductions: number;
  netPay: number;
  employerCosts: number;
  
  ytd: {
    grossPay: number;
    taxablePay: number;
    taxPaid: number;
    employeeNIC: number;
    employerNIC: number;
    employeePension: number;
    employerPension: number;
    studentLoan: number;
  };
}

export function calculatePayslip(input: PayslipInput): PayslipResult {
  const { employee, payRun, earnings, deductions, ytdFigures, absences } = input;
  
  // Calculate gross pay
  const grossPay = 
    (earnings.basicPay || 0) +
    (earnings.overtimePay || 0) +
    (earnings.bonusPay || 0) +
    (earnings.commissionPay || 0) +
    (earnings.holidayPay || 0) +
    (earnings.sickPay || 0) +
    (earnings.otherPay || 0);
  
  // Calculate statutory pay for absences
  const statutoryPayResults: StatutoryPayResult[] = [];
  let totalStatutoryPay = 0;
  
  if (absences && absences.length > 0) {
    for (const absence of absences) {
      const statutoryResult = calculateStatutoryPay({
        averageWeeklyEarnings: absence.averageWeeklyEarnings,
        absenceType: absence.type,
        weeksIntoAbsence: absence.weeksIntoAbsence,
        qualifyingDaysInPeriod: absence.qualifyingDaysInPeriod,
        payFrequency: payRun.payFrequency,
      }, payRun.taxYear);
      
      statutoryPayResults.push(statutoryResult);
      totalStatutoryPay += statutoryResult.statutoryPayThisPeriod;
    }
  }
  
  // Pre-deduction adjustments (salary sacrifice)
  const salarySacrificeTotal = 
    (deductions.salarySacrificePension || 0) +
    (deductions.salarySacrificeOther || 0);
  
  // Taxable pay (gross less salary sacrifice)
  const taxablePay = grossPay - salarySacrificeTotal + totalStatutoryPay;
  
  // NICable pay (similar to taxable for most purposes)
  const nicablePay = taxablePay;
  
  // PAYE calculation
  const payeResult = calculatePAYE({
    grossPay: taxablePay,
    taxCode: employee.taxCode,
    taxBasis: payRun.taxBasis,
    payFrequency: payRun.payFrequency,
    taxPeriod: payRun.taxPeriod,
    ytdGrossPay: ytdFigures.taxablePay,
    ytdTaxPaid: ytdFigures.taxPaid,
  }, payRun.taxYear);
  
  // NIC calculation
  const nicResult = calculateNIC({
    grossPay: nicablePay,
    nicCategory: employee.nicCategory,
    payFrequency: payRun.payFrequency,
    isDirector: employee.isDirector,
    directorNICMethod: employee.directorNICMethod,
    taxPeriod: payRun.taxPeriod,
    ytdGrossPay: ytdFigures.grossPay,
    ytdEmployeeNIC: ytdFigures.employeeNIC,
    ytdEmployerNIC: ytdFigures.employerNIC,
  }, payRun.taxYear);
  
  // Student loan calculation
  const studentLoanResult = calculateStudentLoan({
    grossPay: taxablePay,
    studentLoanPlan: employee.studentLoanPlan,
    hasPostgraduateLoan: employee.hasPostgraduateLoan,
    payFrequency: payRun.payFrequency,
  }, payRun.taxYear);
  
  // Pension calculation
  const pensionResult = calculatePension({
    grossPay: taxablePay,
    payFrequency: payRun.payFrequency,
    employeeRateOverride: employee.pensionEmployeeRate,
    employerRateOverride: employee.pensionEmployerRate,
    salarySacrifice: employee.salarySacrificePension,
    isOptedOut: employee.pensionOptedOut,
    pensionSchemeType: employee.pensionSchemeType,
  }, payRun.taxYear);
  
  // Total deductions
  const totalDeductions = 
    payeResult.taxDueThisPeriod +
    nicResult.employeeNIC +
    studentLoanResult.totalStudentLoanDeduction +
    pensionResult.employeePensionContribution +
    (deductions.attachmentOfEarnings || 0) +
    (deductions.otherDeductions || 0);
  
  // Net pay
  const netPay = roundPayslip(grossPay + totalStatutoryPay - totalDeductions - salarySacrificeTotal);
  
  // Employer costs
  const employerCosts = roundPayslip(
    grossPay + 
    totalStatutoryPay +
    nicResult.employerNIC +
    pensionResult.employerPensionContribution
  );
  
  // YTD figures
  const ytd = {
    grossPay: roundPayslip(ytdFigures.grossPay + grossPay + totalStatutoryPay),
    taxablePay: roundPayslip(ytdFigures.taxablePay + taxablePay),
    taxPaid: payeResult.taxDueYTD,
    employeeNIC: nicResult.ytdEmployeeNIC,
    employerNIC: nicResult.ytdEmployerNIC,
    employeePension: roundPayslip(ytdFigures.employeePension + pensionResult.employeePensionContribution),
    employerPension: roundPayslip(ytdFigures.employerPension + pensionResult.employerPensionContribution),
    studentLoan: roundPayslip(ytdFigures.studentLoan + studentLoanResult.totalStudentLoanDeduction),
  };
  
  return {
    grossPay: roundPayslip(grossPay + totalStatutoryPay),
    taxablePay: roundPayslip(taxablePay),
    nicablePay: roundPayslip(nicablePay),
    pensionablePay: pensionResult.pensionablePay,
    paye: payeResult,
    nic: nicResult,
    studentLoan: studentLoanResult,
    pension: pensionResult,
    statutoryPay: statutoryPayResults,
    totalDeductions: roundPayslip(totalDeductions),
    netPay,
    employerCosts,
    ytd,
  };
}

function roundPayslip(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ============================================================================
// YTD DERIVATION HELPER
// ============================================================================

export interface PayslipYTDData {
  gross_pay: number;
  taxable_pay: number;
  paye_tax: number;
  employee_nic: number;
  employer_nic: number;
  employee_pension: number;
  employer_pension: number;
  student_loan: number;
}

export interface DerivedYTD {
  grossPay: number;
  taxablePay: number;
  taxPaid: number;
  employeeNIC: number;
  employerNIC: number;
  employeePension: number;
  employerPension: number;
  studentLoan: number;
}

/**
 * Derives YTD figures from historical payslips
 * IMPORTANT: Payslips are the canonical source of truth for YTD
 * This function should be used to compute YTD before each payslip calculation
 */
export function deriveYTDFromPayslips(payslips: PayslipYTDData[]): DerivedYTD {
  return payslips.reduce(
    (ytd, slip) => ({
      grossPay: roundPayslip(ytd.grossPay + (slip.gross_pay || 0)),
      taxablePay: roundPayslip(ytd.taxablePay + (slip.taxable_pay || 0)),
      taxPaid: roundPayslip(ytd.taxPaid + (slip.paye_tax || 0)),
      employeeNIC: roundPayslip(ytd.employeeNIC + (slip.employee_nic || 0)),
      employerNIC: roundPayslip(ytd.employerNIC + (slip.employer_nic || 0)),
      employeePension: roundPayslip(ytd.employeePension + (slip.employee_pension || 0)),
      employerPension: roundPayslip(ytd.employerPension + (slip.employer_pension || 0)),
      studentLoan: roundPayslip(ytd.studentLoan + (slip.student_loan || 0)),
    }),
    {
      grossPay: 0,
      taxablePay: 0,
      taxPaid: 0,
      employeeNIC: 0,
      employerNIC: 0,
      employeePension: 0,
      employerPension: 0,
      studentLoan: 0,
    }
  );
}

// ============================================================================
// AVERAGE WEEKLY EARNINGS CALCULATION
// ============================================================================

/**
 * Calculates Average Weekly Earnings for statutory pay purposes
 * Uses the 8-week reference period before the qualifying week
 */
export function calculateAverageWeeklyEarnings(
  historicalPayslips: PayslipYTDData[],
  payFrequency: PayFrequency
): number {
  if (historicalPayslips.length === 0) return 0;
  
  const periodsInYear = getPeriodsInYear(payFrequency);
  const weeksPerPeriod = 52 / periodsInYear;
  
  // For AWE, we typically use 8 weeks of earnings
  const periodsToUse = Math.min(historicalPayslips.length, Math.ceil(8 / weeksPerPeriod));
  
  const recentPayslips = historicalPayslips.slice(-periodsToUse);
  const totalGross = recentPayslips.reduce((sum, p) => sum + (p.gross_pay || 0), 0);
  const totalWeeks = periodsToUse * weeksPerPeriod;
  
  return roundPayslip(totalGross / totalWeeks * weeksPerPeriod / weeksPerPeriod);
}
