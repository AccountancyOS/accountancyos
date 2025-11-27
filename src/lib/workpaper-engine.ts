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
 * Pull bookkeeping data for workpaper (placeholder for future implementation)
 */
export async function pullBookkeepingData(
  workpaperId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ success: boolean; message: string; data?: any }> {
  // TODO: Implement bookkeeping module integration
  // This will pull trial balance and transactions for the period
  
  return {
    success: false,
    message: "Bookkeeping integration coming soon. This will automatically pull trial balance data for Accounts, CT600, and VAT workpapers.",
  };
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
