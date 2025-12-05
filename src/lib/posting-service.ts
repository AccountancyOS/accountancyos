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
  // Validate balance
  const balance = validateBalance(entries);
  if (!balance.valid) {
    return { success: false, error: `Debits (${balance.totalDebit}) must equal credits (${balance.totalCredit})` };
  }

  // Check period lock
  const lockCheck = await isPeriodLocked(
    context.organizationId,
    context.entityType,
    context.entityId,
    context.transactionDate
  );

  if (lockCheck.locked) {
    return { success: false, error: `Period is locked until ${lockCheck.lockDate}. ${lockCheck.reason || ""}` };
  }

  const fxRate = context.fxRate || 1.0;
  const currency = context.currency || "GBP";

  try {
    // Create journal entry first
    const journalPayload = {
      organization_id: context.organizationId,
      client_id: context.entityType === "client" ? context.entityId : null,
      company_id: context.entityType === "company" ? context.entityId : null,
      journal_date: context.transactionDate,
      reference: context.reference || null,
      description: `${context.sourceType} posting`,
      journal_type: "SYSTEM",
      total_debit: calculateBaseCurrencyAmount(balance.totalDebit, fxRate),
      total_credit: calculateBaseCurrencyAmount(balance.totalCredit, fxRate),
      transaction_currency: currency,
      fx_rate_to_base: fxRate,
      is_posted: true,
      created_by: context.userId || null,
    };

    const { data: journal, error: journalError } = await supabase
      .from("journals")
      .insert(journalPayload)
      .select("id")
      .single();

    if (journalError) {
      return { success: false, error: `Failed to create journal: ${journalError.message}` };
    }

    // Create journal lines
    const journalLines = entries
      .filter((e) => e.accountId && (e.debit || e.credit))
      .map((entry, idx) => ({
        journal_id: journal.id,
        line_number: idx + 1,
        account_id: entry.accountId,
        debit: entry.debit ? calculateBaseCurrencyAmount(entry.debit, fxRate) : null,
        credit: entry.credit ? calculateBaseCurrencyAmount(entry.credit, fxRate) : null,
        description: entry.description || null,
      }));

    const { error: linesError } = await supabase
      .from("journal_lines")
      .insert(journalLines);

    if (linesError) {
      // Rollback journal
      await supabase.from("journals").delete().eq("id", journal.id);
      return { success: false, error: `Failed to create journal lines: ${linesError.message}` };
    }

    // Create ledger entries
    const ledgerEntries = entries
      .filter((e) => e.accountId && (e.debit || e.credit))
      .map((entry) => ({
        organization_id: context.organizationId,
        client_id: context.entityType === "client" ? context.entityId : null,
        company_id: context.entityType === "company" ? context.entityId : null,
        entry_date: context.transactionDate,
        transaction_date: context.transactionDate,
        account_id: entry.accountId,
        debit: entry.debit ? calculateBaseCurrencyAmount(entry.debit, fxRate) : null,
        credit: entry.credit ? calculateBaseCurrencyAmount(entry.credit, fxRate) : null,
        description: entry.description || null,
        reference: context.reference || null,
        vat_code_id: entry.vatCodeId || null,
        journal_id: journal.id,
        source_type: context.sourceType,
        source_id: context.sourceId,
        transaction_currency: currency,
        transaction_debit: entry.debit,
        transaction_credit: entry.credit,
        fx_rate_to_base: fxRate,
        base_currency: "GBP",
      }));

    const { data: insertedEntries, error: ledgerError } = await supabase
      .from("ledger_entries")
      .insert(ledgerEntries)
      .select("id");

    if (ledgerError) {
      // Rollback
      await supabase.from("journal_lines").delete().eq("journal_id", journal.id);
      await supabase.from("journals").delete().eq("id", journal.id);
      return { success: false, error: `Failed to create ledger entries: ${ledgerError.message}` };
    }

    return {
      success: true,
      journalId: journal.id,
      ledgerEntryIds: insertedEntries?.map((e) => e.id) || [],
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
  // Fetch original entries - manual fetch to avoid TS2589
  const { data: originalEntries, error: fetchError } = await (supabase
    .from("ledger_entries") as any)
    .select("account_id, debit, credit, description, vat_code_id")
    .eq("journal_id", journalId);

  if (fetchError || !originalEntries?.length) {
    return { success: false, error: "Could not find original entries to reverse" };
  }

  // Create reversed entries (swap debits and credits)
  const reversedEntries: LedgerEntry[] = originalEntries.map((entry) => ({
    accountId: entry.account_id,
    debit: entry.credit, // Swap
    credit: entry.debit, // Swap
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

/**
 * Get control account ID by type
 */
export async function getControlAccount(
  organizationId: string,
  entityType: "client" | "company",
  entityId: string,
  accountType: "TRADE_DEBTORS" | "TRADE_CREDITORS" | "VAT_CONTROL" | "FX_GAIN_LOSS" | "BAD_DEBT"
): Promise<string | null> {
  const namePatterns: Record<string, string[]> = {
    TRADE_DEBTORS: ["Trade Debtors", "Accounts Receivable", "Debtors"],
    TRADE_CREDITORS: ["Trade Creditors", "Accounts Payable", "Creditors"],
    VAT_CONTROL: ["VAT Control", "VAT Payable", "VAT"],
    FX_GAIN_LOSS: ["FX Gain/Loss", "Foreign Exchange", "Exchange Gain"],
    BAD_DEBT: ["Bad Debt", "Bad Debts", "Doubtful Debts"],
  };

  const patterns = namePatterns[accountType] || [];

  let query = supabase
    .from("bookkeeping_accounts")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (entityType === "client") {
    query = query.eq("client_id", entityId);
  } else {
    query = query.eq("company_id", entityId);
  }

  // For control accounts, also check is_control_account flag
  if (["TRADE_DEBTORS", "TRADE_CREDITORS", "VAT_CONTROL"].includes(accountType)) {
    query = query.eq("is_control_account", true);
  }

  const { data: accounts } = await query;

  if (!accounts?.length) return null;

  // Find matching account by name pattern
  for (const pattern of patterns) {
    const match = accounts.find((a: { id: string; name: string }) => 
      a.name.toLowerCase().includes(pattern.toLowerCase())
    );
    if (match) return match.id;
  }

  return null;
}
