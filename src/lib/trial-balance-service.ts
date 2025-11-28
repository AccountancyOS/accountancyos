/**
 * Trial Balance Snapshot Service Functions
 * Handles creation, finalisation, and management of TB snapshots
 */

import { supabase } from "@/integrations/supabase/client";

export interface TBSnapshotBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountSubtype?: string;
  isBankAccount?: boolean;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
  sourceCode?: string;
  sourceName?: string;
}

export interface CreateSnapshotParams {
  organizationId: string;
  clientId?: string | null;
  companyId?: string | null;
  jobId?: string | null;
  periodStart: string;
  periodEnd: string;
  sourceType: "native" | "xero" | "quickbooks" | "sage" | "freeagent" | "manual_import" | "manual";
  balances: TBSnapshotBalance[];
  notes?: string;
  metadata?: Record<string, any>;
  finaliseImmediately?: boolean;
}

export interface SnapshotResult {
  success: boolean;
  snapshotId?: string;
  error?: string;
}

/**
 * Validate TB balances - debits must equal credits
 */
export function validateTBBalances(balances: TBSnapshotBalance[]): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
} {
  const totalDebit = balances.reduce((sum, b) => sum + (b.debit || 0), 0);
  const totalCredit = balances.reduce((sum, b) => sum + (b.credit || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  
  return {
    isValid: difference < 0.01, // Allow tiny floating point differences
    totalDebit,
    totalCredit,
    difference,
  };
}

/**
 * Create a TB snapshot from the native AccountancyOS ledger
 */
export async function createSnapshotFromNativeLedger(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  periodStart: string,
  periodEnd: string,
  jobId?: string | null,
  options: {
    notes?: string;
    finaliseImmediately?: boolean;
  } = {}
): Promise<SnapshotResult> {
  try {
    // Fetch ledger entries and calculate TB
    const query = supabase
      .from("bookkeeping_accounts")
      .select(`
        id, code, name, account_type, account_subtype, is_bank_account,
        ledger_entries!inner(
          debit, credit, transaction_date
        )
      `)
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (entityType === "client") {
      query.eq("client_id", entityId);
    } else {
      query.eq("company_id", entityId);
    }

    const { data: accounts, error: accountsError } = await query;
    if (accountsError) throw accountsError;

    // Calculate balances for each account
    const balances: TBSnapshotBalance[] = (accounts || []).map((account: any) => {
      const entries = account.ledger_entries || [];
      const periodEntries = entries.filter((e: any) => {
        const date = new Date(e.transaction_date);
        return date >= new Date(periodStart) && date <= new Date(periodEnd);
      });

      const periodDebit = periodEntries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0);
      const periodCredit = periodEntries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0);
      
      // For opening balance, calculate from entries before period start
      const openingEntries = entries.filter((e: any) => new Date(e.transaction_date) < new Date(periodStart));
      const openingDebit = openingEntries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0);
      const openingCredit = openingEntries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0);
      const openingBalance = openingDebit - openingCredit;

      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.account_type,
        accountSubtype: account.account_subtype,
        isBankAccount: account.is_bank_account,
        openingBalance,
        debit: periodDebit,
        credit: periodCredit,
        closingBalance: openingBalance + periodDebit - periodCredit,
      };
    });

    return createSnapshot({
      organizationId,
      clientId: entityType === "client" ? entityId : null,
      companyId: entityType === "company" ? entityId : null,
      jobId,
      periodStart,
      periodEnd,
      sourceType: "native",
      balances,
      notes: options.notes,
      metadata: { createdFrom: "native_ledger" },
      finaliseImmediately: options.finaliseImmediately,
    });
  } catch (error) {
    console.error("Error creating snapshot from native ledger:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Create a manual TB snapshot with provided balances
 */
export async function createManualSnapshot(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  periodStart: string,
  periodEnd: string,
  balances: TBSnapshotBalance[],
  options: {
    jobId?: string | null;
    notes?: string;
    finaliseImmediately?: boolean;
    sourceType?: "manual" | "xero" | "quickbooks" | "sage" | "freeagent" | "manual_import";
    metadata?: Record<string, any>;
  } = {}
): Promise<SnapshotResult> {
  return createSnapshot({
    organizationId,
    clientId: entityType === "client" ? entityId : null,
    companyId: entityType === "company" ? entityId : null,
    jobId: options.jobId,
    periodStart,
    periodEnd,
    sourceType: options.sourceType || "manual",
    balances,
    notes: options.notes,
    metadata: options.metadata,
    finaliseImmediately: options.finaliseImmediately,
  });
}

/**
 * Core snapshot creation function
 */
export async function createSnapshot(params: CreateSnapshotParams): Promise<SnapshotResult> {
  try {
    // Validate balances
    const validation = validateTBBalances(params.balances);
    
    const status = params.finaliseImmediately ? "finalised" : "draft";
    const locked = params.finaliseImmediately;

    const { data, error } = await supabase
      .from("trial_balance_snapshots")
      .insert({
        organization_id: params.organizationId,
        client_id: params.clientId,
        company_id: params.companyId,
        job_id: params.jobId,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        source_type: params.sourceType,
        status,
        locked,
        balances: params.balances as any,
        notes: params.notes,
        metadata: params.metadata as any,
        total_debit: validation.totalDebit,
        total_credit: validation.totalCredit,
        is_balanced: validation.isValid,
        finalised_at: params.finaliseImmediately ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, snapshotId: data.id };
  } catch (error) {
    console.error("Error creating snapshot:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Finalise a TB snapshot - sets status to finalised and locks it
 */
export async function finaliseSnapshot(
  snapshotId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("trial_balance_snapshots")
      .update({
        status: "finalised",
        locked: true,
        finalised_at: new Date().toISOString(),
        finalised_by: user?.id,
      })
      .eq("id", snapshotId)
      .eq("locked", false); // Only update if not already locked

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error finalising snapshot:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Reopen a finalised snapshot (admin action)
 */
export async function reopenSnapshot(
  snapshotId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("trial_balance_snapshots")
      .update({
        status: "draft",
        locked: false,
        finalised_at: null,
        finalised_by: null,
      })
      .eq("id", snapshotId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error reopening snapshot:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a snapshot already exists for the given entity and period
 */
export async function findExistingSnapshot(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  periodEnd: string
): Promise<{ exists: boolean; snapshotId?: string; status?: string }> {
  try {
    const query = supabase
      .from("trial_balance_snapshots")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("period_end", periodEnd);

    if (entityType === "client") {
      query.eq("client_id", entityId);
    } else {
      query.eq("company_id", entityId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    return {
      exists: !!data,
      snapshotId: data?.id,
      status: data?.status,
    };
  } catch (error) {
    console.error("Error finding existing snapshot:", error);
    return { exists: false };
  }
}
