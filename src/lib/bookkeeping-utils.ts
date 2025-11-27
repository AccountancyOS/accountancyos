/**
 * Bookkeeping utility functions
 */

export interface TrialBalanceAccount {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  openingBalance: number;
  periodMovementDebit: number;
  periodMovementCredit: number;
  closingBalance: number;
}

export interface LedgerEntry {
  id: string;
  transactionDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number | null;
  credit: number | null;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  vatCodeId: string | null;
  documentId: string | null;
}

/**
 * Calculate trial balance for a given entity and period
 */
export function calculateTrialBalance(
  ledgerEntries: LedgerEntry[],
  periodStart: Date,
  periodEnd: Date
): TrialBalanceAccount[] {
  const accountMap = new Map<string, TrialBalanceAccount>();

  ledgerEntries.forEach((entry) => {
    const entryDate = new Date(entry.transactionDate);
    const isBeforePeriod = entryDate < periodStart;
    const isInPeriod = entryDate >= periodStart && entryDate <= periodEnd;

    if (!accountMap.has(entry.accountId)) {
      accountMap.set(entry.accountId, {
        accountId: entry.accountId,
        code: entry.accountCode,
        name: entry.accountName,
        accountType: "", // Will be set by caller
        openingBalance: 0,
        periodMovementDebit: 0,
        periodMovementCredit: 0,
        closingBalance: 0,
      });
    }

    const account = accountMap.get(entry.accountId)!;

    if (isBeforePeriod) {
      // Accumulate opening balance
      account.openingBalance += (entry.debit || 0) - (entry.credit || 0);
    }

    if (isInPeriod) {
      // Period movements
      account.periodMovementDebit += entry.debit || 0;
      account.periodMovementCredit += entry.credit || 0;
    }
  });

  // Calculate closing balances
  accountMap.forEach((account) => {
    account.closingBalance =
      account.openingBalance +
      account.periodMovementDebit -
      account.periodMovementCredit;
  });

  return Array.from(accountMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

/**
 * Get account type label
 */
export function getAccountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ASSET: "Asset",
    LIABILITY: "Liability",
    EQUITY: "Equity",
    INCOME: "Income",
    EXPENSE: "Expense",
  };
  return labels[type] || type;
}

/**
 * Get journal type label
 */
export function getJournalTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    MANUAL: "Manual",
    REVERSING: "Reversing",
    RECURRING: "Recurring",
    YEAR_END: "Year End",
    OPENING: "Opening",
  };
  return labels[type] || type;
}

/**
 * Validate journal lines balance
 */
export function validateJournalBalance(
  lines: { debit: number | null; credit: number | null }[]
): { isValid: boolean; totalDebit: number; totalCredit: number } {
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

  return {
    isValid: Math.abs(totalDebit - totalCredit) < 0.01, // Allow for rounding
    totalDebit,
    totalCredit,
  };
}
