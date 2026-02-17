/**
 * Partnership Engine
 * Handles profit allocation across partners and reference-based linking
 * to individual SA returns. Partner shares are stored in partnership_allocations
 * and referenced by individual filings via partnership_allocation_id FK.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PartnershipDraftScheduleData, PartnerAllocation } from "@/types/filing-schemas";

// ==================== ALLOCATION COMPUTATION ====================

/**
 * Compute partner allocations from partnership return data.
 * Returns updated allocations with computed_profit_share and tax adjustments.
 */
export function computePartnerAllocations(
  data: PartnershipDraftScheduleData
): PartnerAllocation[] {
  const { adjusted_profit, allocations } = data;

  // First pass: compute fixed amounts and remaining pool
  let fixedTotal = 0;
  let percentageTotal = 0;

  for (const alloc of allocations) {
    if (alloc.allocation_method === 'fixed') {
      fixedTotal += alloc.fixed_amount || 0;
    } else if (alloc.allocation_method === 'percentage') {
      percentageTotal += alloc.percentage || 0;
    }
  }

  const remainingAfterFixed = adjusted_profit - fixedTotal;

  return allocations.map((alloc) => {
    let share = 0;

    switch (alloc.allocation_method) {
      case 'fixed':
        share = alloc.fixed_amount || 0;
        break;
      case 'percentage':
        share = percentageTotal > 0
          ? (remainingAfterFixed * (alloc.percentage || 0)) / 100
          : 0;
        break;
      case 'special':
        // Special allocations are manually set
        share = alloc.computed_profit_share || 0;
        break;
    }

    // Compute tax adjustments proportionally
    const proportion = adjusted_profit !== 0 ? share / adjusted_profit : 0;
    const taxAdjustments: Record<string, number> = {
      capital_allowances: Math.round((data.capital_allowances * proportion) * 100) / 100,
      disallowable_expenses: Math.round((data.disallowable_expenses * proportion) * 100) / 100,
    };

    return {
      ...alloc,
      computed_profit_share: Math.round(share * 100) / 100,
      computed_tax_adjustments: taxAdjustments,
    };
  });
}

/**
 * Validate that allocations total matches the adjusted profit.
 * Returns error messages if validation fails.
 */
export function validateAllocations(
  data: PartnershipDraftScheduleData
): string[] {
  const errors: string[] = [];
  const computed = computePartnerAllocations(data);
  const totalAllocated = computed.reduce((sum, a) => sum + a.computed_profit_share, 0);
  const diff = Math.abs(totalAllocated - data.adjusted_profit);

  if (diff > 0.01) {
    errors.push(
      `Total allocated (£${totalAllocated.toFixed(2)}) does not match adjusted profit (£${data.adjusted_profit.toFixed(2)}). Difference: £${diff.toFixed(2)}`
    );
  }

  // Check for duplicate partners
  const partnerIds = computed.filter(a => a.partner_client_id).map(a => a.partner_client_id);
  const uniqueIds = new Set(partnerIds);
  if (uniqueIds.size < partnerIds.length) {
    errors.push('Duplicate partner entries detected');
  }

  // Check percentage total
  const percentageAllocations = data.allocations.filter(a => a.allocation_method === 'percentage');
  const totalPercentage = percentageAllocations.reduce((sum, a) => sum + (a.percentage || 0), 0);
  if (percentageAllocations.length > 0 && Math.abs(totalPercentage - 100) > 0.01) {
    errors.push(`Percentage allocations total ${totalPercentage.toFixed(2)}%, expected 100%`);
  }

  return errors;
}

// ==================== DB OPERATIONS ====================

/**
 * Save partnership allocations to the database.
 * Creates/updates rows in partnership_allocations table.
 */
export async function savePartnershipAllocations(
  organizationId: string,
  partnershipFilingId: string,
  allocations: PartnerAllocation[]
) {
  // Delete existing allocations for this filing
  await supabase
    .from('partnership_allocations')
    .delete()
    .eq('filing_id', partnershipFilingId);

  // Insert new allocations
  const rows = allocations.map((alloc) => ({
    organization_id: organizationId,
    filing_id: partnershipFilingId,
    partner_client_id: alloc.partner_client_id || null,
    partner_name: alloc.partner_name,
    allocation_method: alloc.allocation_method,
    percentage: alloc.percentage || null,
    fixed_amount: alloc.fixed_amount || null,
    special_allocation_json: alloc.allocation_method === 'special' ? alloc.computed_tax_adjustments : {},
    computed_profit_share: alloc.computed_profit_share,
    computed_tax_adjustments: alloc.computed_tax_adjustments,
  }));

  const { data, error } = await supabase
    .from('partnership_allocations')
    .insert(rows)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Get allocations for a partnership filing.
 */
export async function getPartnershipAllocations(partnershipFilingId: string) {
  const { data, error } = await supabase
    .from('partnership_allocations')
    .select('*')
    .eq('filing_id', partnershipFilingId)
    .order('partner_name');

  if (error) throw error;
  return data;
}

/**
 * Get the partner allocation referenced by an individual SA filing.
 * This is the key reference-based lookup — individual filings point to
 * their allocation via partnership_allocation_id FK, not copied values.
 */
export async function getPartnerShareForFiling(filingId: string) {
  // First get the filing's partnership_allocation_id
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('partnership_allocation_id')
    .eq('id', filingId)
    .single();

  if (filingError || !filing?.partnership_allocation_id) return null;

  // Then fetch the allocation — always reads latest values
  const { data: allocation, error: allocError } = await supabase
    .from('partnership_allocations')
    .select(`
      *,
      filing:filings!partnership_allocations_filing_id_fkey(
        id, filing_type, tax_year, period_start, period_end, status,
        draft_schedule_data_json
      )
    `)
    .eq('id', filing.partnership_allocation_id)
    .single();

  if (allocError) throw allocError;
  return allocation;
}

/**
 * Link an individual SA filing to a partnership allocation.
 * Sets the FK pointer — does NOT copy values.
 */
export async function linkFilingToPartnerAllocation(
  filingId: string,
  allocationId: string
) {
  const { error } = await supabase
    .from('filings')
    .update({ partnership_allocation_id: allocationId } as any)
    .eq('id', filingId);

  if (error) throw error;
}

/**
 * Find individual SA filings for a partner client that could be linked
 * to a partnership allocation.
 */
export async function findPartnerSAFilings(
  organizationId: string,
  partnerClientId: string,
  taxYear?: string
) {
  const query = supabase
    .from('filings')
    .select('id, filing_type, tax_year, status, client_id')
    .eq('organization_id', organizationId)
    .eq('client_id', partnerClientId)
    .in('filing_type', ['SA_NON_MTD', 'SA_MTD', 'self_assessment', 'SA100']);

  if (taxYear) {
    query.eq('tax_year', taxYear);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ==================== PARTNERSHIP SCHEDULE COMPUTATION ====================

/**
 * Compute partnership schedule totals (similar to self-employment).
 */
export function computePartnershipTotals(
  data: PartnershipDraftScheduleData
): PartnershipDraftScheduleData {
  const netProfit = data.turnover - data.total_expenses;
  const adjustedProfit = netProfit + data.disallowable_expenses - data.capital_allowances;

  const updatedAllocations = computePartnerAllocations({
    ...data,
    net_profit: netProfit,
    adjusted_profit: adjustedProfit,
  });

  return {
    ...data,
    net_profit: Math.round(netProfit * 100) / 100,
    adjusted_profit: Math.round(adjustedProfit * 100) / 100,
    allocations: updatedAllocations,
  };
}
