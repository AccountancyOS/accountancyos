/**
 * Tax Rates Service
 * Fetches all tax parameters from DB tables instead of hardcoded constants.
 * Used by tax-calculation-engine.ts and capital-allowances-engine.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import type { TaxYearConfig } from "./tax-calculation-engine";

// ==================== SA RATE TABLE ====================

export interface SARateRow {
  tax_year: string;
  effective_from: string;
  effective_to: string | null;
  personal_allowance: number;
  taper_threshold: number;
  basic_rate_limit: number;
  higher_rate_limit: number;
  basic_rate: number;
  higher_rate: number;
  additional_rate: number;
  dividend_allowance: number;
  dividend_basic_rate: number;
  dividend_higher_rate: number;
  dividend_additional_rate: number;
  savings_nil_rate_basic: number;
  savings_nil_rate_higher: number;
  class2_threshold: number;
  class2_weekly_rate: number;
  class4_lower_limit: number;
  class4_upper_limit: number;
  class4_main_rate: number;
  class4_additional_rate: number;
  cgt_basic_rate: number;
  cgt_higher_rate: number;
  cgt_residential_basic: number;
  cgt_residential_higher: number;
  cgt_annual_exempt_amount: number;
  student_loan_plan1_threshold: number;
  student_loan_plan2_threshold: number;
  student_loan_plan4_threshold: number;
  student_loan_plan5_threshold: number;
  student_loan_pg_threshold: number;
  student_loan_plan1_rate: number;
  student_loan_plan2_rate: number;
  student_loan_plan4_rate: number;
  student_loan_plan5_rate: number;
  student_loan_pg_rate: number;
  marriage_allowance_amount: number;
  hicbc_threshold: number;
  hicbc_upper_threshold: number;
  pension_annual_allowance: number;
  pension_taper_threshold: number;
  pension_taper_floor: number;
  pension_mpaa: number;
}

// In-memory cache (per session)
const saRateCache = new Map<string, SARateRow>();

/**
 * Fetch SA rates for a given tax year from DB.
 * Falls back to hardcoded defaults only if DB is unreachable.
 */
export async function fetchSARates(taxYear: string): Promise<SARateRow> {
  if (saRateCache.has(taxYear)) {
    return saRateCache.get(taxYear)!;
  }

  const { data, error } = await supabase
    .from('sa_rate_tables')
    .select('*')
    .eq('tax_year', taxYear)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn(`SA rates not found in DB for ${taxYear}, using fallback`);
    return getFallbackSARates(taxYear);
  }

  const row = data as unknown as SARateRow;
  saRateCache.set(taxYear, row);
  return row;
}

/**
 * Convert SARateRow to TaxYearConfig (backward-compatible shape)
 */
export function saRateToTaxYearConfig(row: SARateRow): TaxYearConfig {
  return {
    year: row.tax_year,
    personalAllowance: Number(row.personal_allowance),
    personalAllowanceTaperThreshold: Number(row.taper_threshold),
    basicRateLimit: Number(row.basic_rate_limit),
    higherRateLimit: Number(row.higher_rate_limit),
    basicRate: Number(row.basic_rate),
    higherRate: Number(row.higher_rate),
    additionalRate: Number(row.additional_rate),
    dividendAllowance: Number(row.dividend_allowance),
    dividendBasicRate: Number(row.dividend_basic_rate),
    dividendHigherRate: Number(row.dividend_higher_rate),
    dividendAdditionalRate: Number(row.dividend_additional_rate),
    class2Threshold: Number(row.class2_threshold),
    class2WeeklyRate: Number(row.class2_weekly_rate),
    class4LowerLimit: Number(row.class4_lower_limit),
    class4UpperLimit: Number(row.class4_upper_limit),
    class4MainRate: Number(row.class4_main_rate),
    class4AdditionalRate: Number(row.class4_additional_rate),
    // CT rates stay in ct_rate_tables — use 0 as placeholder
    ctSmallProfitsRate: 0.19,
    ctMainRate: 0.25,
    ctSmallProfitsLimit: 50000,
    ctMarginalReliefUpperLimit: 250000,
    ctMarginalReliefFraction: 3 / 200,
  };
}

// ==================== CA RATE TABLE ====================

export interface CARateRow {
  effective_from: string;
  effective_to: string | null;
  aia_limit: number;
  wda_main_rate: number;
  wda_special_rate: number;
  full_expensing_available: boolean;
  full_expensing_rate: number;
  fya_50_rate: number;
  fya_zero_emission_rate: number;
  car_zero_emission_threshold: number;
  car_low_emission_max: number;
}

const caRateCache = new Map<string, CARateRow>();

/**
 * Fetch CA rates applicable for a given period end date.
 */
export async function fetchCARates(periodEndDate: string): Promise<CARateRow> {
  if (caRateCache.has(periodEndDate)) {
    return caRateCache.get(periodEndDate)!;
  }

  const { data, error } = await supabase
    .from('ca_rate_tables')
    .select('*')
    .lte('effective_from', periodEndDate)
    .or(`effective_to.is.null,effective_to.gte.${periodEndDate}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn(`CA rates not found in DB for period ending ${periodEndDate}, using fallback`);
    return getFallbackCARates();
  }

  const row = data as unknown as CARateRow;
  caRateCache.set(periodEndDate, row);
  return row;
}

/**
 * Clear caches (useful for tests or after rate updates)
 */
export function clearRatesCaches(): void {
  saRateCache.clear();
  caRateCache.clear();
}

// ==================== FALLBACKS ====================
// Only used when DB is unreachable — ensures engine never crashes

function getFallbackSARates(taxYear: string): SARateRow {
  const is2324 = taxYear === '2023/24';
  return {
    tax_year: taxYear,
    effective_from: is2324 ? '2023-04-06' : '2024-04-06',
    effective_to: is2324 ? '2024-04-05' : '2025-04-05',
    personal_allowance: 12570,
    taper_threshold: 100000,
    basic_rate_limit: 37700,
    higher_rate_limit: 125140,
    basic_rate: 0.20,
    higher_rate: 0.40,
    additional_rate: 0.45,
    dividend_allowance: is2324 ? 1000 : 500,
    dividend_basic_rate: 0.0875,
    dividend_higher_rate: 0.3375,
    dividend_additional_rate: 0.3935,
    savings_nil_rate_basic: 1000,
    savings_nil_rate_higher: 500,
    class2_threshold: 12570,
    class2_weekly_rate: 3.45,
    class4_lower_limit: 12570,
    class4_upper_limit: 50270,
    class4_main_rate: is2324 ? 0.09 : 0.06,
    class4_additional_rate: 0.02,
    cgt_basic_rate: 0.10,
    cgt_higher_rate: 0.20,
    cgt_residential_basic: 0.18,
    cgt_residential_higher: 0.28,
    cgt_annual_exempt_amount: is2324 ? 6000 : 3000,
    student_loan_plan1_threshold: 22015,
    student_loan_plan2_threshold: 27295,
    student_loan_plan4_threshold: 27660,
    student_loan_plan5_threshold: 25000,
    student_loan_pg_threshold: 21000,
    student_loan_plan1_rate: 0.09,
    student_loan_plan2_rate: 0.09,
    student_loan_plan4_rate: 0.09,
    student_loan_plan5_rate: 0.09,
    student_loan_pg_rate: 0.06,
    marriage_allowance_amount: 1260,
    hicbc_threshold: is2324 ? 50000 : 60000,
    hicbc_upper_threshold: is2324 ? 60000 : 80000,
    pension_annual_allowance: 60000,
    pension_taper_threshold: 260000,
    pension_taper_floor: 10000,
    pension_mpaa: 10000,
  };
}

function getFallbackCARates(): CARateRow {
  return {
    effective_from: '2023-04-01',
    effective_to: null,
    aia_limit: 1000000,
    wda_main_rate: 0.18,
    wda_special_rate: 0.06,
    full_expensing_available: true,
    full_expensing_rate: 1.0,
    fya_50_rate: 0.5,
    fya_zero_emission_rate: 1.0,
    car_zero_emission_threshold: 0,
    car_low_emission_max: 50,
  };
}
