/**
 * Workpaper Engine - Handles data mapping, calculations, and integrations
 */

export interface MappingRule {
  source: "questionnaire" | "bookkeeping" | "payroll" | "calculation" | "static";
  field_path?: string; // For questionnaire/bookkeeping
  account_code?: string; // For bookkeeping
  formula?: string; // For calculations
  static_value?: any; // For static values
}

export interface WorkpaperTemplate {
  sections: any[];
  mappings?: Record<string, MappingRule>;
  calculations?: Array<{
    name: string;
    formula: string;
  }>;
}

/**
 * Apply questionnaire responses to workpaper using mapping rules
 */
export function applyQuestionnaireData(
  questionnaireResponses: Record<string, any>,
  template: WorkpaperTemplate
): Record<string, any> {
  const fieldValues: Record<string, any> = {};

  if (!template.mappings) return fieldValues;

  for (const [fieldName, mapping] of Object.entries(template.mappings)) {
    if (mapping.source === "questionnaire" && mapping.field_path) {
      const value = getNestedValue(questionnaireResponses, mapping.field_path);
      if (value !== undefined) {
        fieldValues[fieldName] = value;
      }
    }
  }

  return fieldValues;
}

/**
 * Pull bookkeeping data for workpaper from the Bookkeeping module
 */
export async function pullBookkeepingData(
  workpaperId: string,
  periodStart: Date,
  periodEnd: Date,
  options?: {
    clientId?: string;
    companyId?: string;
    organizationId?: string;
  }
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    if (!options?.organizationId) {
      return {
        success: false,
        message: "Organization ID is required",
      };
    }

    // Import supabase dynamically to avoid circular dependencies
    const { supabase } = await import("@/integrations/supabase/client");

    // Build query for ledger entries
    const query = supabase
      .from("ledger_entries")
      .select(`
        *,
        account:bookkeeping_accounts(id, code, name, account_type, account_subtype)
      `)
      .eq("organization_id", options.organizationId)
      .gte("transaction_date", periodStart.toISOString().split("T")[0])
      .lte("transaction_date", periodEnd.toISOString().split("T")[0]);

    // Filter by entity
    if (options.clientId) {
      query.eq("client_id", options.clientId);
    } else if (options.companyId) {
      query.eq("company_id", options.companyId);
    } else {
      return {
        success: false,
        message: "Either client_id or company_id is required",
      };
    }

    const { data: entries, error } = await query;

    if (error) throw error;

    if (!entries || entries.length === 0) {
      return {
        success: false,
        message: "No bookkeeping data found for this period. Ensure journals have been posted.",
      };
    }

    // Calculate trial balance
    const accountMap = new Map<string, any>();

    entries.forEach((entry: any) => {
      if (!accountMap.has(entry.account.id)) {
        accountMap.set(entry.account.id, {
          account_id: entry.account.id,
          code: entry.account.code,
          name: entry.account.name,
          type: entry.account.account_type,
          subtype: entry.account.account_subtype,
          debit: 0,
          credit: 0,
          balance: 0,
        });
      }

      const account = accountMap.get(entry.account.id);
      account.debit += entry.debit || 0;
      account.credit += entry.credit || 0;
      account.balance += (entry.debit || 0) - (entry.credit || 0);
    });

    const trialBalance = Array.from(accountMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );

    return {
      success: true,
      message: `Pulled ${entries.length} transactions from bookkeeping`,
      data: {
        trial_balance: trialBalance,
        total_transactions: entries.length,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      },
    };
  } catch (error) {
    console.error("Error pulling bookkeeping data:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to pull bookkeeping data",
    };
  }
}

/**
 * Pull payroll data for workpaper (placeholder for future implementation)
 */
export async function pullPayrollData(
  workpaperId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ success: boolean; message: string; data?: any }> {
  // TODO: Implement payroll module integration
  // This will pull pay runs and RTI data for the period
  
  return {
    success: false,
    message: "Payroll integration coming soon. This will automatically pull pay run data for PAYE/RTI workpapers.",
  };
}

/**
 * Apply bookkeeping data to workpaper using mapping rules
 */
export function applyBookkeepingData(
  trialBalance: Record<string, any>,
  template: WorkpaperTemplate
): Record<string, any> {
  const fieldValues: Record<string, any> = {};

  if (!template.mappings) return fieldValues;

  for (const [fieldName, mapping] of Object.entries(template.mappings)) {
    if (mapping.source === "bookkeeping" && mapping.account_code) {
      const accountValue = trialBalance[mapping.account_code];
      if (accountValue !== undefined) {
        fieldValues[fieldName] = accountValue;
      }
    }
  }

  return fieldValues;
}

/**
 * Calculate computed fields based on formula
 */
export function calculateFields(
  fieldValues: Record<string, any>,
  template: WorkpaperTemplate
): Record<string, any> {
  const computed: Record<string, any> = {};

  if (!template.calculations) return computed;

  for (const calc of template.calculations) {
    try {
      // Simple formula evaluation (replace with proper formula parser in production)
      const formula = calc.formula;
      let result = formula;

      // Replace field names with values
      for (const [fieldName, value] of Object.entries(fieldValues)) {
        const regex = new RegExp(`\\\\b${fieldName}\\\\b`, "g");
        result = result.replace(regex, String(value || 0));
      }

      // Evaluate simple arithmetic (using Function constructor for safety)
      // In production, use a proper expression parser
      computed[calc.name] = eval(result);
    } catch (error) {
      console.error(`Error calculating ${calc.name}:`, error);
      computed[calc.name] = null;
    }
  }

  return computed;
}

/**
 * Helper to get nested object value by path (e.g., "responses.employment.gross_pay")
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Check if workpaper has overrides compared to source data
 */
export function hasOverrides(
  fieldValues: Record<string, any>,
  sourceData: Record<string, any>
): boolean {
  for (const [key, value] of Object.entries(fieldValues)) {
    if (sourceData[key] !== undefined && sourceData[key] !== value) {
      return true;
    }
  }
  return false;
}

/**
 * Get list of overridden fields
 */
export function getOverriddenFields(
  fieldValues: Record<string, any>,
  sourceData: Record<string, any>
): string[] {
  const overridden: string[] = [];

  for (const [key, value] of Object.entries(fieldValues)) {
    if (sourceData[key] !== undefined && sourceData[key] !== value) {
      overridden.push(key);
    }
  }

  return overridden;
}
