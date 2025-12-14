import { supabase } from "@/integrations/supabase/client";

// UK Capital Allowances Constants
export const WDA_RATES = {
  MAIN: 0.18,
  SPECIAL_RATE: 0.06,
  SINGLE_ASSET: 0.18,
} as const;

// Full Expensing and FYA rates (from 1 April 2023)
export const FULL_EXPENSING_START_DATE = new Date('2023-04-01');
export const FULL_EXPENSING_RATE = 1.0; // 100%
export const FYA_50_RATE = 0.5; // 50% for special rate assets

// AIA limits by date
export const AIA_LIMITS = [
  { from: new Date('2016-01-01'), to: new Date('2021-01-01'), limit: 200000 },
  { from: new Date('2021-01-01'), to: null, limit: 1000000 },
] as const;

// Car CO2 thresholds (g/km)
export const CAR_CO2_THRESHOLDS = {
  ZERO_EMISSION: 0,           // 100% FYA
  LOW_EMISSION_MAX: 50,       // Main pool (18%)
  // Above 50 g/km = Special rate pool (6%)
} as const;

export type PoolType = 'MAIN' | 'SPECIAL_RATE' | 'SINGLE_ASSET';
export type ClaimType = 'AIA' | 'WDA' | 'FYA_100' | 'FYA_50' | 'FULL_EXPENSING' | 'BALANCING_ALLOWANCE' | 'BALANCING_CHARGE';

export interface FixedAsset {
  id: string;
  asset_name: string;
  asset_category: string;
  acquisition_date: string;
  brought_into_use_date: string | null;
  disposal_date: string | null;
  cost: number;
  disposal_proceeds: number | null;
  default_pool_type: PoolType;
  is_car: boolean;
  car_co2_g_km: number | null;
  car_is_electric: boolean | null;
  business_use_percentage: number;
}

export interface CapitalAllowanceClaim {
  id?: string;
  fixed_asset_id: string | null;
  pool_id: string | null;
  claim_type: ClaimType;
  amount: number;
  rule_basis: {
    reason: string;
    rate?: number;
    eligible_amount?: number;
    restriction?: string;
  };
  is_manual_override: boolean;
  override_reason?: string;
}

export interface PoolComputation {
  pool_type: PoolType;
  pool_name: string | null;
  opening_wdv: number;
  additions: number;
  disposals: number;
  aia_claimed: number;
  fya_claimed: number;
  full_expensing_claimed: number;
  wda_claimed: number;
  closing_wdv: number;
  balancing_charge: number;
  balancing_allowance: number;
  wda_rate: number;
  assets: FixedAsset[];
  claims: CapitalAllowanceClaim[];
}

export interface CapitalAllowancesResult {
  period_start: string;
  period_end: string;
  short_period_factor: number;
  aia_limit: number;
  aia_available: number;
  aia_allocated: number;
  pools: PoolComputation[];
  total_allowances: number;
  total_balancing_charges: number;
  net_allowances: number;
  claims: CapitalAllowanceClaim[];
}

// Calculate short period factor (for pro-rating WDA and AIA)
export function calculateShortPeriodFactor(periodStart: Date, periodEnd: Date): number {
  const days = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(days / 365, 1);
}

// Get AIA limit for a period
export function getAIALimitForPeriod(periodStart: Date, periodEnd: Date): number {
  const factor = calculateShortPeriodFactor(periodStart, periodEnd);
  
  // Find applicable AIA limit
  let baseLimit = 1000000; // Default current limit
  for (const range of AIA_LIMITS) {
    if (periodEnd >= range.from && (!range.to || periodStart < range.to)) {
      baseLimit = range.limit;
      break;
    }
  }
  
  return Math.round(baseLimit * factor);
}

// Determine pool type for a car based on CO2 emissions
export function getCarPoolType(co2GKm: number | null, isElectric: boolean | null): PoolType {
  if (isElectric || co2GKm === 0) {
    return 'MAIN'; // Zero emission cars get 100% FYA, allocated to main pool
  }
  if (co2GKm !== null && co2GKm <= CAR_CO2_THRESHOLDS.LOW_EMISSION_MAX) {
    return 'MAIN';
  }
  return 'SPECIAL_RATE';
}

// Check if asset qualifies for Full Expensing
export function qualifiesForFullExpensing(asset: FixedAsset, periodEnd: Date): boolean {
  if (asset.is_car) return false; // Cars don't qualify
  if (new Date(periodEnd) < FULL_EXPENSING_START_DATE) return false;
  if (new Date(asset.acquisition_date) < FULL_EXPENSING_START_DATE) return false;
  
  // Full expensing is for main pool assets
  const poolType = asset.is_car 
    ? getCarPoolType(asset.car_co2_g_km, asset.car_is_electric)
    : asset.default_pool_type;
    
  return poolType === 'MAIN';
}

// Check if asset qualifies for 50% FYA
export function qualifiesFor50FYA(asset: FixedAsset, periodEnd: Date): boolean {
  if (asset.is_car) return false;
  if (new Date(periodEnd) < FULL_EXPENSING_START_DATE) return false;
  if (new Date(asset.acquisition_date) < FULL_EXPENSING_START_DATE) return false;
  
  const poolType = asset.default_pool_type;
  return poolType === 'SPECIAL_RATE';
}

// Check if car qualifies for 100% FYA (zero emission)
export function qualifiesForZeroEmissionFYA(asset: FixedAsset): boolean {
  if (!asset.is_car) return false;
  return asset.car_is_electric === true || asset.car_co2_g_km === 0;
}

// Get the effective pool type for an asset
export function getEffectivePoolType(asset: FixedAsset): PoolType {
  if (asset.is_car) {
    return getCarPoolType(asset.car_co2_g_km, asset.car_is_electric);
  }
  return asset.default_pool_type;
}

// Fetch assets for a company in a period
export async function fetchAssetsForPeriod(
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<FixedAsset[]> {
  const { data, error } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('company_id', companyId)
    .or(`brought_into_use_date.lte.${periodEnd},brought_into_use_date.is.null`)
    .or(`disposal_date.is.null,disposal_date.gte.${periodStart}`);

  if (error) throw error;
  return (data || []).map(d => ({
    ...d,
    default_pool_type: d.default_pool_type as PoolType,
  }));
}

// Fetch prior period pools (for opening WDV)
export async function fetchPriorPeriodPools(
  companyId: string,
  periodStart: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('capital_allowance_periods')
    .select(`
      id,
      period_end,
      capital_allowance_pools(*)
    `)
    .eq('company_id', companyId)
    .lt('period_end', periodStart)
    .order('period_end', { ascending: false })
    .limit(1);

  if (error) throw error;
  
  const poolWdvMap = new Map<string, number>();
  if (data && data.length > 0) {
    const pools = (data[0] as any).capital_allowance_pools || [];
    for (const pool of pools) {
      const key = pool.pool_name || pool.pool_type;
      poolWdvMap.set(key, pool.closing_wdv);
    }
  }
  
  return poolWdvMap;
}

// Fetch existing AIA allocations for a period
export async function fetchExistingAIAAllocations(
  capPeriodId: string
): Promise<CapitalAllowanceClaim[]> {
  const { data, error } = await supabase
    .from('capital_allowance_claims')
    .select('*')
    .eq('cap_period_id', capPeriodId)
    .eq('claim_type', 'AIA');

  if (error) throw error;
  return (data || []).map(d => ({
    ...d,
    claim_type: d.claim_type as ClaimType,
    rule_basis: d.rule_basis as CapitalAllowanceClaim['rule_basis'],
  }));
}

// Main computation function
export async function computeCapitalAllowances(
  companyId: string,
  organizationId: string,
  periodStart: string,
  periodEnd: string,
  aiaAllocations: Map<string, number>, // asset_id -> AIA amount (explicit allocation required)
  existingCapPeriodId?: string
): Promise<CapitalAllowancesResult> {
  const periodStartDate = new Date(periodStart);
  const periodEndDate = new Date(periodEnd);
  
  // Calculate period factors
  const shortPeriodFactor = calculateShortPeriodFactor(periodStartDate, periodEndDate);
  const aiaLimit = getAIALimitForPeriod(periodStartDate, periodEndDate);
  
  // Fetch assets
  const assets = await fetchAssetsForPeriod(companyId, periodStart, periodEnd);
  
  // Fetch prior period WDVs
  const priorWdvMap = await fetchPriorPeriodPools(companyId, periodStart);
  
  // Group assets by pool
  const poolGroups = new Map<string, FixedAsset[]>();
  
  for (const asset of assets) {
    const poolType = getEffectivePoolType(asset);
    const poolKey = asset.default_pool_type === 'SINGLE_ASSET' ? `SINGLE_ASSET_${asset.id}` : poolType;
    
    if (!poolGroups.has(poolKey)) {
      poolGroups.set(poolKey, []);
    }
    poolGroups.get(poolKey)!.push(asset);
  }
  
  // Compute each pool
  const pools: PoolComputation[] = [];
  const allClaims: CapitalAllowanceClaim[] = [];
  let totalAIAAllocated = 0;
  
  for (const [poolKey, poolAssets] of poolGroups) {
    const isSingleAsset = poolKey.startsWith('SINGLE_ASSET_');
    const poolType: PoolType = isSingleAsset ? 'SINGLE_ASSET' : poolKey as PoolType;
    const poolName = isSingleAsset ? poolKey : null;
    const wdaRate = WDA_RATES[poolType];
    
    // Opening WDV from prior period
    const openingWdv = priorWdvMap.get(poolName || poolType) || 0;
    
    // Calculate additions (assets brought into use in this period)
    let additions = 0;
    let disposals = 0;
    const poolClaims: CapitalAllowanceClaim[] = [];
    
    for (const asset of poolAssets) {
      const biuDate = asset.brought_into_use_date ? new Date(asset.brought_into_use_date) : null;
      const dispDate = asset.disposal_date ? new Date(asset.disposal_date) : null;
      
      // Check if asset was brought into use in this period
      if (biuDate && biuDate >= periodStartDate && biuDate <= periodEndDate) {
        const businessUseCost = asset.cost * (asset.business_use_percentage / 100);
        additions += businessUseCost;
        
        // Check for first-year allowances
        if (qualifiesForZeroEmissionFYA(asset)) {
          // 100% FYA for zero-emission cars
          const fyaAmount = businessUseCost;
          poolClaims.push({
            fixed_asset_id: asset.id,
            pool_id: null,
            claim_type: 'FYA_100',
            amount: fyaAmount,
            rule_basis: {
              reason: 'Zero-emission vehicle 100% FYA',
              rate: 1.0,
              eligible_amount: businessUseCost,
            },
            is_manual_override: false,
          });
        } else if (qualifiesForFullExpensing(asset, periodEndDate)) {
          // Full Expensing for main pool assets
          const feAmount = businessUseCost;
          poolClaims.push({
            fixed_asset_id: asset.id,
            pool_id: null,
            claim_type: 'FULL_EXPENSING',
            amount: feAmount,
            rule_basis: {
              reason: 'Full Expensing (100%) - Main pool asset acquired on/after 1 April 2023',
              rate: 1.0,
              eligible_amount: businessUseCost,
            },
            is_manual_override: false,
          });
        } else if (qualifiesFor50FYA(asset, periodEndDate)) {
          // 50% FYA for special rate assets
          const fyaAmount = businessUseCost * FYA_50_RATE;
          poolClaims.push({
            fixed_asset_id: asset.id,
            pool_id: null,
            claim_type: 'FYA_50',
            amount: fyaAmount,
            rule_basis: {
              reason: '50% FYA - Special rate asset acquired on/after 1 April 2023',
              rate: FYA_50_RATE,
              eligible_amount: businessUseCost,
            },
            is_manual_override: false,
          });
        } else {
          // Check for explicit AIA allocation
          const aiaAllocation = aiaAllocations.get(asset.id) || 0;
          if (aiaAllocation > 0 && totalAIAAllocated + aiaAllocation <= aiaLimit) {
            poolClaims.push({
              fixed_asset_id: asset.id,
              pool_id: null,
              claim_type: 'AIA',
              amount: aiaAllocation,
              rule_basis: {
                reason: 'Annual Investment Allowance - Explicit allocation by accountant',
                eligible_amount: businessUseCost,
              },
              is_manual_override: false,
            });
            totalAIAAllocated += aiaAllocation;
          }
        }
      }
      
      // Check for disposals in this period
      if (dispDate && dispDate >= periodStartDate && dispDate <= periodEndDate) {
        const proceeds = Math.min(asset.disposal_proceeds || 0, asset.cost);
        disposals += proceeds;
      }
    }
    
    // Calculate amounts after first-year reliefs
    const totalFYA = poolClaims
      .filter(c => ['FYA_100', 'FYA_50', 'FULL_EXPENSING'].includes(c.claim_type))
      .reduce((sum, c) => sum + c.amount, 0);
    const totalAIA = poolClaims
      .filter(c => c.claim_type === 'AIA')
      .reduce((sum, c) => sum + c.amount, 0);
    
    // Pool value before WDA
    const poolValueBeforeWDA = openingWdv + additions - disposals - totalFYA - totalAIA;
    
    // Calculate WDA (pro-rated for short periods)
    let wdaClaimed = 0;
    let balancingCharge = 0;
    let balancingAllowance = 0;
    
    if (poolValueBeforeWDA > 0) {
      wdaClaimed = Math.round(poolValueBeforeWDA * wdaRate * shortPeriodFactor * 100) / 100;
      
      poolClaims.push({
        fixed_asset_id: null,
        pool_id: null,
        claim_type: 'WDA',
        amount: wdaClaimed,
        rule_basis: {
          reason: `Writing Down Allowance at ${wdaRate * 100}%`,
          rate: wdaRate,
          eligible_amount: poolValueBeforeWDA,
          restriction: shortPeriodFactor < 1 ? `Pro-rated for ${Math.round(shortPeriodFactor * 365)} day period` : undefined,
        },
        is_manual_override: false,
      });
    } else if (poolValueBeforeWDA < 0) {
      // Balancing charge (disposals exceed pool value)
      balancingCharge = Math.abs(poolValueBeforeWDA);
      
      poolClaims.push({
        fixed_asset_id: null,
        pool_id: null,
        claim_type: 'BALANCING_CHARGE',
        amount: balancingCharge,
        rule_basis: {
          reason: 'Balancing charge - disposal proceeds exceed pool value',
        },
        is_manual_override: false,
      });
    }
    
    // For single asset pools, check for balancing allowance on disposal
    if (isSingleAsset && poolAssets.length === 1) {
      const asset = poolAssets[0];
      if (asset.disposal_date) {
        const dispDate = new Date(asset.disposal_date);
        if (dispDate >= periodStartDate && dispDate <= periodEndDate && poolValueBeforeWDA > 0) {
          balancingAllowance = poolValueBeforeWDA;
          wdaClaimed = 0; // No WDA if claiming balancing allowance
          
          poolClaims.push({
            fixed_asset_id: asset.id,
            pool_id: null,
            claim_type: 'BALANCING_ALLOWANCE',
            amount: balancingAllowance,
            rule_basis: {
              reason: 'Balancing allowance - single asset pool disposal',
            },
            is_manual_override: false,
          });
        }
      }
    }
    
    // Calculate closing WDV
    const closingWdv = Math.max(0, poolValueBeforeWDA - wdaClaimed - balancingAllowance);
    
    pools.push({
      pool_type: poolType,
      pool_name: poolName,
      opening_wdv: openingWdv,
      additions,
      disposals,
      aia_claimed: totalAIA,
      fya_claimed: poolClaims.filter(c => c.claim_type === 'FYA_100').reduce((s, c) => s + c.amount, 0),
      full_expensing_claimed: poolClaims.filter(c => c.claim_type === 'FULL_EXPENSING').reduce((s, c) => s + c.amount, 0),
      wda_claimed: wdaClaimed,
      closing_wdv: closingWdv,
      balancing_charge: balancingCharge,
      balancing_allowance: balancingAllowance,
      wda_rate: wdaRate,
      assets: poolAssets,
      claims: poolClaims,
    });
    
    allClaims.push(...poolClaims);
  }
  
  // Calculate totals
  const totalAllowances = allClaims
    .filter(c => !['BALANCING_CHARGE'].includes(c.claim_type))
    .reduce((sum, c) => sum + c.amount, 0);
  const totalBalancingCharges = allClaims
    .filter(c => c.claim_type === 'BALANCING_CHARGE')
    .reduce((sum, c) => sum + c.amount, 0);
  
  return {
    period_start: periodStart,
    period_end: periodEnd,
    short_period_factor: shortPeriodFactor,
    aia_limit: aiaLimit,
    aia_available: aiaLimit - totalAIAAllocated,
    aia_allocated: totalAIAAllocated,
    pools,
    total_allowances: totalAllowances,
    total_balancing_charges: totalBalancingCharges,
    net_allowances: totalAllowances - totalBalancingCharges,
    claims: allClaims,
  };
}

// Save capital allowances computation to database
export async function saveCapitalAllowancesComputation(
  companyId: string,
  organizationId: string,
  result: CapitalAllowancesResult,
  userId: string
): Promise<{ capPeriodId: string; poolIds: string[] }> {
  // Create or update capital allowance period
  const { data: periodData, error: periodError } = await supabase
    .from('capital_allowance_periods')
    .upsert({
      organization_id: organizationId,
      company_id: companyId,
      period_start: result.period_start,
      period_end: result.period_end,
      short_period_factor: result.short_period_factor,
      aia_limit_for_period: result.aia_limit,
      status: 'calculated',
    }, {
      onConflict: 'company_id,period_start,period_end',
    })
    .select()
    .single();

  if (periodError) throw periodError;
  const capPeriodId = periodData.id;

  // Delete existing pools and claims for this period (recalculation)
  await supabase
    .from('capital_allowance_claims')
    .delete()
    .eq('cap_period_id', capPeriodId);
    
  await supabase
    .from('capital_allowance_pools')
    .delete()
    .eq('cap_period_id', capPeriodId);

  // Insert pools
  const poolIds: string[] = [];
  for (const pool of result.pools) {
    const { data: poolData, error: poolError } = await supabase
      .from('capital_allowance_pools')
      .insert({
        organization_id: organizationId,
        company_id: companyId,
        cap_period_id: capPeriodId,
        pool_type: pool.pool_type,
        pool_name: pool.pool_name,
        opening_wdv: pool.opening_wdv,
        additions: pool.additions,
        disposals: pool.disposals,
        aia_claimed: pool.aia_claimed,
        fya_claimed: pool.fya_claimed,
        full_expensing_claimed: pool.full_expensing_claimed,
        wda_claimed: pool.wda_claimed,
        closing_wdv: pool.closing_wdv,
        balancing_charge: pool.balancing_charge,
        balancing_allowance: pool.balancing_allowance,
        wda_rate: pool.wda_rate,
        metadata: { assets: pool.assets.map(a => a.id) },
      })
      .select()
      .single();

    if (poolError) throw poolError;
    poolIds.push(poolData.id);

    // Insert claims for this pool
    for (const claim of pool.claims) {
      await supabase
        .from('capital_allowance_claims')
        .insert({
          organization_id: organizationId,
          company_id: companyId,
          cap_period_id: capPeriodId,
          pool_id: poolData.id,
          fixed_asset_id: claim.fixed_asset_id,
          claim_type: claim.claim_type,
          amount: claim.amount,
          rule_basis: claim.rule_basis,
          is_manual_override: claim.is_manual_override,
          override_reason: claim.override_reason,
          created_by: userId,
        });
    }
  }

  return { capPeriodId, poolIds };
}
