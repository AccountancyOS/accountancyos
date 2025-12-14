// VAT Return Validator
// Recognition-test oriented validation with strict HMRC schema compliance

import { VATReturnModel, VATModelValidationResult, validateVATModel } from './vat-model-mapper';

export interface ValidationResult {
  severity: 'error' | 'warn';
  code: string;
  message: string;
  field: string;
}

export interface VATValidationOutput {
  isValid: boolean;
  canSubmit: boolean;
  results: ValidationResult[];
  summary: {
    errors: number;
    warnings: number;
  };
}

/**
 * Comprehensive VAT return validation
 * Returns structured results suitable for storage in filing_validations
 */
export function validateVATReturn(
  model: VATReturnModel,
  obligation?: { periodKey: string; start: string; end: string; status: string }
): VATValidationOutput {
  const results: ValidationResult[] = [];

  // Run core model validation
  const coreValidation = validateVATModel(model);
  
  // Convert core errors to structured results
  for (const error of coreValidation.errors) {
    const field = extractFieldFromError(error);
    results.push({
      severity: 'error',
      code: generateErrorCode(error),
      message: error,
      field,
    });
  }

  // Convert warnings to structured results
  for (const warning of coreValidation.warnings) {
    const field = extractFieldFromError(warning);
    results.push({
      severity: 'warn',
      code: generateErrorCode(warning),
      message: warning,
      field,
    });
  }

  // Additional HMRC-specific validations

  // Check period key format (4 characters: year digit + quarter letter + 2 chars)
  if (!model.periodKey || model.periodKey.length !== 4) {
    results.push({
      severity: 'error',
      code: 'INVALID_PERIOD_KEY_LENGTH',
      message: 'Period key must be exactly 4 characters',
      field: 'periodKey',
    });
  } else if (!/^[0-9A-Z#]{4}$/.test(model.periodKey)) {
    results.push({
      severity: 'error',
      code: 'INVALID_PERIOD_KEY_FORMAT',
      message: 'Period key contains invalid characters',
      field: 'periodKey',
    });
  }

  // Validate against obligation if provided
  if (obligation) {
    if (model.periodKey !== obligation.periodKey) {
      results.push({
        severity: 'error',
        code: 'PERIOD_KEY_MISMATCH',
        message: `Period key ${model.periodKey} does not match obligation period ${obligation.periodKey}`,
        field: 'periodKey',
      });
    }

    if (obligation.status === 'F') {
      results.push({
        severity: 'error',
        code: 'ALREADY_FILED',
        message: 'This VAT period has already been filed with HMRC',
        field: 'periodKey',
      });
    }
  }

  // Check for negative boxes that should not be negative
  if (model.netVatDue < 0) {
    results.push({
      severity: 'error',
      code: 'NEGATIVE_NET_VAT',
      message: 'Box 5 (Net VAT due) cannot be negative per HMRC rules',
      field: 'netVatDue',
    });
  }

  // Check box value ranges (HMRC maximum)
  const maxValue = 9999999999999.99;
  const boxChecks = [
    { field: 'vatDueSales', value: model.vatDueSales, label: 'Box 1' },
    { field: 'vatDueAcquisitions', value: model.vatDueAcquisitions, label: 'Box 2' },
    { field: 'totalVatDue', value: model.totalVatDue, label: 'Box 3' },
    { field: 'vatReclaimedCurrPeriod', value: model.vatReclaimedCurrPeriod, label: 'Box 4' },
    { field: 'netVatDue', value: model.netVatDue, label: 'Box 5' },
    { field: 'totalValueSalesExVAT', value: model.totalValueSalesExVAT, label: 'Box 6' },
    { field: 'totalValuePurchasesExVAT', value: model.totalValuePurchasesExVAT, label: 'Box 7' },
    { field: 'totalValueGoodsSuppliedExVAT', value: model.totalValueGoodsSuppliedExVAT, label: 'Box 8' },
    { field: 'totalAcquisitionsExVAT', value: model.totalAcquisitionsExVAT, label: 'Box 9' },
  ];

  for (const check of boxChecks) {
    if (typeof check.value !== 'number' || isNaN(check.value)) {
      results.push({
        severity: 'error',
        code: 'INVALID_NUMBER',
        message: `${check.label} must be a valid number`,
        field: check.field,
      });
    } else if (Math.abs(check.value) > maxValue) {
      results.push({
        severity: 'error',
        code: 'VALUE_EXCEEDS_MAXIMUM',
        message: `${check.label} exceeds HMRC maximum value`,
        field: check.field,
      });
    }
  }

  // Verify finalised flag
  if (!model.finalised) {
    results.push({
      severity: 'error',
      code: 'NOT_FINALISED',
      message: 'VAT return must be marked as finalised before submission',
      field: 'finalised',
    });
  }

  // Check for suspicious patterns (warnings)
  if (model.vatDueSales === 0 && model.totalValueSalesExVAT > 0) {
    results.push({
      severity: 'warn',
      code: 'ZERO_VAT_ON_SALES',
      message: 'Box 1 is zero but Box 6 shows sales - verify all sales are zero-rated/exempt',
      field: 'vatDueSales',
    });
  }

  if (model.vatReclaimedCurrPeriod > model.vatDueSales * 2) {
    results.push({
      severity: 'warn',
      code: 'HIGH_VAT_RECLAIM',
      message: 'VAT reclaimed is more than double VAT on sales - please verify',
      field: 'vatReclaimedCurrPeriod',
    });
  }

  // Flat rate scheme indicator (Box 6 much larger than Box 7)
  if (model.totalValueSalesExVAT > model.totalValuePurchasesExVAT * 10 && model.totalValuePurchasesExVAT > 0) {
    results.push({
      severity: 'warn',
      code: 'POSSIBLE_FLAT_RATE',
      message: 'Large sales/purchases ratio may indicate flat rate scheme - verify calculation method',
      field: 'totalValueSalesExVAT',
    });
  }

  const errors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warn').length;

  return {
    isValid: errors === 0,
    canSubmit: errors === 0,
    results,
    summary: { errors, warnings },
  };
}

/**
 * Extract field name from error message
 */
function extractFieldFromError(error: string): string {
  if (error.includes('Box 1')) return 'vatDueSales';
  if (error.includes('Box 2')) return 'vatDueAcquisitions';
  if (error.includes('Box 3')) return 'totalVatDue';
  if (error.includes('Box 4')) return 'vatReclaimedCurrPeriod';
  if (error.includes('Box 5')) return 'netVatDue';
  if (error.includes('Box 6')) return 'totalValueSalesExVAT';
  if (error.includes('Box 7')) return 'totalValuePurchasesExVAT';
  if (error.includes('Box 8')) return 'totalValueGoodsSuppliedExVAT';
  if (error.includes('Box 9')) return 'totalAcquisitionsExVAT';
  if (error.includes('period key')) return 'periodKey';
  return 'general';
}

/**
 * Generate stable error code from message
 */
function generateErrorCode(message: string): string {
  const normalized = message
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  
  // Map common patterns
  if (message.includes('must equal')) return 'CALCULATION_MISMATCH';
  if (message.includes('whole number')) return 'MUST_BE_WHOLE_NUMBER';
  if (message.includes('decimal places')) return 'INVALID_DECIMAL_PLACES';
  if (message.includes('Invalid period key')) return 'INVALID_PERIOD_KEY';
  if (message.includes('exceeds')) return 'VALUE_EXCEEDS_MAXIMUM';
  if (message.includes('negative')) return 'INVALID_NEGATIVE_VALUE';
  
  return normalized || 'VALIDATION_ERROR';
}

/**
 * Store validation results in the database
 */
export async function storeValidationResults(
  supabase: any,
  filingId: string,
  organizationId: string,
  validation: VATValidationOutput,
  validationType: 'pre_submission' | 'schema' | 'business_rules' = 'pre_submission'
): Promise<string | null> {
  const { data, error } = await supabase
    .from('filing_validations')
    .insert({
      filing_id: filingId,
      organization_id: organizationId,
      validation_type: validationType,
      status: validation.isValid ? 'pass' : 'fail',
      validator_version: '1.0.0',
      results: validation.results,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to store validation results:', error);
    return null;
  }

  return data.id;
}
