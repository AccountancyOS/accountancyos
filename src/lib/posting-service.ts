/**
 * Centralized Posting Service
 * Single source of truth for all ledger postings
 */

import { supabase } from "@/integrations/supabase/client";
import { calculateBaseCurrencyAmount } from "./fx-service";

export interface LedgerEntry {
  accountId: string;
  debit: number | null;
  credit: number | null;
  description?: string;
  vatCodeId?: string | null;
}

export interface PostingContext {
  organizationId: string;
  entityType: "client" | "company";
  entityId: string;
  transactionDate: string;
  reference?: string;
  sourceType: "INVOICE" | "BILL" | "CREDIT_NOTE" | "PAYMENT" | "JOURNAL" | "BANK_TRANSACTION";
  sourceId: string;
  currency?: string;
  fxRate?: number;
  userId?: string;
}

export interface PostingResult {
  success: boolean;
  journalId?: string;
  ledgerEntryIds?: string[];
  error?: string;
}

/**
 * Check if a date falls within a locked period for the entity
 */
export async function isPeriodLocked(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  date: string
): Promise<{ locked: boolean; lockDate?: string; reason?: string }> {
  const query = supabase
    .from("period_locks")
    .select("lock_date, reason")
    .eq("organization_id", organizationId);

  if (entityType === "client") {
    query.eq("client_id", entityId);
  } else {
    query.eq("company_id", entityId);
  }

  const { data } = await query.order("lock_date", { ascending: false }).limit(1).single();

  if (data?.lock_date && new Date(date) <= new Date(data.lock_date)) {
    return { locked: true, lockDate: data.lock_date, reason: data.reason };
  }

  return { locked: false };
}

/**
 * Validate that debits equal credits
 */
export function validateBalance(entries: LedgerEntry[]): { valid: boolean; totalDebit: number; totalCredit: number } {
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0);
  return {
    valid: Math.abs(totalDebit - totalCredit) < 0.01,
    totalDebit,
    totalCredit,
  };
}

/**
 * Post entries to the ledger - the central posting function
 */
export async function postToLedger(
  context: PostingContext,
  entries: LedgerEntry[]
): Promise<PostingResult> {
  // Validate balance client-side first (fast fail)
  const balance = validateBalance(entries);
  if (!balance.valid) {
    return { success: false, error: `Debits (${balance.totalDebit}) must equal credits (${balance.totalCredit})` };
  }

  const fxRate = context.fxRate || 1.0;
  const currency = context.currency || "GBP";

  // Build entries payload for the atomic RPC
  const rpcEntries = entries
    .filter((e) => e.accountId && (e.debit || e.credit))
    .map((entry) => ({
      account_id: entry.accountId,
      debit: entry.debit ? calculateBaseCurrencyAmount(entry.debit, fxRate) : null,
      credit: entry.credit ? calculateBaseCurrencyAmount(entry.credit, fxRate) : null,
      description: entry.description || null,
      vat_code_id: entry.vatCodeId || null,
    }));

  try {
    const { data, error } = await supabase.rpc("post_to_ledger", {
      p_organization_id: context.organizationId,
      p_client_id: context.entityType === "client" ? context.entityId : null,
      p_company_id: context.entityType === "company" ? context.entityId : null,
      p_journal_date: context.transactionDate,
      p_reference: context.reference || null,
      p_description: `${context.sourceType} posting`,
      p_journal_type: "SYSTEM",
      p_source_type: context.sourceType,
      p_source_id: context.sourceId,
      p_currency: currency,
      p_fx_rate: fxRate,
      p_created_by: context.userId || null,
      p_entries: rpcEntries,
    });

    if (error) {
      return { success: false, error: `Posting RPC failed: ${error.message}` };
    }

    const result = data as { success: boolean; journal_id?: string; ledger_entry_ids?: string[]; error?: string };

    if (!result.success) {
      return { success: false, error: result.error || "Posting failed" };
    }

    return {
      success: true,
      journalId: result.journal_id,
      ledgerEntryIds: result.ledger_entry_ids || [],
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Unknown error during posting" };
  }
}

/**
 * Reverse ledger entries for a journal (used for voiding)
 */
export async function reverseLedgerEntries(
  journalId: string,
  context: Omit<PostingContext, "sourceId">,
  reason?: string
): Promise<PostingResult> {
  const { data: originalEntries, error: fetchError } = await (supabase
    .from("ledger_entries") as any)
    .select("account_id, debit, credit, description, vat_code_id")
    .eq("journal_id", journalId);

  if (fetchError || !originalEntries?.length) {
    return { success: false, error: "Could not find original entries to reverse" };
  }

  const reversedEntries: LedgerEntry[] = originalEntries.map((entry: any) => ({
    accountId: entry.account_id,
    debit: entry.credit,
    credit: entry.debit,
    description: `REVERSAL: ${entry.description || ""}${reason ? ` - ${reason}` : ""}`,
    vatCodeId: entry.vat_code_id,
  }));

  return postToLedger(
    {
      ...context,
      sourceId: journalId,
      sourceType: "JOURNAL",
      reference: `REV-${context.reference || journalId.substring(0, 8)}`,
    },
    reversedEntries
  );
}

/**
 * Calculate FX gain/loss on payment
 */
export function calculateFXGainLoss(
  originalAmount: number,
  originalFxRate: number,
  paymentAmount: number,
  paymentFxRate: number
): { gainLoss: number; isGain: boolean } {
  const originalBase = calculateBaseCurrencyAmount(originalAmount, originalFxRate);
  const paymentBase = calculateBaseCurrencyAmount(paymentAmount, paymentFxRate);
  const difference = paymentBase - originalBase;

  return {
    gainLoss: Math.abs(difference),
    isGain: difference > 0,
  };
}

// ==================== CONTROL ACCOUNT SUBTYPES ====================
// Structured account_subtype values for control account resolution.
// NO name-based matching. Deterministic and schema-driven.

const CONTROL_ACCOUNT_SUBTYPE_MAP: Record<string, { subtypes: string[]; requireControl: boolean }> = {
  TRADE_DEBTORS: { subtypes: ["TRADE_DEBTORS", "DEBTOR", "RECEIVABLE", "ACCOUNTS_RECEIVABLE"], requireControl: true },
  TRADE_CREDITORS: { subtypes: ["TRADE_CREDITORS", "CREDITOR", "PAYABLE", "ACCOUNTS_PAYABLE"], requireControl: true },
  VAT_CONTROL: { subtypes: ["VAT_CONTROL", "VAT"], requireControl: true },
  FX_GAIN_LOSS: { subtypes: ["FX_GAIN_LOSS", "FOREIGN_EXCHANGE", "EXCHANGE_GAIN_LOSS"], requireControl: false },
  BAD_DEBT: { subtypes: ["BAD_DEBT", "BAD_DEBTS", "DOUBTFUL_DEBTS"], requireControl: false },
};

/**
 * Get control account ID by structured taxonomy.
 * Uses account_subtype and is_control_account flag — never name matching.
 */
export async function getControlAccount(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  accountType: "TRADE_DEBTORS" | "TRADE_CREDITORS" | "VAT_CONTROL" | "FX_GAIN_LOSS" | "BAD_DEBT"
): Promise<string | null> {
  const mapping = CONTROL_ACCOUNT_SUBTYPE_MAP[accountType];
  if (!mapping) return null;

  let query = supabase
    .from("bookkeeping_accounts")
    .select("id, account_subtype")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (entityType === "client") {
    query = query.eq("client_id", entityId);
  } else {
    query = query.eq("company_id", entityId);
  }

  // Filter by is_control_account if required
  if (mapping.requireControl) {
    query = query.eq("is_control_account", true);
  }

  // Filter by any of the valid subtypes
  query = query.in("account_subtype", mapping.subtypes);

  const { data: accounts } = await query.limit(1);

  if (!accounts?.length) return null;

  return accounts[0].id;
}
