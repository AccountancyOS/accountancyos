import { supabase } from "@/integrations/supabase/client";
import type {
  FRS105StructuredDisclosures,
  FRS105BalanceSheetDraft,
  FRS105PriorPeriod,
} from "@/types/filing-schemas";

// FRS 105 Balance Sheet structure (micro-entity) — flat numeric for iXBRL model
export interface FRS105BalanceSheet {
  tangible_assets: number;
  debtors: number;
  cash_at_bank: number;
  creditors_within_one_year: number;
  net_current_assets: number;
  total_assets_less_current_liabilities: number;
  creditors_after_one_year: number;
  net_assets: number;
  share_capital: number;
  retained_earnings: number;
  total_equity: number;
}

/** @deprecated Use FRS105StructuredDisclosures from filing-schemas.ts */
export interface FRS105Notes {
  accounting_policies: string[];
  average_employees?: number;
  directors_advances?: number;
  related_party_transactions?: string;
}

export interface FRS105DirectorApproval {
  approved_by_board: boolean;
  approval_date: string;
  signatory_name: string;
  signatory_position: string;
}

export interface FRS105Contexts {
  current_period_instant: string;
  current_period_duration_start: string;
  current_period_duration_end: string;
  prior_period_instant?: string;
  prior_period_duration_start?: string;
  prior_period_duration_end?: string;
}

export interface FRS105UnitsDecimals {
  currency: string;
  decimals: number;
}

export interface FRS105AccountsModel {
  company_id: string;
  company_name: string;
  company_number: string;
  period_start: string;
  period_end: string;
  balance_sheet: FRS105BalanceSheet;
  prior_period_balance_sheet: FRS105BalanceSheet | null;
  disclosures: FRS105StructuredDisclosures;
  /** @deprecated Use disclosures instead */
  notes?: FRS105Notes;
  director_approval: FRS105DirectorApproval;
  contexts: FRS105Contexts;
  units: FRS105UnitsDecimals;
  is_dormant: boolean;
  has_audit_exemption: boolean;
  taxonomy_version: string;
  generator_version: string;
  snapshot_hash: string;
}

export function draftToFlatBalanceSheet(draft: FRS105BalanceSheetDraft): FRS105BalanceSheet {
  return {
    tangible_assets: draft.tangible_assets.amount,
    debtors: draft.debtors.amount,
    cash_at_bank: draft.cash_at_bank.amount,
    creditors_within_one_year: draft.creditors_within_one_year.amount,
    net_current_assets: draft.net_current_assets,
    total_assets_less_current_liabilities: draft.total_assets_less_current_liabilities,
    creditors_after_one_year: draft.creditors_after_one_year.amount,
    net_assets: draft.net_assets,
    share_capital: draft.share_capital.amount,
    retained_earnings: draft.retained_earnings.amount,
    total_equity: draft.total_equity,
  };
}

export function priorPeriodToFlatBalanceSheet(pp: FRS105PriorPeriod): FRS105BalanceSheet {
  return {
    tangible_assets: pp.tangible_assets.amount,
    debtors: pp.debtors.amount,
    cash_at_bank: pp.cash_at_bank.amount,
    creditors_within_one_year: pp.creditors_within_one_year.amount,
    net_current_assets: pp.net_current_assets,
    total_assets_less_current_liabilities: pp.total_assets_less_current_liabilities,
    creditors_after_one_year: pp.creditors_after_one_year.amount,
    net_assets: pp.net_assets,
    share_capital: pp.share_capital.amount,
    retained_earnings: pp.retained_earnings.amount,
    total_equity: pp.total_equity,
  };
}

// ==================== TAXONOMY-BASED FRS105 MAPPINGS ====================
// Maps FRS105 balance sheet sections to structured account_type + account_subtype.
// NO hardcoded account codes. Any CoA works without renumbering.

export interface FRS105AccountMapping {
  accountType: string;
  subtypes?: string[];
  isBankAccount?: boolean;
  excludeBankAccounts?: boolean;
}

export const FRS105_TAXONOMY_MAPPINGS: Record<keyof FRS105BalanceSheet, FRS105AccountMapping | null> = {
  // Fixed Assets
  tangible_assets: { accountType: "ASSET", subtypes: ["FIXED_ASSET", "TANGIBLE", "FIXED"] },

  // Current Assets
  debtors: { accountType: "ASSET", subtypes: ["CURRENT_ASSET", "DEBTOR", "RECEIVABLE", "TRADE_DEBTORS", "PREPAYMENT"], excludeBankAccounts: true },
  cash_at_bank: { accountType: "ASSET", isBankAccount: true },

  // Current Liabilities
  creditors_within_one_year: { accountType: "LIABILITY", subtypes: ["CURRENT_LIABILITY", "CREDITOR", "PAYABLE", "TRADE_CREDITORS", "ACCRUAL", "VAT_CONTROL"] },

  // Long-term Liabilities
  creditors_after_one_year: { accountType: "LIABILITY", subtypes: ["LONG_TERM_LIABILITY", "LONG_TERM"] },

  // Equity
  share_capital: { accountType: "EQUITY", subtypes: ["SHARE_CAPITAL"] },
  retained_earnings: { accountType: "EQUITY", subtypes: ["RETAINED_EARNINGS", "PROFIT_AND_LOSS"] },

  // Calculated fields — no direct account mapping
  net_current_assets: null,
  total_assets_less_current_liabilities: null,
  net_assets: null,
  total_equity: null,
};

// ==================== LEGACY EXPORT (for filing-version-service hash) ====================
// Kept for backward-compatible hash computation in filing-version-service.ts
/** @deprecated Use FRS105_TAXONOMY_MAPPINGS instead */
export const FRS105_ACCOUNT_MAPPINGS = FRS105_TAXONOMY_MAPPINGS;

// Generate SHA256 hash
async function generateHash(data: object): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(JSON.stringify(data));
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== TAXONOMY-BASED TB → FRS105 MAPPING ====================

/**
 * Map trial balance to FRS 105 balance sheet using account_type and account_subtype.
 * No hardcoded account codes — works with any Chart of Accounts.
 */
export function mapTrialBalanceToFRS105(
  trialBalance: Record<string, { debit: number; credit: number }>,
  accounts: Array<{ code: string; name: string; account_type: string; account_subtype?: string; is_bank_account?: boolean }>
): FRS105BalanceSheet {
  // Compute natural balance for each account
  const accountBalances = accounts.map(a => {
    const tb = trialBalance[a.code];
    if (!tb) return { ...a, balance: 0 };
    // Assets/Expenses: debit-normal. Liabilities/Equity/Income: credit-normal.
    const isDebitNormal = !["LIABILITY", "EQUITY", "INCOME"].includes(a.account_type);
    const balance = isDebitNormal ? tb.debit - tb.credit : tb.credit - tb.debit;
    return { ...a, balance: Math.round(balance * 100) / 100 };
  });

  const sumByMapping = (mapping: FRS105AccountMapping | null): number => {
    if (!mapping) return 0;
    return accountBalances.reduce((total, a) => {
      if (a.account_type !== mapping.accountType) return total;

      // Bank account filter
      if (mapping.isBankAccount && !a.is_bank_account) return total;
      if (mapping.excludeBankAccounts && a.is_bank_account) return total;

      // Subtype filter
      if (mapping.subtypes && !mapping.isBankAccount) {
        const subtype = (a.account_subtype || '').toUpperCase();
        if (!mapping.subtypes.includes(subtype)) return total;
      }

      return total + a.balance;
    }, 0);
  };

  const tangible_assets = sumByMapping(FRS105_TAXONOMY_MAPPINGS.tangible_assets);
  const debtors = sumByMapping(FRS105_TAXONOMY_MAPPINGS.debtors);
  const cash_at_bank = sumByMapping(FRS105_TAXONOMY_MAPPINGS.cash_at_bank);
  const creditors_within_one_year = sumByMapping(FRS105_TAXONOMY_MAPPINGS.creditors_within_one_year);
  const creditors_after_one_year = sumByMapping(FRS105_TAXONOMY_MAPPINGS.creditors_after_one_year);
  const share_capital = sumByMapping(FRS105_TAXONOMY_MAPPINGS.share_capital);
  const retained_earnings = sumByMapping(FRS105_TAXONOMY_MAPPINGS.retained_earnings);

  const net_current_assets = debtors + cash_at_bank - creditors_within_one_year;
  const total_assets_less_current_liabilities = tangible_assets + net_current_assets;
  const net_assets = total_assets_less_current_liabilities - creditors_after_one_year;
  const total_equity = share_capital + retained_earnings;

  return {
    tangible_assets,
    debtors,
    cash_at_bank,
    creditors_within_one_year,
    net_current_assets,
    total_assets_less_current_liabilities,
    creditors_after_one_year,
    net_assets,
    share_capital,
    retained_earnings,
    total_equity,
  };
}

// Create FRS 105 accounts model from workpaper data
export async function createFRS105AccountsModel(
  companyId: string,
  workpaperData: Record<string, any>,
  trialBalance: Record<string, { debit: number; credit: number }>,
  accounts: Array<{ code: string; name: string; account_type: string; account_subtype?: string; is_bank_account?: boolean }>
): Promise<FRS105AccountsModel> {
  const { data: company, error } = await supabase
    .from('companies')
    .select('company_name, company_number, year_end_month, year_end_day')
    .eq('id', companyId)
    .single();

  if (error) throw error;

  const balance_sheet = mapTrialBalanceToFRS105(trialBalance, accounts);

  const notes: FRS105Notes = {
    accounting_policies: [
      'These accounts have been prepared in accordance with the provisions of FRS 105.',
      'The company has taken advantage of the exemptions available under FRS 105 for micro-entities.',
    ],
    average_employees: workpaperData.average_employees,
    directors_advances: workpaperData.directors_advances,
    related_party_transactions: workpaperData.related_party_transactions,
  };

  const { createDefaultDisclosures } = await import("@/lib/frs105-disclosure-engine");
  const disclosures = createDefaultDisclosures();

  const director_approval: FRS105DirectorApproval = {
    approved_by_board: workpaperData.approved_by_board || false,
    approval_date: workpaperData.approval_date || new Date().toISOString().split('T')[0],
    signatory_name: workpaperData.signatory_name || '',
    signatory_position: workpaperData.signatory_position || 'Director',
  };

  const periodEnd = workpaperData.period_end;
  const periodStart = workpaperData.period_start;

  const model: Omit<FRS105AccountsModel, 'snapshot_hash'> = {
    company_id: companyId,
    company_name: company.company_name,
    company_number: company.company_number,
    period_start: periodStart,
    period_end: periodEnd,
    balance_sheet,
    prior_period_balance_sheet: null,
    disclosures,
    notes,
    director_approval,
    contexts: {
      current_period_instant: periodEnd,
      current_period_duration_start: periodStart,
      current_period_duration_end: periodEnd,
    },
    units: { currency: 'GBP', decimals: 0 },
    is_dormant: workpaperData.is_dormant || false,
    has_audit_exemption: true,
    taxonomy_version: 'FRS105-2022',
    generator_version: '3.0.0', // Bumped for taxonomy-based mappings
  };

  const snapshot_hash = await generateHash(model);

  return { ...model, snapshot_hash };
}

// Save FRS 105 accounts model snapshot
export async function saveFRS105AccountsSnapshot(
  model: FRS105AccountsModel,
  organizationId: string,
  workpaperInstanceId?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('accounts_model_snapshots')
    .insert({
      organization_id: organizationId,
      company_id: model.company_id,
      workpaper_instance_id: workpaperInstanceId,
      period_start: model.period_start,
      period_end: model.period_end,
      balance_sheet: model.balance_sheet as unknown as Record<string, unknown>,
      notes: model.notes as unknown as Record<string, unknown>,
      director_approval: model.director_approval as unknown as Record<string, unknown>,
      snapshot_hash: model.snapshot_hash,
      taxonomy_version: model.taxonomy_version,
      generator_version: model.generator_version,
      status: 'draft',
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

// Get accounts model snapshot
export async function getAccountsModelSnapshot(
  snapshotId: string
): Promise<FRS105AccountsModel | null> {
  const { data, error } = await supabase
    .from('accounts_model_snapshots')
    .select(`
      *,
      companies(company_name, company_number)
    `)
    .eq('id', snapshotId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const { createDefaultDisclosures } = await import("@/lib/frs105-disclosure-engine");

  return {
    company_id: data.company_id,
    company_name: (data.companies as any)?.company_name || '',
    company_number: (data.companies as any)?.company_number || '',
    period_start: data.period_start,
    period_end: data.period_end,
    balance_sheet: data.balance_sheet as unknown as FRS105BalanceSheet,
    prior_period_balance_sheet: null,
    disclosures: createDefaultDisclosures(),
    notes: data.notes as unknown as FRS105Notes,
    director_approval: data.director_approval as unknown as FRS105DirectorApproval,
    contexts: {
      current_period_instant: data.period_end,
      current_period_duration_start: data.period_start,
      current_period_duration_end: data.period_end,
    },
    units: { currency: 'GBP', decimals: 0 },
    is_dormant: false,
    has_audit_exemption: true,
    taxonomy_version: data.taxonomy_version,
    generator_version: data.generator_version,
    snapshot_hash: data.snapshot_hash,
  };
}

// Approve accounts model snapshot
export async function approveAccountsModelSnapshot(
  snapshotId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('accounts_model_snapshots')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', snapshotId);

  if (error) throw error;
}

// Validate FRS 105 balance sheet
export function validateFRS105BalanceSheet(
  balanceSheet: FRS105BalanceSheet
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tolerance = 0.01;
  if (Math.abs(balanceSheet.net_assets - balanceSheet.total_equity) > tolerance) {
    errors.push(
      `Balance sheet does not balance: Net assets (${balanceSheet.net_assets.toFixed(2)}) ≠ Total equity (${balanceSheet.total_equity.toFixed(2)})`
    );
  }

  if (balanceSheet.net_assets < 0) {
    warnings.push('Net assets are negative - company may have net liabilities');
  }

  if (balanceSheet.cash_at_bank < 0) {
    warnings.push('Cash at bank is negative - check for overdraft treatment');
  }

  return { valid: errors.length === 0, errors, warnings };
}
