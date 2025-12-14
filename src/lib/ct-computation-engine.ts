import { supabase } from "@/integrations/supabase/client";
import { CapitalAllowancesResult } from "./capital-allowances-engine";

// CT Rate regime interface
export interface CTRateRegime {
  id: string;
  effective_from: string;
  effective_to: string | null;
  main_rate: number;
  small_profits_rate: number;
  lower_limit: number;
  upper_limit: number;
  marginal_relief_fraction: number;
}

export interface AddBack {
  description: string;
  account_code?: string;
  amount: number;
  category: 'depreciation' | 'entertainment' | 'fines_penalties' | 'donations' | 'other_disallowable';
  notes?: string;
}

export interface Deduction {
  description: string;
  amount: number;
  category: 'capital_allowances' | 'other_deductions';
  notes?: string;
}

export interface CTComputationInput {
  company_id: string;
  organization_id: string;
  accounts_snapshot_id: string;
  period_start: string;
  period_end: string;
  accounting_profit: number;
  add_backs: AddBack[];
  deductions: Deduction[];
  capital_allowances_result?: CapitalAllowancesResult;
  associated_companies_count: number; // REQUIRED - must be explicitly provided
}

export interface CTComputationResult {
  company_id: string;
  accounts_snapshot_id: string;
  period_start: string;
  period_end: string;
  short_period_factor: number;
  
  // Associated companies
  associated_companies_count: number;
  
  // Profit reconciliation
  accounting_profit: number;
  total_add_backs: number;
  add_backs_breakdown: AddBack[];
  total_deductions: number;
  deductions_breakdown: Deduction[];
  
  // Capital allowances
  total_capital_allowances: number;
  balancing_charges: number;
  net_capital_allowances: number;
  pools_summary: any[];
  claims_summary: any[];
  
  // Tax computation
  taxable_total_profits: number;
  
  // Rate determination
  applicable_rate: 'small_profits' | 'main' | 'marginal';
  effective_rate: number;
  adjusted_lower_limit: number;
  adjusted_upper_limit: number;
  
  // Tax calculation
  tax_at_main_rate: number;
  marginal_relief_fraction: number;
  marginal_relief_amount: number;
  corporation_tax_due: number;
  
  // Metadata
  snapshot_hash: string;
  generator_version: string;
  rate_table_id: string;
}

// Fetch CT rate from database by period end date
async function fetchCTRateRegime(periodEnd: Date): Promise<CTRateRegime> {
  const periodEndStr = periodEnd.toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('ct_rate_tables')
    .select('*')
    .lte('effective_from', periodEndStr)
    .or(`effective_to.is.null,effective_to.gte.${periodEndStr}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error('Failed to fetch CT rate regime:', error);
    // Fallback to post-2023 rates if database lookup fails
    return {
      id: 'fallback-post-2023',
      effective_from: '2023-04-01',
      effective_to: null,
      main_rate: 0.25,
      small_profits_rate: 0.19,
      lower_limit: 50000,
      upper_limit: 250000,
      marginal_relief_fraction: 0.015,
    };
  }

  return data as CTRateRegime;
}

// Calculate short period factor
function calculateShortPeriodFactor(periodStart: Date, periodEnd: Date): number {
  const days = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(days / 365, 1);
}

// Adjust limits for short periods and associated companies
function adjustLimits(
  lowerLimit: number,
  upperLimit: number,
  shortPeriodFactor: number,
  associatedCompaniesCount: number
): { adjustedLower: number; adjustedUpper: number } {
  // Associated companies reduces limits (divide by number of companies including self)
  const associatedFactor = 1 / (associatedCompaniesCount + 1);
  
  return {
    adjustedLower: Math.round(lowerLimit * shortPeriodFactor * associatedFactor),
    adjustedUpper: Math.round(upperLimit * shortPeriodFactor * associatedFactor),
  };
}

// Calculate corporation tax with marginal relief
function calculateCorporationTax(
  taxableProfit: number,
  regime: CTRateRegime,
  shortPeriodFactor: number,
  associatedCompaniesCount: number
): {
  applicable_rate: 'small_profits' | 'main' | 'marginal';
  effective_rate: number;
  adjusted_lower_limit: number;
  adjusted_upper_limit: number;
  tax_at_main_rate: number;
  marginal_relief_fraction: number;
  marginal_relief_amount: number;
  corporation_tax_due: number;
} {
  const { adjustedLower, adjustedUpper } = adjustLimits(
    regime.lower_limit,
    regime.upper_limit,
    shortPeriodFactor,
    associatedCompaniesCount
  );
  
  // If no marginal relief applies (pre-2023 or single rate)
  if (regime.marginal_relief_fraction === 0 || regime.upper_limit === 0) {
    const tax = Math.round(taxableProfit * regime.main_rate * 100) / 100;
    return {
      applicable_rate: 'main',
      effective_rate: regime.main_rate,
      adjusted_lower_limit: adjustedLower,
      adjusted_upper_limit: adjustedUpper,
      tax_at_main_rate: tax,
      marginal_relief_fraction: 0,
      marginal_relief_amount: 0,
      corporation_tax_due: tax,
    };
  }
  
  // Small profits rate
  if (taxableProfit <= adjustedLower) {
    const tax = Math.round(taxableProfit * regime.small_profits_rate * 100) / 100;
    return {
      applicable_rate: 'small_profits',
      effective_rate: regime.small_profits_rate,
      adjusted_lower_limit: adjustedLower,
      adjusted_upper_limit: adjustedUpper,
      tax_at_main_rate: tax,
      marginal_relief_fraction: regime.marginal_relief_fraction,
      marginal_relief_amount: 0,
      corporation_tax_due: tax,
    };
  }
  
  // Main rate
  if (taxableProfit >= adjustedUpper) {
    const tax = Math.round(taxableProfit * regime.main_rate * 100) / 100;
    return {
      applicable_rate: 'main',
      effective_rate: regime.main_rate,
      adjusted_lower_limit: adjustedLower,
      adjusted_upper_limit: adjustedUpper,
      tax_at_main_rate: tax,
      marginal_relief_fraction: regime.marginal_relief_fraction,
      marginal_relief_amount: 0,
      corporation_tax_due: tax,
    };
  }
  
  // Marginal relief applies
  // Tax = P × M - F × (U - P)
  // Where P = profit, M = main rate, F = marginal fraction, U = upper limit
  const taxAtMainRate = taxableProfit * regime.main_rate;
  const marginalReliefAmount = regime.marginal_relief_fraction * (adjustedUpper - taxableProfit);
  const finalTax = Math.round((taxAtMainRate - marginalReliefAmount) * 100) / 100;
  const effectiveRate = finalTax / taxableProfit;
  
  return {
    applicable_rate: 'marginal',
    effective_rate: Math.round(effectiveRate * 10000) / 10000,
    adjusted_lower_limit: adjustedLower,
    adjusted_upper_limit: adjustedUpper,
    tax_at_main_rate: Math.round(taxAtMainRate * 100) / 100,
    marginal_relief_fraction: regime.marginal_relief_fraction,
    marginal_relief_amount: Math.round(marginalReliefAmount * 100) / 100,
    corporation_tax_due: finalTax,
  };
}

// Generate SHA256 hash for snapshot
async function generateSnapshotHash(data: object): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(JSON.stringify(data));
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Main CT computation function
export async function computeCorporationTax(
  input: CTComputationInput
): Promise<CTComputationResult> {
  // Validate required associated_companies_count
  if (input.associated_companies_count === undefined || input.associated_companies_count === null) {
    throw new Error('associated_companies_count is required and must be explicitly provided');
  }
  
  const periodStart = new Date(input.period_start);
  const periodEnd = new Date(input.period_end);
  const shortPeriodFactor = calculateShortPeriodFactor(periodStart, periodEnd);
  
  // Fetch applicable rate regime from database
  const regime = await fetchCTRateRegime(periodEnd);
  
  // Calculate add-backs total
  const totalAddBacks = input.add_backs.reduce((sum, ab) => sum + ab.amount, 0);
  
  // Calculate deductions total (excluding capital allowances which are handled separately)
  const otherDeductions = input.deductions.filter(d => d.category !== 'capital_allowances');
  const totalOtherDeductions = otherDeductions.reduce((sum, d) => sum + d.amount, 0);
  
  // Capital allowances from the engine
  const totalCapitalAllowances = input.capital_allowances_result?.total_allowances || 0;
  const balancingCharges = input.capital_allowances_result?.total_balancing_charges || 0;
  const netCapitalAllowances = totalCapitalAllowances - balancingCharges;
  
  // Calculate taxable profits
  const taxableProfit = Math.max(0,
    input.accounting_profit +
    totalAddBacks -
    totalOtherDeductions -
    totalCapitalAllowances +
    balancingCharges
  );
  
  // Calculate tax
  const taxResult = calculateCorporationTax(
    taxableProfit,
    regime,
    shortPeriodFactor,
    input.associated_companies_count
  );
  
  // Build result
  const result: CTComputationResult = {
    company_id: input.company_id,
    accounts_snapshot_id: input.accounts_snapshot_id,
    period_start: input.period_start,
    period_end: input.period_end,
    short_period_factor: shortPeriodFactor,
    associated_companies_count: input.associated_companies_count,
    
    accounting_profit: input.accounting_profit,
    total_add_backs: totalAddBacks,
    add_backs_breakdown: input.add_backs,
    total_deductions: totalOtherDeductions,
    deductions_breakdown: otherDeductions,
    
    total_capital_allowances: totalCapitalAllowances,
    balancing_charges: balancingCharges,
    net_capital_allowances: netCapitalAllowances,
    pools_summary: input.capital_allowances_result?.pools || [],
    claims_summary: input.capital_allowances_result?.claims || [],
    
    taxable_total_profits: taxableProfit,
    
    ...taxResult,
    
    snapshot_hash: '', // Will be set below
    generator_version: '1.1.0',
    rate_table_id: regime.id,
  };
  
  // Generate hash
  result.snapshot_hash = await generateSnapshotHash(result);
  
  return result;
}

// Save CT computation as snapshot
export async function saveCTComputationSnapshot(
  result: CTComputationResult,
  organizationId: string,
  capPeriodId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('ct_computation_snapshots')
    .insert({
      organization_id: organizationId,
      company_id: result.company_id,
      accounts_snapshot_id: result.accounts_snapshot_id,
      cap_period_id: capPeriodId,
      period_start: result.period_start,
      period_end: result.period_end,
      accounting_profit: result.accounting_profit,
      add_backs: result.add_backs_breakdown as unknown as Record<string, unknown>,
      deductions: result.deductions_breakdown as unknown as Record<string, unknown>,
      total_capital_allowances: result.total_capital_allowances,
      balancing_charges: result.balancing_charges,
      taxable_total_profits: result.taxable_total_profits,
      corporation_tax_rate: result.effective_rate,
      marginal_relief: result.marginal_relief_amount,
      corporation_tax_due: result.corporation_tax_due,
      pools_summary: result.pools_summary as unknown as Record<string, unknown>,
      claims_summary: result.claims_summary as unknown as Record<string, unknown>,
      snapshot_hash: result.snapshot_hash,
      generator_version: result.generator_version,
      status: 'draft',
      associated_companies_count: result.associated_companies_count,
      adjusted_lower_limit: result.adjusted_lower_limit,
      adjusted_upper_limit: result.adjusted_upper_limit,
      short_period_factor: result.short_period_factor,
      marginal_relief_fraction: result.marginal_relief_fraction,
      marginal_relief_amount: result.marginal_relief_amount,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

// Fetch CT computation snapshot
export async function getCTComputationSnapshot(
  snapshotId: string
): Promise<CTComputationResult | null> {
  const { data, error } = await supabase
    .from('ct_computation_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const addBacks = (data.add_backs as unknown as AddBack[]) || [];
  const deductions = (data.deductions as unknown as Deduction[]) || [];
  
  return {
    company_id: data.company_id,
    accounts_snapshot_id: data.accounts_snapshot_id,
    period_start: data.period_start,
    period_end: data.period_end,
    short_period_factor: data.short_period_factor || 1,
    associated_companies_count: data.associated_companies_count || 0,
    
    accounting_profit: data.accounting_profit,
    total_add_backs: addBacks.reduce((s, a) => s + a.amount, 0),
    add_backs_breakdown: addBacks,
    total_deductions: deductions.reduce((s, d) => s + d.amount, 0),
    deductions_breakdown: deductions,
    
    total_capital_allowances: data.total_capital_allowances,
    balancing_charges: data.balancing_charges,
    net_capital_allowances: data.total_capital_allowances - data.balancing_charges,
    pools_summary: data.pools_summary as any[],
    claims_summary: data.claims_summary as any[],
    
    taxable_total_profits: data.taxable_total_profits,
    
    applicable_rate: data.corporation_tax_rate >= 0.25 ? 'main' : 
                     data.corporation_tax_rate <= 0.19 ? 'small_profits' : 'marginal',
    effective_rate: data.corporation_tax_rate,
    adjusted_lower_limit: data.adjusted_lower_limit || 50000,
    adjusted_upper_limit: data.adjusted_upper_limit || 250000,
    tax_at_main_rate: data.taxable_total_profits * 0.25,
    marginal_relief_fraction: data.marginal_relief_fraction || 0.015,
    marginal_relief_amount: data.marginal_relief_amount || data.marginal_relief || 0,
    corporation_tax_due: data.corporation_tax_due,
    
    snapshot_hash: data.snapshot_hash,
    generator_version: data.generator_version,
    rate_table_id: 'from-snapshot',
  };
}

// Approve CT computation snapshot
export async function approveCTComputationSnapshot(
  snapshotId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('ct_computation_snapshots')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', snapshotId);

  if (error) throw error;
}
