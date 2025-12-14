// VAT Control Reconciliation Service
// Warning-only, never blocking - professional judgement supported
// Classification: INFO (immaterial) or WARNING (material, requires acknowledgement)

import { supabase } from "@/integrations/supabase/client";

export interface VATReconciliationResult {
  id?: string;
  vat_period_id: string;
  model_snapshot_id?: string;
  expected_vat: number;
  actual_vat: number;
  difference: number;
  absolute_difference: number;
  classification: 'INFO' | 'WARNING';
  tolerance_amount: number;
  acknowledged: boolean;
  acknowledged_by_user_id?: string;
  acknowledged_at?: string;
  acknowledgement_note?: string;
  control_account_ids: string[];
  calculation_details: VATReconciliationDetails;
}

export interface VATReconciliationDetails {
  opening_vat_balance: number;
  vat_on_transactions: number;
  vat_journals: number;
  vat_payments: number;
  vat_refunds: number;
  closing_vat_balance: number;
  control_accounts: Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    balance: number;
  }>;
  period_start: string;
  period_end: string;
  calculated_at: string;
}

export interface ReconciliationOptions {
  toleranceAmount?: number;
  saveToDatabase?: boolean;
  snapshotId?: string;
}

/**
 * Calculate VAT control account reconciliation
 * Compares expected VAT (from VAT model Box 5) to actual VAT control account movements
 */
export async function calculateVATReconciliation(
  organizationId: string,
  entityId: string,
  entityType: 'company' | 'client',
  vatPeriodId: string,
  expectedVat: number,
  periodStart: string,
  periodEnd: string,
  options: ReconciliationOptions = {}
): Promise<VATReconciliationResult> {
  const {
    toleranceAmount = 1.00,
    saveToDatabase = true,
    snapshotId,
  } = options;

  // Fetch VAT control accounts for this entity
  const entityFilter = entityType === 'company' 
    ? { company_id: entityId }
    : { client_id: entityId };

  const { data: vatControlAccounts, error: accountsError } = await supabase
    .from('bookkeeping_accounts')
    .select('id, code, name')
    .eq('organization_id', organizationId)
    .match(entityFilter)
    .eq('is_control_account', true)
    .or('name.ilike.%VAT%,code.eq.2100');

  if (accountsError) {
    console.error('Error fetching VAT control accounts:', accountsError);
    throw new Error(`Failed to fetch VAT control accounts: ${accountsError.message}`);
  }

  const controlAccountIds = (vatControlAccounts || []).map(a => a.id);

  // Calculate actual VAT from control account movements
  const details = await calculateActualVAT(
    organizationId,
    entityId,
    entityType,
    controlAccountIds,
    periodStart,
    periodEnd,
    vatControlAccounts || []
  );

  const actualVat = details.closing_vat_balance;
  const difference = actualVat - expectedVat;
  const absoluteDifference = Math.abs(difference);

  // Classification: INFO if within tolerance, WARNING if outside
  const classification: 'INFO' | 'WARNING' = absoluteDifference <= toleranceAmount ? 'INFO' : 'WARNING';

  const result: VATReconciliationResult = {
    vat_period_id: vatPeriodId,
    model_snapshot_id: snapshotId,
    expected_vat: expectedVat,
    actual_vat: actualVat,
    difference,
    absolute_difference: absoluteDifference,
    classification,
    tolerance_amount: toleranceAmount,
    acknowledged: false,
    control_account_ids: controlAccountIds,
    calculation_details: details,
  };

  // Save to database if requested
  if (saveToDatabase) {
    const insertData = {
      organization_id: organizationId,
      company_id: entityType === 'company' ? entityId : null,
      client_id: entityType === 'client' ? entityId : null,
      vat_period_id: vatPeriodId,
      model_snapshot_id: snapshotId || null,
      expected_vat: expectedVat,
      actual_vat: actualVat,
      difference,
      absolute_difference: absoluteDifference,
      classification,
      tolerance_amount: toleranceAmount,
      acknowledged: false,
      control_account_ids: controlAccountIds,
      calculation_details: details as unknown as Record<string, unknown>,
    };
    
    const { data: saved, error: saveError } = await supabase
      .from('vat_reconciliations')
      .upsert(insertData as any, {
        onConflict: 'vat_period_id,model_snapshot_id',
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('Error saving reconciliation:', saveError);
    } else if (saved) {
      result.id = saved.id;
    }

    // Log audit event
    await supabase.from('audit_log').insert({
      organization_id: organizationId,
      entity_type: 'vat_reconciliation',
      entity_id: result.id || vatPeriodId,
      action: 'VAT_RECONCILIATION_CREATED',
      metadata: {
        expected_vat: expectedVat,
        actual_vat: actualVat,
        difference,
        classification,
        vat_period_id: vatPeriodId,
        model_snapshot_id: snapshotId,
      },
    });
  }

  return result;
}

/**
 * Calculate actual VAT from control account movements
 */
async function calculateActualVAT(
  organizationId: string,
  entityId: string,
  entityType: 'company' | 'client',
  controlAccountIds: string[],
  periodStart: string,
  periodEnd: string,
  controlAccounts: Array<{ id: string; code: string; name: string }>
): Promise<VATReconciliationDetails> {
  const entityFilter = entityType === 'company' 
    ? { company_id: entityId }
    : { client_id: entityId };

  // Get opening balance (sum of all entries before period start)
  const { data: openingEntries } = await supabase
    .from('ledger_entries')
    .select('debit, credit, account_id')
    .eq('organization_id', organizationId)
    .match(entityFilter)
    .in('account_id', controlAccountIds)
    .lt('transaction_date', periodStart);

  let openingBalance = 0;
  for (const entry of openingEntries || []) {
    openingBalance += (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
  }

  // Get period movements
  const { data: periodEntries } = await supabase
    .from('ledger_entries')
    .select('debit, credit, account_id, source_type')
    .eq('organization_id', organizationId)
    .match(entityFilter)
    .in('account_id', controlAccountIds)
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd);

  let vatOnTransactions = 0;
  let vatJournals = 0;
  let vatPayments = 0;
  let vatRefunds = 0;

  for (const entry of periodEntries || []) {
    const movement = (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
    
    switch (entry.source_type) {
      case 'JOURNAL':
        vatJournals += movement;
        break;
      case 'PAYMENT':
      case 'BILL_PAYMENT':
        if (movement < 0) {
          vatPayments += Math.abs(movement);
        } else {
          vatRefunds += movement;
        }
        break;
      default:
        vatOnTransactions += movement;
        break;
    }
  }

  // Calculate closing balance
  const closingBalance = openingBalance + vatOnTransactions + vatJournals - vatPayments + vatRefunds;

  // Get per-account balances
  const accountBalances = controlAccounts.map(account => {
    const accountEntries = (periodEntries || []).filter(e => e.account_id === account.id);
    const balance = accountEntries.reduce((sum, e) => 
      sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0
    );
    return {
      account_id: account.id,
      account_code: account.code,
      account_name: account.name,
      balance,
    };
  });

  return {
    opening_vat_balance: openingBalance,
    vat_on_transactions: vatOnTransactions,
    vat_journals: vatJournals,
    vat_payments: vatPayments,
    vat_refunds: vatRefunds,
    closing_vat_balance: closingBalance,
    control_accounts: accountBalances,
    period_start: periodStart,
    period_end: periodEnd,
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Acknowledge a VAT reconciliation warning
 */
export async function acknowledgeReconciliation(
  reconciliationId: string,
  note?: string
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('acknowledge_vat_reconciliation', {
    p_reconciliation_id: reconciliationId,
    p_note: note || null,
  });

  if (error) {
    console.error('Error acknowledging reconciliation:', error);
    throw new Error(`Failed to acknowledge reconciliation: ${error.message}`);
  }

  return data as { success: boolean; message: string };
}

/**
 * Check if VAT filing can proceed (for submission enforcement)
 * Returns true if reconciliation allows filing, or provides error details
 */
export async function checkReconciliationForFiling(
  vatPeriodId: string,
  snapshotId?: string
): Promise<{ canProceed: boolean; errorCode?: string; message: string }> {
  // Fetch reconciliation for this period/snapshot
  let query = supabase
    .from('vat_reconciliations')
    .select('*')
    .eq('vat_period_id', vatPeriodId);

  if (snapshotId) {
    query = query.eq('model_snapshot_id', snapshotId);
  }

  const { data: reconciliation, error } = await query.maybeSingle();

  if (error) {
    console.error('Error fetching reconciliation:', error);
    return {
      canProceed: false,
      errorCode: 'RECONCILIATION_FETCH_ERROR',
      message: `Failed to fetch reconciliation: ${error.message}`,
    };
  }

  // No reconciliation exists - create one first
  if (!reconciliation) {
    return {
      canProceed: false,
      errorCode: 'VAT_RECONCILIATION_MISSING',
      message: 'VAT reconciliation has not been calculated for this period',
    };
  }

  // INFO classification - always proceed
  if (reconciliation.classification === 'INFO') {
    return {
      canProceed: true,
      message: 'Reconciliation within tolerance, no acknowledgement required',
    };
  }

  // WARNING classification - check acknowledgement
  if (reconciliation.classification === 'WARNING') {
    if (reconciliation.acknowledged) {
      return {
        canProceed: true,
        message: 'Reconciliation warning acknowledged, filing can proceed',
      };
    } else {
      return {
        canProceed: false,
        errorCode: 'VAT_RECONCILIATION_NOT_ACKNOWLEDGED',
        message: `VAT control account difference of £${Math.abs(reconciliation.difference).toFixed(2)} requires acknowledgement before filing`,
      };
    }
  }

  return {
    canProceed: true,
    message: 'Reconciliation check passed',
  };
}

/**
 * Fetch existing reconciliation for a VAT period
 */
export async function getReconciliation(
  vatPeriodId: string,
  snapshotId?: string
): Promise<VATReconciliationResult | null> {
  let query = supabase
    .from('vat_reconciliations')
    .select('*')
    .eq('vat_period_id', vatPeriodId);

  if (snapshotId) {
    query = query.eq('model_snapshot_id', snapshotId);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    vat_period_id: data.vat_period_id,
    model_snapshot_id: data.model_snapshot_id,
    expected_vat: Number(data.expected_vat),
    actual_vat: Number(data.actual_vat),
    difference: Number(data.difference),
    absolute_difference: Number(data.absolute_difference),
    classification: data.classification as 'INFO' | 'WARNING',
    tolerance_amount: Number(data.tolerance_amount),
    acknowledged: data.acknowledged,
    acknowledged_by_user_id: data.acknowledged_by_user_id,
    acknowledged_at: data.acknowledged_at,
    acknowledgement_note: data.acknowledgement_note,
    control_account_ids: data.control_account_ids || [],
    calculation_details: (data.calculation_details || {}) as unknown as VATReconciliationDetails,
  };
}
