/**
 * Tax calculation types for UK Corporation Tax
 * Provides strong typing for CT computation engine
 */

export interface CTComputationInput {
  /** Accounting profit/loss before tax */
  accountingProfit: number;
  
  /** Add-backs (disallowable expenses) */
  addBacks: {
    depreciation?: number;
    entertainingClients?: number;
    fines?: number;
    donations?: number;
    other?: number;
  };
  
  /** Deductions */
  deductions: {
    capitalAllowances?: number;
    tradingLossesBroughtForward?: number;
    groupRelief?: number;
    other?: number;
  };
  
  /** Period information */
  periodStart: string;
  periodEnd: string;
  
  /** Associated companies count (affects marginal relief) */
  associatedCompaniesCount: number;
  
  /** Whether this is a short accounting period */
  isShortPeriod: boolean;
  shortPeriodDays?: number;
}

export interface CTComputationResult {
  /** Adjusted trading profit */
  adjustedTradingProfit: number;
  
  /** Total add-backs */
  totalAddBacks: number;
  
  /** Total deductions */
  totalDeductions: number;
  
  /** Taxable total profits */
  taxableTotalProfits: number;
  
  /** Corporation tax due before marginal relief */
  ctBeforeMarginalRelief: number;
  
  /** Marginal relief amount */
  marginalReliefAmount: number;
  
  /** Final corporation tax due */
  corporationTaxDue: number;
  
  /** Effective tax rate */
  effectiveTaxRate: number;
  
  /** Tax band breakdown */
  taxBands: CTTaxBand[];
  
  /** Calculation metadata */
  metadata: {
    upperLimit: number;
    lowerLimit: number;
    mainRate: number;
    smallProfitsRate: number;
    marginalReliefFraction: number;
    periodFactor: number;
  };
}

export interface CTTaxBand {
  name: string;
  lowerBound: number;
  upperBound: number;
  rate: number;
  taxableAmount: number;
  taxDue: number;
}

export interface CTValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate CT computation input
 */
export function validateCTInput(input: Partial<CTComputationInput>): CTValidationError[] {
  const errors: CTValidationError[] = [];
  
  if (input.accountingProfit === undefined || input.accountingProfit === null) {
    errors.push({
      field: 'accountingProfit',
      message: 'Accounting profit is required',
      severity: 'error',
    });
  }
  
  if (!input.periodStart) {
    errors.push({
      field: 'periodStart',
      message: 'Period start date is required',
      severity: 'error',
    });
  }
  
  if (!input.periodEnd) {
    errors.push({
      field: 'periodEnd',
      message: 'Period end date is required',
      severity: 'error',
    });
  }
  
  if (input.periodStart && input.periodEnd) {
    const start = new Date(input.periodStart);
    const end = new Date(input.periodEnd);
    
    if (end <= start) {
      errors.push({
        field: 'periodEnd',
        message: 'Period end must be after period start',
        severity: 'error',
      });
    }
    
    // Check period length (max 18 months for CT)
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + 
                       (end.getMonth() - start.getMonth());
    if (monthsDiff > 18) {
      errors.push({
        field: 'periodEnd',
        message: 'Accounting period cannot exceed 18 months',
        severity: 'error',
      });
    }
  }
  
  if (input.associatedCompaniesCount !== undefined && input.associatedCompaniesCount < 0) {
    errors.push({
      field: 'associatedCompaniesCount',
      message: 'Associated companies count cannot be negative',
      severity: 'error',
    });
  }
  
  return errors;
}

/**
 * CT600 UK tax rates for FY2023/24
 */
export const CT_RATES_2023_24 = {
  mainRate: 0.25,
  smallProfitsRate: 0.19,
  lowerLimit: 50000,
  upperLimit: 250000,
  marginalReliefFraction: 3 / 200,
} as const;

/**
 * CT600 UK tax rates for FY2024/25
 */
export const CT_RATES_2024_25 = {
  mainRate: 0.25,
  smallProfitsRate: 0.19,
  lowerLimit: 50000,
  upperLimit: 250000,
  marginalReliefFraction: 3 / 200,
} as const;
