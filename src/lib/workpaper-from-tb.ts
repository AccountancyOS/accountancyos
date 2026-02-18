/**
 * TB → Workpaper Pipeline
 * Creates workpapers from Trial Balance snapshots with UK category mappings
 * Integrates tax calculation engine for SA, CT, and VAT
 */

import { supabase } from "@/integrations/supabase/client";


/**
 * Derive tax year from period end date
 */
function deriveTaxYear(periodEnd: string): string {
  const date = new Date(periodEnd);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  
  // UK tax year runs 6 April to 5 April
  // If period end is after 5 April, tax year is that year/next
  if (month > 3 || (month === 3 && day >= 6)) {
    return `${year}/${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}/${String(year).slice(-2)}`;
}

// Standard UK workpaper categories for different filing types
export const UK_WORKPAPER_CATEGORIES = {
  company_accounts: {
    // Profit & Loss categories
    turnover: { label: "Turnover", accountTypes: ["INCOME"], subtypes: ["SALES"] },
    other_income: { label: "Other Operating Income", accountTypes: ["INCOME"], subtypes: ["OTHER_INCOME"] },
    cost_of_sales: { label: "Cost of Sales", accountTypes: ["EXPENSE"], subtypes: ["COST_OF_SALES"] },
    gross_profit: { label: "Gross Profit", calculated: true, formula: "turnover + other_income - cost_of_sales" },
    administrative_expenses: { label: "Administrative Expenses", accountTypes: ["EXPENSE"], subtypes: ["OVERHEAD"] },
    directors_remuneration: { label: "Directors Remuneration", accountTypes: ["EXPENSE"], subtypes: ["DIRECTORS_REMUNERATION", "DIRECTORS_SALARY"] },
    depreciation: { label: "Depreciation", accountTypes: ["EXPENSE"], subtypes: ["DEPRECIATION"] },
    operating_profit: { label: "Operating Profit", calculated: true },
    interest_payable: { label: "Interest Payable", accountTypes: ["EXPENSE"], subtypes: ["FINANCE"] },
    profit_before_tax: { label: "Profit Before Tax", calculated: true },
    
    // Balance Sheet categories
    fixed_assets: { label: "Fixed Assets", accountTypes: ["ASSET"], subtypes: ["FIXED_ASSET"] },
    current_assets: { label: "Current Assets", accountTypes: ["ASSET"], subtypes: ["CURRENT_ASSET"] },
    trade_debtors: { label: "Trade Debtors", accountTypes: ["ASSET"], subtypes: ["TRADE_DEBTORS", "DEBTOR", "RECEIVABLE"] },
    bank: { label: "Bank & Cash", isBankAccount: true },
    trade_creditors: { label: "Trade Creditors", accountTypes: ["LIABILITY"], subtypes: ["TRADE_CREDITORS", "CREDITOR", "PAYABLE"] },
    other_creditors: { label: "Other Creditors", accountTypes: ["LIABILITY"], subtypes: ["CURRENT_LIABILITY"] },
    net_current_assets: { label: "Net Current Assets", calculated: true },
    long_term_liabilities: { label: "Long Term Liabilities", accountTypes: ["LIABILITY"], subtypes: ["LONG_TERM_LIABILITY"] },
    net_assets: { label: "Net Assets", calculated: true },
    
    // Equity
    share_capital: { label: "Share Capital", accountTypes: ["EQUITY"], subtypes: ["SHARE_CAPITAL"] },
    retained_earnings: { label: "Retained Earnings", accountTypes: ["EQUITY"], subtypes: ["RETAINED_EARNINGS", "PROFIT_AND_LOSS"] },
    shareholders_funds: { label: "Shareholders Funds", calculated: true },
  },
  
  ct600: {
    // Tax computation categories
    accounting_profit: { label: "Accounting Profit Before Tax", fromWorkpaper: "profit_before_tax" },
    depreciation_addback: { label: "Add: Depreciation", fromWorkpaper: "depreciation" },
    capital_allowances: { label: "Less: Capital Allowances", manual: true },
    disallowable_expenses: { label: "Add: Disallowable Expenses", manual: true },
    trading_profit: { label: "Trading Profit", calculated: true },
    property_income: { label: "Property Income", manual: true },
    chargeable_gains: { label: "Chargeable Gains", manual: true },
    total_profits: { label: "Total Profits", calculated: true },
    qualifying_donations: { label: "Less: Qualifying Donations", manual: true },
    profits_chargeable: { label: "Profits Chargeable to CT", calculated: true },
    corporation_tax: { label: "Corporation Tax", calculated: true },
  },
  
  self_assessment: {
    // Employment income
    employment_income: { label: "Employment Income", manual: true },
    benefits_in_kind: { label: "Benefits in Kind", manual: true },
    employment_expenses: { label: "Employment Expenses", manual: true },
    
    // Self-employment
    self_employment_turnover: { label: "Self-Employment Turnover", accountTypes: ["INCOME"] },
    self_employment_expenses: { label: "Self-Employment Expenses", accountTypes: ["EXPENSE"] },
    self_employment_profit: { label: "Self-Employment Profit", calculated: true },
    
    // Investment income
    dividends: { label: "Dividends", manual: true },
    bank_interest: { label: "Bank Interest", manual: true },
    property_income: { label: "Property Income", manual: true },
    
    // Deductions
    pension_contributions: { label: "Pension Contributions", manual: true },
    gift_aid: { label: "Gift Aid Donations", manual: true },
    
    // Summary
    total_income: { label: "Total Income", calculated: true },
    personal_allowance: { label: "Personal Allowance", calculated: true },
    taxable_income: { label: "Taxable Income", calculated: true },
    income_tax: { label: "Income Tax Due", calculated: true },
    national_insurance: { label: "National Insurance", calculated: true },
    total_tax_due: { label: "Total Tax Due", calculated: true },
  },
  
  vat_return: {
    box1_vat_due_sales: { label: "Box 1: VAT due on sales", accountTypes: ["LIABILITY"], subtypes: ["VAT_CONTROL", "VAT"], vatType: "OUTPUT" },
    box2_vat_due_acquisitions: { label: "Box 2: VAT due on acquisitions", manual: true },
    box3_total_vat_due: { label: "Box 3: Total VAT due", calculated: true },
    box4_vat_reclaimed: { label: "Box 4: VAT reclaimed", accountTypes: ["LIABILITY"], subtypes: ["VAT_CONTROL", "VAT"], vatType: "INPUT" },
    box5_net_vat: { label: "Box 5: Net VAT payable/refundable", calculated: true },
    box6_total_sales: { label: "Box 6: Total sales exc VAT", accountTypes: ["INCOME"] },
    box7_total_purchases: { label: "Box 7: Total purchases exc VAT", accountTypes: ["EXPENSE"] },
    box8_goods_to_eu: { label: "Box 8: Goods to EU", manual: true },
    box9_goods_from_eu: { label: "Box 9: Goods from EU", manual: true },
  },
};

export interface TBBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountSubtype?: string;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
  isBankAccount?: boolean;
  vatType?: string;
}

export interface WorkpaperLine {
  category: string;
  subcategory?: string;
  label: string;
  source: "trial_balance" | "manual" | "calculation" | "questionnaire";
  sourceReference?: string;
  amount: number;
  notes?: string;
  isKeyField: boolean;
  displayOrder: number;
}

/**
 * Map TB balances to workpaper lines using category configuration
 */
export function mapTBToWorkpaperLines(
  balances: TBBalance[],
  workpaperType: keyof typeof UK_WORKPAPER_CATEGORIES
): WorkpaperLine[] {
  const categoryConfig = UK_WORKPAPER_CATEGORIES[workpaperType];
  if (!categoryConfig) return [];

  const lines: WorkpaperLine[] = [];
  let displayOrder = 0;

  for (const [categoryKey, config] of Object.entries(categoryConfig)) {
    const categoryDef = config as any;
    
    if (categoryDef.calculated) {
      // Calculated field - will be computed later
      lines.push({
        category: categoryKey,
        label: categoryDef.label,
        source: "calculation",
        sourceReference: categoryDef.formula,
        amount: 0,
        isKeyField: true,
        displayOrder: displayOrder++,
      });
      continue;
    }

    if (categoryDef.manual || categoryDef.fromWorkpaper) {
      // Manual entry field
      lines.push({
        category: categoryKey,
        label: categoryDef.label,
        source: "manual",
        sourceReference: categoryDef.fromWorkpaper,
        amount: 0,
        isKeyField: true,
        displayOrder: displayOrder++,
      });
      continue;
    }

    // Find matching accounts
    let matchingBalances: TBBalance[] = [];

    if (categoryDef.accountTypes) {
      matchingBalances = balances.filter(b => {
        const typeMatch = categoryDef.accountTypes.includes(b.accountType);
        const subtypeMatch = !categoryDef.subtypes || 
          (b.accountSubtype && categoryDef.subtypes.includes(b.accountSubtype));
        return typeMatch && subtypeMatch;
      });
    } else if (categoryDef.isBankAccount) {
      matchingBalances = balances.filter(b => b.isBankAccount);
    } else if (categoryDef.vatType) {
      matchingBalances = balances.filter(b => b.vatType === categoryDef.vatType);
    }

    // Create lines for each matching account
    if (matchingBalances.length > 0) {
      const totalAmount = matchingBalances.reduce((sum, b) => sum + b.closingBalance, 0);
      
      lines.push({
        category: categoryKey,
        label: categoryDef.label,
        source: "trial_balance",
        sourceReference: matchingBalances.map(b => b.accountCode).join(", "),
        amount: totalAmount,
        isKeyField: true,
        displayOrder: displayOrder++,
      });

      // Add detail lines for each account
      matchingBalances.forEach(balance => {
        lines.push({
          category: categoryKey,
          subcategory: balance.accountCode,
          label: balance.accountName,
          source: "trial_balance",
          sourceReference: balance.accountId,
          amount: balance.closingBalance,
          isKeyField: false,
          displayOrder: displayOrder++,
        });
      });
    } else {
      // No matching accounts, create empty line
      lines.push({
        category: categoryKey,
        label: categoryDef.label,
        source: "trial_balance",
        amount: 0,
        isKeyField: true,
        displayOrder: displayOrder++,
      });
    }
  }

  return lines;
}

/**
 * Calculate computed fields in workpaper including tax calculations
 * Integrates with tax-calculation-engine for SA, CT, and VAT
 */
export function calculateWorkpaperFields(
  lines: WorkpaperLine[],
  workpaperType?: string,
  taxYear?: string,
  periodEnd?: string
): WorkpaperLine[] {
  const linesByCategory = new Map<string, WorkpaperLine>();
  lines.forEach(l => {
    if (l.isKeyField) linesByCategory.set(l.category, l);
  });

  // Company accounts calculations
  const turnover = linesByCategory.get("turnover")?.amount || 0;
  const otherIncome = linesByCategory.get("other_income")?.amount || 0;
  const costOfSales = linesByCategory.get("cost_of_sales")?.amount || 0;
  const adminExpenses = linesByCategory.get("administrative_expenses")?.amount || 0;
  const interestPayable = linesByCategory.get("interest_payable")?.amount || 0;
  
  // P&L calculations
  const grossProfit = turnover + otherIncome - Math.abs(costOfSales);
  const operatingProfit = grossProfit - Math.abs(adminExpenses);
  const profitBeforeTax = operatingProfit - Math.abs(interestPayable);

  // Update calculated lines
  lines.forEach(line => {
    if (line.category === "gross_profit") line.amount = grossProfit;
    if (line.category === "operating_profit") line.amount = operatingProfit;
    if (line.category === "profit_before_tax") line.amount = profitBeforeTax;
    
    // VAT calculations
    if (line.category === "box3_total_vat_due") {
      const box1 = linesByCategory.get("box1_vat_due_sales")?.amount || 0;
      const box2 = linesByCategory.get("box2_vat_due_acquisitions")?.amount || 0;
      line.amount = box1 + box2;
    }
    if (line.category === "box5_net_vat") {
      const box3 = linesByCategory.get("box3_total_vat_due")?.amount || 0;
      const box4 = linesByCategory.get("box4_vat_reclaimed")?.amount || 0;
      line.amount = box3 - box4;
    }

    // Self-employment profit
    if (line.category === "self_employment_profit") {
      const seTurnover = linesByCategory.get("self_employment_turnover")?.amount || 0;
      const seExpenses = linesByCategory.get("self_employment_expenses")?.amount || 0;
      line.amount = seTurnover - Math.abs(seExpenses);
    }
  });

  // If workpaper type provided, apply full tax calculations
  if (workpaperType) {
    // Convert lines to field_values for tax engine
    const fieldValues: Record<string, any> = {};
    lines.forEach(line => {
      fieldValues[line.category] = {
        label: line.label,
        amount: line.amount,
        source: line.source,
        sourceReference: line.sourceReference,
        isKeyField: line.isKeyField,
        displayOrder: line.displayOrder,
      };
    });

    // Tax calculations are async and deferred to createWorkpaperFromSnapshot.
    // This sync function only handles basic P&L/VAT/SE calculations above.
  }

  return lines;
}

/**
 * Check if a workpaper already exists for the given snapshot and type (idempotent check)
 */
async function findExistingWorkpaper(
  snapshotId: string,
  serviceType: string
): Promise<{ exists: boolean; workpaperId?: string }> {
  const { data, error } = await supabase
    .from("workpaper_instances")
    .select("id")
    .eq("trial_balance_snapshot_id", snapshotId)
    .eq("service_type", serviceType)
    .maybeSingle();

  if (error) {
    console.error("Error checking existing workpaper:", error);
    return { exists: false };
  }

  return {
    exists: !!data,
    workpaperId: data?.id,
  };
}

/**
 * Create workpaper instance from TB snapshot (idempotent - updates if exists)
 */
export async function createWorkpaperFromSnapshot(
  snapshotId: string,
  workpaperType: "company_accounts" | "ct600" | "self_assessment" | "vat_return",
  options: {
    jobId?: string;
    name?: string;
    forceRecreate?: boolean;
  } = {}
): Promise<{ success: boolean; workpaperId?: string; error?: string; wasUpdated?: boolean }> {
  try {
    // Determine service type for the workpaper
    const serviceTypeMap: Record<string, string> = {
      company_accounts: "accounts",
      ct600: "ct600",
      self_assessment: "self_assessment",
      vat_return: "vat_return",
    };
    const serviceType = serviceTypeMap[workpaperType];

    // Idempotent check - see if workpaper already exists for this snapshot+type
    if (!options.forceRecreate) {
      const existing = await findExistingWorkpaper(snapshotId, serviceType);
      if (existing.exists && existing.workpaperId) {
        // Update existing workpaper instead of creating new one
        return updateWorkpaperFromSnapshot(existing.workpaperId, snapshotId, workpaperType);
      }
    }

    // Fetch the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from("trial_balance_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (snapshotError || !snapshot) {
      return { success: false, error: "Snapshot not found" };
    }

    // Parse balances and add account metadata
    const balances = (snapshot.balances as any[]).map(b => ({
      ...b,
      accountSubtype: b.accountSubtype || b.account_subtype,
      isBankAccount: b.isBankAccount || b.is_bank_account,
    })) as TBBalance[];

    // Map to workpaper lines
    let lines = mapTBToWorkpaperLines(balances, workpaperType);
    
    // Calculate computed fields including tax calculations
    // Derive tax year from period_end
    const periodEnd = snapshot.period_end as string;
    const taxYear = deriveTaxYear(periodEnd);
    lines = calculateWorkpaperFields(lines, workpaperType, taxYear, periodEnd);

    // Convert lines to field_values format
    const fieldValues: Record<string, any> = {};
    const fieldOverrides: Record<string, any> = {};
    
    lines.forEach(line => {
      const key = line.subcategory 
        ? `${line.category}_${line.subcategory}`
        : line.category;
      
      fieldValues[key] = {
        label: line.label,
        amount: line.amount,
        source: line.source,
        sourceReference: line.sourceReference,
        isKeyField: line.isKeyField,
        displayOrder: line.displayOrder,
      };
    });

    // Create workpaper name
    const workpaperName = options.name || 
      `${workpaperType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} - ${
        new Date(snapshot.period_end).toLocaleDateString("en-GB", { 
          month: "short", 
          year: "numeric" 
        })
      }`;

    // Get current user for prepared_by
    const { data: { user } } = await supabase.auth.getUser();

    // Create workpaper instance
    const { data: workpaper, error: workpaperError } = await supabase
      .from("workpaper_instances")
      .insert([{
        organization_id: snapshot.organization_id,
        client_id: snapshot.client_id,
        company_id: snapshot.company_id,
        job_id: options.jobId || null,
        trial_balance_snapshot_id: snapshotId,
        source_type: snapshot.source_type as any,
        name: workpaperName,
        service_type: serviceType,
        period_start: snapshot.period_start,
        period_end: snapshot.period_end,
        period_label: `YE ${new Date(snapshot.period_end as string).toLocaleDateString("en-GB", { 
          day: "2-digit",
          month: "short", 
          year: "numeric" 
        })}`,
        status: "draft",
        data_source: "trial_balance",
        field_values: fieldValues as any,
        field_overrides: fieldOverrides as any,
        source_data: { snapshotId, balances } as any,
        last_data_sync_at: new Date().toISOString(),
        prepared_by: user?.id,
        prepared_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (workpaperError) {
      console.error("Workpaper creation error:", workpaperError);
      return { success: false, error: workpaperError.message };
    }

    // Update snapshot to link to workpaper
    await supabase
      .from("trial_balance_snapshots")
      .update({ status: "used_in_workpaper" })
      .eq("id", snapshotId);

    return { success: true, workpaperId: workpaper.id };
  } catch (error) {
    console.error("Error creating workpaper from snapshot:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Update existing workpaper from TB snapshot (idempotent update)
 */
async function updateWorkpaperFromSnapshot(
  workpaperId: string,
  snapshotId: string,
  workpaperType: "company_accounts" | "ct600" | "self_assessment" | "vat_return"
): Promise<{ success: boolean; workpaperId?: string; error?: string; wasUpdated?: boolean }> {
  try {
    // Fetch the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from("trial_balance_snapshots")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (snapshotError || !snapshot) {
      return { success: false, error: "Snapshot not found" };
    }

    // Parse balances
    const balances = (snapshot.balances as any[]).map(b => ({
      ...b,
      accountSubtype: b.accountSubtype || b.account_subtype,
      isBankAccount: b.isBankAccount || b.is_bank_account,
    })) as TBBalance[];

    // Map to workpaper lines
    let lines = mapTBToWorkpaperLines(balances, workpaperType);
    const periodEnd = snapshot.period_end as string;
    const taxYear = deriveTaxYear(periodEnd);
    lines = calculateWorkpaperFields(lines, workpaperType, taxYear, periodEnd);

    // Convert to field_values
    const fieldValues: Record<string, any> = {};
    lines.forEach(line => {
      const key = line.subcategory 
        ? `${line.category}_${line.subcategory}`
        : line.category;
      
      fieldValues[key] = {
        label: line.label,
        amount: line.amount,
        source: line.source,
        sourceReference: line.sourceReference,
        isKeyField: line.isKeyField,
        displayOrder: line.displayOrder,
      };
    });

    // Update existing workpaper
    const { error: updateError } = await supabase
      .from("workpaper_instances")
      .update({
        field_values: fieldValues as any,
        source_data: { snapshotId, balances } as any,
        last_data_sync_at: new Date().toISOString(),
      })
      .eq("id", workpaperId)
      .eq("locked", false); // Only update if not locked

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, workpaperId, wasUpdated: true };
  } catch (error) {
    console.error("Error updating workpaper from snapshot:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Refresh workpaper from latest TB snapshot
 */
export async function refreshWorkpaperFromTB(
  workpaperId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: workpaper, error: workpaperError } = await supabase
      .from("workpaper_instances")
      .select("*")
      .eq("id", workpaperId)
      .single();

    if (workpaperError || !workpaper) {
      return { success: false, error: "Workpaper not found" };
    }

    if (workpaper.status === "finalised") {
      return { success: false, error: "Cannot refresh finalised workpaper" };
    }

    if (!workpaper.trial_balance_snapshot_id) {
      return { success: false, error: "Workpaper has no linked TB snapshot" };
    }

    // Re-create from snapshot
    const result = await createWorkpaperFromSnapshot(
      workpaper.trial_balance_snapshot_id,
      workpaper.service_type as any,
      { jobId: workpaper.job_id, name: workpaper.name }
    );

    if (!result.success) {
      return result;
    }

    // Delete old workpaper
    await supabase
      .from("workpaper_instances")
      .delete()
      .eq("id", workpaperId);

    return { success: true };
  } catch (error) {
    console.error("Error refreshing workpaper:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}
