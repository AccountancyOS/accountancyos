// Accounts Model Mapper - Maps workpaper instances to structured AccountsModel for iXBRL generation

export type AccountsStandard = 'FRS105' | 'FRS102_1A';

export interface AccountsModel {
  // Company Information
  company: {
    name: string;
    number: string;
    registeredOffice: {
      line1: string;
      line2?: string;
      city: string;
      postcode: string;
      country: string;
    };
  };
  
  // Period Information
  period: {
    start: string;
    end: string;
    previousStart?: string;
    previousEnd?: string;
  };
  
  // Filing Standard
  standard: AccountsStandard;
  
  // Balance Sheet
  balanceSheet: {
    // Fixed Assets
    tangibleAssets?: number;
    intangibleAssets?: number;
    investments?: number;
    totalFixedAssets: number;
    
    // Current Assets
    stocks?: number;
    debtors?: number;
    cashAtBank: number;
    totalCurrentAssets: number;
    
    // Creditors
    creditorsWithinOneYear?: number;
    creditorsAfterOneYear?: number;
    
    // Net Assets
    netCurrentAssets: number;
    totalAssetsLessCurrentLiabilities: number;
    netAssets: number;
    
    // Capital & Reserves
    calledUpShareCapital: number;
    sharePremiuim?: number;
    profitAndLossReserve: number;
    totalEquity: number;
    
    // Prior Year Comparatives
    priorYear?: {
      totalFixedAssets?: number;
      totalCurrentAssets?: number;
      netCurrentAssets?: number;
      netAssets?: number;
      totalEquity?: number;
    };
  };
  
  // Profit & Loss (FRS 102 1A only)
  profitAndLoss?: {
    turnover: number;
    costOfSales?: number;
    grossProfit: number;
    administrativeExpenses?: number;
    otherOperatingIncome?: number;
    operatingProfit: number;
    interestReceivable?: number;
    interestPayable?: number;
    profitBeforeTax: number;
    taxation?: number;
    profitAfterTax: number;
    
    priorYear?: {
      turnover?: number;
      grossProfit?: number;
      operatingProfit?: number;
      profitBeforeTax?: number;
      profitAfterTax?: number;
    };
  };
  
  // Notes to Accounts
  notes: {
    accountingPolicies: {
      basisOfPreparation: string;
      goingConcern: boolean;
      turnoverPolicy?: string;
      depreciationPolicy?: string;
      stockValuationPolicy?: string;
    };
    
    averageEmployees?: number;
    
    directorsAdvances?: {
      exists: boolean;
      amount?: number;
      details?: string;
    };
    
    directorsRemuneration?: {
      fees?: number;
      emoluments?: number;
      pensionContributions?: number;
    };
    
    relatedPartyTransactions?: {
      exists: boolean;
      details?: string;
    };
    
    contingentLiabilities?: {
      exists: boolean;
      details?: string;
    };
    
    guarantees?: {
      exists: boolean;
      details?: string;
    };
    
    commitments?: {
      exists: boolean;
      details?: string;
    };
    
    // FRS 102 1A additional notes
    fixedAssetsMovement?: {
      costBroughtForward: number;
      additions: number;
      disposals: number;
      costCarriedForward: number;
      depreciationBroughtForward: number;
      depreciationCharge: number;
      depreciationOnDisposals: number;
      depreciationCarriedForward: number;
      netBookValue: number;
      priorYearNetBookValue: number;
    };
    
    debtorsAnalysis?: {
      tradeDebtors?: number;
      prepayments?: number;
      otherDebtors?: number;
      total: number;
    };
    
    creditorsAnalysis?: {
      tradeCreditors?: number;
      accruals?: number;
      taxationAndSocialSecurity?: number;
      otherCreditors?: number;
      total: number;
    };
    
    auditExemption?: {
      claimed: boolean;
      statement?: string;
    };
  };
  
  // Directors Report (FRS 102 1A only)
  directorsReport?: {
    principalActivities: string;
    reviewOfBusiness?: string;
    dividends?: string;
    directors: Array<{
      name: string;
      appointedDate?: string;
      resignedDate?: string;
    }>;
    smallCompanyExemption: boolean;
    approvedByBoard: boolean;
    approvalDate?: string;
    signatory?: string;
  };
  
  // Approval
  approval: {
    approvedByBoard: boolean;
    approvalDate?: string;
    signatory?: string;
    signatoryRole?: string;
  };
}

export interface WorkpaperInstance {
  id: string;
  service_type: string;
  field_values: Record<string, any>;
  field_overrides?: Record<string, any>;
  status: string;
}

export interface CompanyData {
  company_name: string;
  company_number: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export interface MappingResult {
  success: boolean;
  model?: AccountsModel;
  errors: string[];
  warnings: string[];
}

/**
 * Maps a workpaper instance to an AccountsModel for iXBRL generation
 */
export function mapWorkpaperToAccountsModel(
  workpaper: WorkpaperInstance,
  company: CompanyData,
  periodStart: string,
  periodEnd: string,
  standard: AccountsStandard = 'FRS105'
): MappingResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fields = workpaper.field_values || {};
  
  // Helper to get field value with override precedence
  const getField = (key: string, defaultValue: any = null) => {
    if (workpaper.field_overrides?.[key] !== undefined) {
      return workpaper.field_overrides[key];
    }
    return fields[key] ?? defaultValue;
  };
  
  // Helper to get numeric field
  const getNumber = (key: string, defaultValue = 0): number => {
    const val = getField(key, defaultValue);
    return typeof val === 'number' ? val : parseFloat(val) || defaultValue;
  };
  
  // Helper to get string field
  const getString = (key: string, defaultValue = ''): string => {
    const val = getField(key, defaultValue);
    return typeof val === 'string' ? val : String(val || defaultValue);
  };
  
  // Helper to get boolean field
  const getBool = (key: string, defaultValue = false): boolean => {
    const val = getField(key, defaultValue);
    return val === true || val === 'true' || val === 'yes';
  };

  // Validate required company data
  if (!company.company_number) {
    errors.push('Company number is required');
  }
  if (!company.company_name) {
    errors.push('Company name is required');
  }

  // Build balance sheet figures
  const tangibleAssets = getNumber('tangible_assets') || getNumber('fixed_assets');
  const intangibleAssets = getNumber('intangible_assets');
  const investments = getNumber('investments');
  const totalFixedAssets = tangibleAssets + intangibleAssets + investments;
  
  const stocks = getNumber('stock') || getNumber('inventory');
  const debtors = getNumber('debtors') || getNumber('trade_debtors') + getNumber('other_debtors') + getNumber('prepayments');
  const cashAtBank = getNumber('cash_at_bank') || getNumber('bank');
  const totalCurrentAssets = stocks + debtors + cashAtBank;
  
  const creditorsWithinOneYear = getNumber('creditors_within_one_year') || 
    getNumber('trade_creditors') + getNumber('accruals') + getNumber('taxation_creditor') + getNumber('other_creditors');
  const creditorsAfterOneYear = getNumber('creditors_after_one_year') || getNumber('long_term_loans');
  
  const netCurrentAssets = totalCurrentAssets - creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = totalFixedAssets + netCurrentAssets;
  const netAssets = totalAssetsLessCurrentLiabilities - creditorsAfterOneYear;
  
  const calledUpShareCapital = getNumber('share_capital') || getNumber('called_up_share_capital');
  const sharePremiuim = getNumber('share_premium');
  const profitAndLossReserve = getNumber('retained_earnings') || getNumber('profit_loss_reserve');
  const totalEquity = calledUpShareCapital + sharePremiuim + profitAndLossReserve;
  
  // Validate balance sheet balances
  if (Math.abs(netAssets - totalEquity) > 0.01) {
    warnings.push(`Balance sheet does not balance: Net Assets (${netAssets}) != Total Equity (${totalEquity})`);
  }

  // Build the model
  const model: AccountsModel = {
    company: {
      name: company.company_name,
      number: company.company_number,
      registeredOffice: {
        line1: company.address_line_1 || '',
        line2: company.address_line_2,
        city: company.city || '',
        postcode: company.postcode || '',
        country: company.country || 'United Kingdom',
      },
    },
    period: {
      start: periodStart,
      end: periodEnd,
    },
    standard,
    balanceSheet: {
      tangibleAssets: tangibleAssets || undefined,
      intangibleAssets: intangibleAssets || undefined,
      investments: investments || undefined,
      totalFixedAssets,
      stocks: stocks || undefined,
      debtors: debtors || undefined,
      cashAtBank,
      totalCurrentAssets,
      creditorsWithinOneYear: creditorsWithinOneYear || undefined,
      creditorsAfterOneYear: creditorsAfterOneYear || undefined,
      netCurrentAssets,
      totalAssetsLessCurrentLiabilities,
      netAssets,
      calledUpShareCapital,
      sharePremiuim: sharePremiuim || undefined,
      profitAndLossReserve,
      totalEquity,
    },
    notes: {
      accountingPolicies: {
        basisOfPreparation: standard === 'FRS105' 
          ? 'These accounts have been prepared in accordance with FRS 105 "The Financial Reporting Standard applicable to the Micro-entities Regime".'
          : 'These accounts have been prepared in accordance with FRS 102 "The Financial Reporting Standard applicable in the UK and Republic of Ireland" Section 1A Small Entities.',
        goingConcern: getBool('going_concern', true),
        turnoverPolicy: getString('turnover_policy'),
        depreciationPolicy: getString('depreciation_policy'),
        stockValuationPolicy: getString('stock_valuation_policy'),
      },
      averageEmployees: getNumber('average_employees') || undefined,
      directorsAdvances: {
        exists: getBool('directors_advances_exist') || getNumber('directors_loan_account') !== 0,
        amount: getNumber('directors_loan_account') || undefined,
        details: getString('directors_advances_details'),
      },
      relatedPartyTransactions: {
        exists: getBool('related_party_transactions_exist'),
        details: getString('related_party_details'),
      },
      contingentLiabilities: {
        exists: getBool('contingent_liabilities_exist'),
        details: getString('contingent_liabilities_details'),
      },
      guarantees: {
        exists: getBool('guarantees_exist'),
        details: getString('guarantees_details'),
      },
    },
    approval: {
      approvedByBoard: getBool('approved_by_board'),
      approvalDate: getString('approval_date') || undefined,
      signatory: getString('signatory_name') || undefined,
      signatoryRole: getString('signatory_role') || 'Director',
    },
  };

  // Add P&L for FRS 102 1A
  if (standard === 'FRS102_1A') {
    const turnover = getNumber('turnover') || getNumber('revenue') || getNumber('sales');
    const costOfSales = getNumber('cost_of_sales');
    const grossProfit = turnover - costOfSales;
    const administrativeExpenses = getNumber('administrative_expenses') || getNumber('admin_expenses');
    const otherOperatingIncome = getNumber('other_operating_income');
    const operatingProfit = grossProfit - administrativeExpenses + otherOperatingIncome;
    const interestReceivable = getNumber('interest_receivable');
    const interestPayable = getNumber('interest_payable');
    const profitBeforeTax = operatingProfit + interestReceivable - interestPayable;
    const taxation = getNumber('corporation_tax') || getNumber('tax_charge');
    const profitAfterTax = profitBeforeTax - taxation;

    model.profitAndLoss = {
      turnover,
      costOfSales: costOfSales || undefined,
      grossProfit,
      administrativeExpenses: administrativeExpenses || undefined,
      otherOperatingIncome: otherOperatingIncome || undefined,
      operatingProfit,
      interestReceivable: interestReceivable || undefined,
      interestPayable: interestPayable || undefined,
      profitBeforeTax,
      taxation: taxation || undefined,
      profitAfterTax,
    };

    // Add directors report
    model.directorsReport = {
      principalActivities: getString('principal_activities', 'The principal activity of the company is that of a trading company.'),
      reviewOfBusiness: getString('review_of_business'),
      dividends: getString('dividends_statement'),
      directors: [], // Would be populated from company officers
      smallCompanyExemption: true,
      approvedByBoard: getBool('directors_report_approved'),
      approvalDate: getString('directors_report_date'),
      signatory: getString('directors_report_signatory'),
    };

    // Additional notes for FRS 102 1A
    model.notes.auditExemption = {
      claimed: getBool('audit_exemption_claimed', true),
      statement: 'The members have not required the company to obtain an audit of its financial statements for the year in accordance with section 476 of the Companies Act 2006.',
    };

    model.notes.debtorsAnalysis = {
      tradeDebtors: getNumber('trade_debtors'),
      prepayments: getNumber('prepayments'),
      otherDebtors: getNumber('other_debtors'),
      total: debtors,
    };

    model.notes.creditorsAnalysis = {
      tradeCreditors: getNumber('trade_creditors'),
      accruals: getNumber('accruals'),
      taxationAndSocialSecurity: getNumber('taxation_creditor'),
      otherCreditors: getNumber('other_creditors'),
      total: creditorsWithinOneYear,
    };
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  return { success: true, model, errors: [], warnings };
}

/**
 * Validates an AccountsModel before iXBRL generation
 */
export function validateAccountsModel(model: AccountsModel): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Company validation
  if (!model.company.number) errors.push('Company number is required');
  if (!model.company.name) errors.push('Company name is required');
  
  // Period validation
  if (!model.period.start) errors.push('Period start date is required');
  if (!model.period.end) errors.push('Period end date is required');
  
  // Balance sheet validation
  const bs = model.balanceSheet;
  if (Math.abs(bs.netAssets - bs.totalEquity) > 0.01) {
    errors.push('Balance sheet does not balance');
  }
  
  // Check totals
  const expectedTotalFixedAssets = (bs.tangibleAssets || 0) + (bs.intangibleAssets || 0) + (bs.investments || 0);
  if (Math.abs(bs.totalFixedAssets - expectedTotalFixedAssets) > 0.01) {
    errors.push('Total fixed assets does not match component sum');
  }
  
  const expectedTotalCurrentAssets = (bs.stocks || 0) + (bs.debtors || 0) + bs.cashAtBank;
  if (Math.abs(bs.totalCurrentAssets - expectedTotalCurrentAssets) > 0.01) {
    errors.push('Total current assets does not match component sum');
  }

  // P&L validation for FRS 102 1A
  if (model.standard === 'FRS102_1A' && model.profitAndLoss) {
    const pl = model.profitAndLoss;
    const expectedGrossProfit = pl.turnover - (pl.costOfSales || 0);
    if (Math.abs(pl.grossProfit - expectedGrossProfit) > 0.01) {
      errors.push('Gross profit calculation mismatch');
    }
  }

  // Notes validation
  if (!model.notes.accountingPolicies.basisOfPreparation) {
    errors.push('Basis of preparation statement is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extracts key filing metrics from an AccountsModel
 */
export function getAccountsFilingMetrics(model: AccountsModel): {
  turnover?: number;
  grossAssets: number;
  netAssets: number;
  averageEmployees?: number;
  profitBeforeTax?: number;
} {
  return {
    turnover: model.profitAndLoss?.turnover,
    grossAssets: model.balanceSheet.totalFixedAssets + model.balanceSheet.totalCurrentAssets,
    netAssets: model.balanceSheet.netAssets,
    averageEmployees: model.notes.averageEmployees,
    profitBeforeTax: model.profitAndLoss?.profitBeforeTax,
  };
}

// ==================== TB + STRUCTURED COA MAPPING ====================

export interface TBAccountLine {
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype?: string;
  debit: number;
  credit: number;
  // Structured tax mapping columns
  tax_allowability?: string;
  ct_addback_category?: string | null;
  vat_treatment?: string;
}

/**
 * Builds an AccountsModel from trial balance lines with structured COA tax mapping.
 * This replaces the workpaper-based mapping for TB-centric filing workflows.
 */
export function mapTBToAccountsModel(
  tbLines: TBAccountLine[],
  company: CompanyData,
  periodStart: string,
  periodEnd: string,
  standard: AccountsStandard = 'FRS105'
): MappingResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!company.company_number) errors.push('Company number is required');
  if (!company.company_name) errors.push('Company name is required');

  // Helper: sum balances for accounts matching a predicate
  const sumBy = (pred: (l: TBAccountLine) => boolean): number =>
    tbLines.filter(pred).reduce((s, l) => s + (l.debit - l.credit), 0);

  // Balance sheet from TB
  const tangibleAssets = sumBy(l => l.account_type === 'ASSET' && (l.account_subtype === 'FIXED' || l.account_subtype === 'TANGIBLE'));
  const intangibleAssets = sumBy(l => l.account_type === 'ASSET' && l.account_subtype === 'INTANGIBLE');
  const investments = sumBy(l => l.account_type === 'ASSET' && l.account_subtype === 'INVESTMENT');
  const totalFixedAssets = tangibleAssets + intangibleAssets + investments;

  const stocks = sumBy(l => l.account_type === 'ASSET' && l.account_subtype === 'STOCK');
  const debtors = sumBy(l => l.account_type === 'ASSET' && (l.account_subtype === 'DEBTOR' || l.account_subtype === 'RECEIVABLE'));
  const cashAtBank = sumBy(l => l.account_type === 'ASSET' && (l.account_subtype === 'BANK' || l.account_subtype === 'CASH'));
  const currentAssetOther = sumBy(l => l.account_type === 'ASSET' && !['FIXED', 'TANGIBLE', 'INTANGIBLE', 'INVESTMENT', 'STOCK', 'DEBTOR', 'RECEIVABLE', 'BANK', 'CASH'].includes(l.account_subtype || ''));
  const totalCurrentAssets = stocks + debtors + cashAtBank + currentAssetOther;

  const creditorsWithinOneYear = Math.abs(sumBy(l => l.account_type === 'LIABILITY' && l.account_subtype !== 'LONG_TERM'));
  const creditorsAfterOneYear = Math.abs(sumBy(l => l.account_type === 'LIABILITY' && l.account_subtype === 'LONG_TERM'));

  const netCurrentAssets = totalCurrentAssets - creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = totalFixedAssets + netCurrentAssets;
  const netAssets = totalAssetsLessCurrentLiabilities - creditorsAfterOneYear;

  const calledUpShareCapital = Math.abs(sumBy(l => l.account_type === 'EQUITY' && (l.account_subtype === 'SHARE_CAPITAL' || l.account_code.startsWith('30'))));
  const sharePremiuim = Math.abs(sumBy(l => l.account_type === 'EQUITY' && l.account_subtype === 'SHARE_PREMIUM'));
  const profitAndLossReserve = Math.abs(sumBy(l => l.account_type === 'EQUITY' && !['SHARE_CAPITAL', 'SHARE_PREMIUM'].includes(l.account_subtype || '') && !l.account_code.startsWith('30')));
  const totalEquity = calledUpShareCapital + sharePremiuim + profitAndLossReserve;

  if (Math.abs(netAssets - totalEquity) > 1) {
    warnings.push(`Balance sheet does not balance: Net Assets (${netAssets.toFixed(2)}) != Total Equity (${totalEquity.toFixed(2)})`);
  }

  const model: AccountsModel = {
    company: {
      name: company.company_name,
      number: company.company_number,
      registeredOffice: {
        line1: company.address_line_1 || '',
        line2: company.address_line_2,
        city: company.city || '',
        postcode: company.postcode || '',
        country: company.country || 'United Kingdom',
      },
    },
    period: { start: periodStart, end: periodEnd },
    standard,
    balanceSheet: {
      tangibleAssets: tangibleAssets || undefined,
      intangibleAssets: intangibleAssets || undefined,
      investments: investments || undefined,
      totalFixedAssets,
      stocks: stocks || undefined,
      debtors: debtors || undefined,
      cashAtBank,
      totalCurrentAssets,
      creditorsWithinOneYear: creditorsWithinOneYear || undefined,
      creditorsAfterOneYear: creditorsAfterOneYear || undefined,
      netCurrentAssets,
      totalAssetsLessCurrentLiabilities,
      netAssets,
      calledUpShareCapital,
      sharePremiuim: sharePremiuim || undefined,
      profitAndLossReserve,
      totalEquity,
    },
    notes: {
      accountingPolicies: {
        basisOfPreparation: standard === 'FRS105'
          ? 'These accounts have been prepared in accordance with FRS 105 "The Financial Reporting Standard applicable to the Micro-entities Regime".'
          : 'These accounts have been prepared in accordance with FRS 102 "The Financial Reporting Standard applicable in the UK and Republic of Ireland" Section 1A Small Entities.',
        goingConcern: true,
      },
    },
    approval: {
      approvedByBoard: false,
    },
  };

  // P&L for FRS 102 1A
  if (standard === 'FRS102_1A') {
    const turnover = Math.abs(sumBy(l => l.account_type === 'INCOME' && (l.account_subtype === 'REVENUE' || l.account_subtype === 'SALES')));
    const costOfSales = sumBy(l => l.account_type === 'EXPENSE' && l.account_subtype === 'COST_OF_SALES');
    const grossProfit = turnover - costOfSales;
    const administrativeExpenses = sumBy(l => l.account_type === 'EXPENSE' && l.account_subtype !== 'COST_OF_SALES');
    const operatingProfit = grossProfit - administrativeExpenses;
    const interestReceivable = Math.abs(sumBy(l => l.account_type === 'INCOME' && l.account_subtype === 'INTEREST'));
    const interestPayable = sumBy(l => l.account_type === 'EXPENSE' && l.account_subtype === 'INTEREST');
    const profitBeforeTax = operatingProfit + interestReceivable - interestPayable;

    model.profitAndLoss = {
      turnover,
      costOfSales: costOfSales || undefined,
      grossProfit,
      administrativeExpenses: administrativeExpenses || undefined,
      operatingProfit,
      interestReceivable: interestReceivable || undefined,
      interestPayable: interestPayable || undefined,
      profitBeforeTax,
      profitAfterTax: profitBeforeTax, // Tax computed separately
    };
  }

  if (errors.length > 0) return { success: false, errors, warnings };
  return { success: true, model, errors: [], warnings };
}

/**
 * Extract CT add-back items from TB lines using structured ct_addback_category column.
 * Used by CT600 computation engine.
 */
export function extractCTAddBacks(tbLines: TBAccountLine[]): Array<{
  account_code: string;
  account_name: string;
  amount: number;
  category: string;
  auto_detected: boolean;
}> {
  return tbLines
    .filter((l) => l.ct_addback_category && l.ct_addback_category !== '__none__')
    .map((l) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      amount: l.debit - l.credit,
      category: l.ct_addback_category!,
      auto_detected: true,
    }))
    .filter((item) => Math.abs(item.amount) > 0.01);
}
