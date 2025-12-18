/**
 * UK Payroll Types
 * Strict type definitions for payroll calculations
 */

// ==================== TAX CODES ====================

export interface TaxCode {
  code: string;
  prefix?: string;
  numericPart: number;
  suffix: 'L' | 'M' | 'N' | 'T' | 'BR' | 'D0' | 'D1' | 'NT' | 'S' | 'C' | 'K' | '0T';
  isScottish: boolean;
  isWelsh: boolean;
  isEmergency: boolean;
  isCumulative: boolean;
}

export type TaxCodeValidationResult = 
  | { valid: true; parsed: TaxCode }
  | { valid: false; error: string };

// ==================== EMPLOYEE ====================

export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'director';
export type PayFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';
export type StudentLoanPlan = 'plan_1' | 'plan_2' | 'plan_4' | 'plan_5' | 'postgrad' | 'none';
export type PensionType = 'auto_enrolment' | 'salary_sacrifice' | 'relief_at_source' | 'net_pay' | 'none';

export interface EmployeeDetails {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  niNumber: string;
  taxCode: string;
  employmentType: EmploymentType;
  payFrequency: PayFrequency;
  startDate: string;
  endDate?: string | null;
  birthDate: string;
  
  // Pay details
  annualSalary: number;
  hourlyRate?: number;
  
  // Deductions
  studentLoanPlan: StudentLoanPlan;
  hasPostgradLoan: boolean;
  pensionType: PensionType;
  pensionEmployeePercent: number;
  pensionEmployerPercent: number;
  
  // NI Category
  niCategory: 'A' | 'B' | 'C' | 'F' | 'H' | 'I' | 'J' | 'L' | 'M' | 'S' | 'V' | 'Z';
  
  // Director specific
  isDirector: boolean;
  directorNiMethod?: 'annual' | 'alternative';
}

// ==================== PAY RUN ====================

export type PayRunStatus = 'draft' | 'processing' | 'pending_approval' | 'approved' | 'submitted' | 'paid';

export interface PayRun {
  id: string;
  organizationId: string;
  payeSchemeId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  paymentDate: string;
  taxPeriod: number; // 1-12 for monthly, 1-52 for weekly
  taxYear: string;
  status: PayRunStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  submittedAt?: string;
}

// ==================== PAYSLIP CALCULATION ====================

export interface PayslipInput {
  employee: EmployeeDetails;
  payRun: PayRun;
  grossPay: number;
  hoursWorked?: number;
  bonus?: number;
  commission?: number;
  overtime?: number;
  yearToDateGross: number;
  yearToDateTax: number;
  yearToDateNi: number;
  previousPayPeriods: number;
}

export interface PayslipLine {
  description: string;
  amount: number;
  type: 'earning' | 'deduction' | 'employer_cost';
  category: string;
}

export interface PayslipResult {
  // Earnings
  basicPay: number;
  bonus: number;
  commission: number;
  overtime: number;
  totalGrossPay: number;
  
  // Tax calculation
  taxableIncome: number;
  incomeTax: number;
  taxCode: string;
  taxBasis: 'cumulative' | 'week1_month1';
  
  // National Insurance
  niableEarnings: number;
  employeeNi: number;
  employerNi: number;
  niCategory: string;
  
  // Deductions
  studentLoanDeduction: number;
  postgradLoanDeduction: number;
  pensionEmployeeContribution: number;
  pensionEmployerContribution: number;
  otherDeductions: number;
  
  // Net
  totalDeductions: number;
  netPay: number;
  
  // YTD figures
  ytdGross: number;
  ytdTax: number;
  ytdNi: number;
  ytdPension: number;
  
  // Breakdown lines for payslip display
  earningsLines: PayslipLine[];
  deductionLines: PayslipLine[];
  employerCostLines: PayslipLine[];
  
  // Validation
  warnings: string[];
  errors: string[];
}

// ==================== NI RATES ====================

export interface NiRates {
  taxYear: string;
  // Employee rates
  employeePrimaryThreshold: number;
  employeeUpperEarningsLimit: number;
  employeeMainRate: number;
  employeeAdditionalRate: number;
  // Employer rates
  employerSecondaryThreshold: number;
  employerRate: number;
  // Director annual method thresholds
  directorPrimaryThreshold: number;
  directorUpperEarningsLimit: number;
}

export const NI_RATES_2024_25: NiRates = {
  taxYear: '2024/25',
  employeePrimaryThreshold: 1048, // Monthly
  employeeUpperEarningsLimit: 4189, // Monthly
  employeeMainRate: 0.08, // 8% from April 2024
  employeeAdditionalRate: 0.02,
  employerSecondaryThreshold: 758, // Monthly
  employerRate: 0.138,
  directorPrimaryThreshold: 12570, // Annual
  directorUpperEarningsLimit: 50270, // Annual
};

// ==================== RTI SUBMISSION ====================

export type RtiSubmissionType = 'fps' | 'eps' | 'nvr' | 'ear';
export type RtiSubmissionStatus = 'draft' | 'pending' | 'submitted' | 'accepted' | 'rejected' | 'error';

export interface RtiSubmission {
  id: string;
  organizationId: string;
  payeSchemeId: string;
  payRunId?: string;
  submissionType: RtiSubmissionType;
  taxYear: string;
  taxPeriod: number;
  status: RtiSubmissionStatus;
  xmlPayload?: string;
  hmrcCorrelationId?: string;
  hmrcResponse?: Record<string, unknown>;
  submittedAt?: string;
  createdAt: string;
}

// ==================== VALIDATION ====================

export function validateNiNumber(niNumber: string): boolean {
  // UK NI number format: 2 letters, 6 digits, 1 letter (A-D)
  const pattern = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i;
  return pattern.test(niNumber.replace(/\s/g, ''));
}

export function parseTaxCode(code: string): TaxCodeValidationResult {
  const normalized = code.toUpperCase().trim();
  
  // Check for special codes
  const specialCodes = ['BR', 'D0', 'D1', 'NT', '0T'];
  for (const special of specialCodes) {
    if (normalized === special || normalized.endsWith(special)) {
      const prefix = normalized.replace(special, '');
      return {
        valid: true,
        parsed: {
          code: normalized,
          prefix: prefix || undefined,
          numericPart: 0,
          suffix: special as TaxCode['suffix'],
          isScottish: prefix === 'S',
          isWelsh: prefix === 'C',
          isEmergency: false,
          isCumulative: true,
        },
      };
    }
  }
  
  // Standard tax code pattern: optional S/C prefix, number, suffix letter
  const pattern = /^([SC])?(\d+)([LMNTK])(\s*(W1|M1|X))?$/;
  const match = normalized.match(pattern);
  
  if (!match) {
    return { valid: false, error: `Invalid tax code format: ${code}` };
  }
  
  const [, prefix, numeric, suffix, , emergency] = match;
  
  return {
    valid: true,
    parsed: {
      code: normalized,
      prefix,
      numericPart: parseInt(numeric, 10),
      suffix: suffix as TaxCode['suffix'],
      isScottish: prefix === 'S',
      isWelsh: prefix === 'C',
      isEmergency: !!emergency,
      isCumulative: !emergency,
    },
  };
}

export function validatePayslipInput(input: PayslipInput): string[] {
  const errors: string[] = [];
  
  if (input.grossPay < 0) {
    errors.push('Gross pay cannot be negative');
  }
  
  if (input.yearToDateGross < 0) {
    errors.push('Year to date gross cannot be negative');
  }
  
  const taxCodeResult = parseTaxCode(input.employee.taxCode);
  if (!taxCodeResult.valid) {
    errors.push(`Invalid tax code: ${input.employee.taxCode}`);
  }
  
  if (!validateNiNumber(input.employee.niNumber)) {
    errors.push(`Invalid NI number: ${input.employee.niNumber}`);
  }
  
  return errors;
}
