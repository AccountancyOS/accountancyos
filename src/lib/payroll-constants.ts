/**
 * Payroll & CIS Constants
 * Status flows and type definitions for the payroll module
 */

export const PAY_RUN_STATUSES = {
  DRAFT: 'draft',
  CALCULATED: 'calculated',
  READY_FOR_REVIEW: 'ready_for_review',
  APPROVED: 'approved',
  SUBMITTED: 'submitted',
} as const;

export type PayRunStatus = typeof PAY_RUN_STATUSES[keyof typeof PAY_RUN_STATUSES];

export const PAY_RUN_STATUS_LABELS: Record<PayRunStatus, string> = {
  draft: 'Draft',
  calculated: 'Calculated',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  submitted: 'Submitted',
};

export const PAY_RUN_STATUS_COLORS: Record<PayRunStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  calculated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ready_for_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  submitted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export const PAY_FREQUENCIES = {
  WEEKLY: 'weekly',
  FORTNIGHTLY: 'fortnightly',
  FOUR_WEEKLY: 'four_weekly',
  MONTHLY: 'monthly',
} as const;

export type PayFrequency = typeof PAY_FREQUENCIES[keyof typeof PAY_FREQUENCIES];

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  four_weekly: 'Four-Weekly',
  monthly: 'Monthly',
};

export const NI_CATEGORIES = ['A', 'B', 'C', 'F', 'H', 'I', 'J', 'L', 'M', 'S', 'V', 'Z'] as const;
export type NICategory = typeof NI_CATEGORIES[number];

export const STUDENT_LOAN_PLANS = ['none', 'plan_1', 'plan_2', 'plan_4', 'postgraduate'] as const;
export type StudentLoanPlan = typeof STUDENT_LOAN_PLANS[number];

export const STUDENT_LOAN_LABELS: Record<StudentLoanPlan, string> = {
  none: 'None',
  plan_1: 'Plan 1',
  plan_2: 'Plan 2',
  plan_4: 'Plan 4 (Scotland)',
  postgraduate: 'Postgraduate Loan',
};

// RTI Filing Types
export const RTI_FILING_TYPES = [
  'RTI_FPS',
  'RTI_EPS',
  'RTI_P45',
  'RTI_P46',
  'RTI_EYU',
] as const;

export type RTIFilingType = typeof RTI_FILING_TYPES[number];

export const RTI_FILING_LABELS: Record<RTIFilingType, string> = {
  RTI_FPS: 'Full Payment Submission (FPS)',
  RTI_EPS: 'Employer Payment Summary (EPS)',
  RTI_P45: 'P45 Leaver',
  RTI_P46: 'P46 Starter',
  RTI_EYU: 'Earlier Year Update (EYU)',
};

// CIS Return Status
export const CIS_RETURN_STATUSES = {
  DRAFT: 'draft',
  READY: 'ready',
  SUBMITTED: 'submitted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

export type CISReturnStatus = typeof CIS_RETURN_STATUSES[keyof typeof CIS_RETURN_STATUSES];

export const CIS_RETURN_STATUS_LABELS: Record<CISReturnStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to Submit',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

// CIS Deduction Rates
export const CIS_DEDUCTION_RATES = {
  GROSS: 'gross',
  STANDARD: 'standard',
  HIGHER: 'higher',
} as const;

export type CISDeductionRate = typeof CIS_DEDUCTION_RATES[keyof typeof CIS_DEDUCTION_RATES];

export const CIS_DEDUCTION_RATE_VALUES: Record<CISDeductionRate, number> = {
  gross: 0,
  standard: 0.20,
  higher: 0.30,
};

export const CIS_DEDUCTION_RATE_LABELS: Record<CISDeductionRate, string> = {
  gross: 'Gross (0%)',
  standard: 'Standard (20%)',
  higher: 'Higher (30%)',
};

// Tax years helper
export function getCurrentTaxYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  if (month > 4 || (month === 4 && day >= 6)) {
    return `${year}/${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}/${year.toString().slice(-2)}`;
}

export function getTaxYears(count: number = 5): string[] {
  const years: string[] = [];
  const currentYear = getCurrentTaxYear();
  const startYear = parseInt(currentYear.split('/')[0]);
  
  for (let i = 0; i < count; i++) {
    const y = startYear - i;
    years.push(`${y}/${(y + 1).toString().slice(-2)}`);
  }
  
  return years;
}
