/**
 * SA302 Renderer
 * Computes the SA302 tax calculation summary from canonical SADraftScheduleData.
 * The SA302 is the official HMRC tax computation statement.
 */

import type { SADraftScheduleData } from '@/types/filing-schemas';
import { computeSAScheduleTotals, canonicalToSAWorkpaperData } from './sa-schedule-engine';
import { calculateSelfAssessmentTax, type SATaxResult, type SAWorkpaperData } from './tax-calculation-engine';

export interface SA302Line {
  label: string;
  amount: number;
  indent?: number;
  bold?: boolean;
  separator?: boolean;
}

export interface SA302Section {
  title: string;
  lines: SA302Line[];
}

export interface SA302Result {
  tax_year: string;
  taxpayer_name: string;
  utr: string;
  nino: string;
  sections: SA302Section[];
  tax_result: SATaxResult;
  total_tax_due: number;
}

/**
 * Generate a full SA302 computation from canonical schedule data.
 */
export function renderSA302(draft: SADraftScheduleData): SA302Result {
  // Compute all totals first
  const computed = computeSAScheduleTotals(draft);

  // Convert to the SA workpaper format and calculate tax
  const wpData: SAWorkpaperData = canonicalToSAWorkpaperData(computed);
  const taxResult = calculateSelfAssessmentTax(wpData, draft.identity?.tax_year);

  const sections: SA302Section[] = [];

  // Section 1: Income
  const incomeLines: SA302Line[] = [];

  if (computed.employment) {
    const empTotal = (computed.employment.entries || []).reduce((s, e) => s + (e.gross_pay || 0), 0);
    if (empTotal > 0) {
      incomeLines.push({ label: 'Employment income', amount: taxResult.total_employment_income });
      const taxDeducted = (computed.employment.entries || []).reduce((s, e) => s + (e.tax_deducted || 0), 0);
      if (taxDeducted > 0) {
        incomeLines.push({ label: 'Tax deducted from employment', amount: taxDeducted, indent: 1 });
      }
    }
  }

  if (computed.self_employment) {
    incomeLines.push({ label: 'Profit from self-employment', amount: taxResult.total_self_employment_profit });
  }

  if (computed.property) {
    const propTotal = (computed.property.uk_total_profit || 0) + (computed.property.overseas_total_profit || 0);
    if (propTotal > 0) {
      incomeLines.push({ label: 'Property income', amount: propTotal });
    }
  }

  if (computed.dividends && (computed.dividends.total_dividends || 0) > 0) {
    incomeLines.push({ label: 'Dividends', amount: taxResult.total_dividends });
  }

  if ((computed.interest?.total_interest || 0) > 0) {
    incomeLines.push({ label: 'Interest and other savings income', amount: computed.interest!.total_interest });
  }

  if ((computed.pension_income?.total_pension_income || 0) > 0) {
    incomeLines.push({ label: 'Pension income', amount: computed.pension_income!.total_pension_income });
  }

  if ((computed.chargeable_event_gains?.total_gains || 0) > 0) {
    incomeLines.push({ label: 'Chargeable event gains', amount: computed.chargeable_event_gains!.total_gains });
  }

  if ((computed.trust_estate_income?.total_income || 0) > 0) {
    incomeLines.push({ label: 'Trust and estate income', amount: computed.trust_estate_income!.total_income });
  }

  incomeLines.push({ label: 'Total income', amount: taxResult.gross_income, bold: true, separator: true });

  sections.push({ title: 'Your Income', lines: incomeLines });

  // Section 2: Deductions & Allowances
  const deductionLines: SA302Line[] = [];

  if (taxResult.total_deductions > 0) {
    if (computed.reliefs?.pension_contributions_ras) {
      deductionLines.push({ label: 'Pension contributions (relief at source)', amount: computed.reliefs.pension_contributions_ras });
    }
    if (computed.reliefs?.gift_aid_payments) {
      deductionLines.push({ label: 'Gift Aid payments', amount: computed.reliefs.gift_aid_payments });
    }
    deductionLines.push({ label: 'Total deductions', amount: taxResult.total_deductions, bold: true });
  }

  deductionLines.push({ label: 'Net income', amount: taxResult.adjusted_net_income, bold: true });
  deductionLines.push({ label: 'Personal allowance', amount: taxResult.available_personal_allowance });
  if (taxResult.personal_allowance_reduction > 0) {
    deductionLines.push({ label: 'Less: Personal allowance reduction', amount: taxResult.personal_allowance_reduction, indent: 1 });
  }
  deductionLines.push({ label: 'Taxable income', amount: taxResult.taxable_income, bold: true, separator: true });

  sections.push({ title: 'Allowances & Deductions', lines: deductionLines });

  // Section 3: Tax Calculation
  const taxLines: SA302Line[] = [];

  if (taxResult.income_tax_basic > 0) {
    taxLines.push({ label: `Income tax at basic rate (20%)`, amount: taxResult.income_tax_basic });
  }
  if (taxResult.income_tax_higher > 0) {
    taxLines.push({ label: `Income tax at higher rate (40%)`, amount: taxResult.income_tax_higher });
  }
  if (taxResult.income_tax_additional > 0) {
    taxLines.push({ label: `Income tax at additional rate (45%)`, amount: taxResult.income_tax_additional });
  }
  if (taxResult.dividend_tax > 0) {
    taxLines.push({ label: 'Dividend tax', amount: taxResult.dividend_tax });
  }
  taxLines.push({ label: 'Total income tax', amount: taxResult.total_income_tax, bold: true, separator: true });

  sections.push({ title: 'Income Tax Calculation', lines: taxLines });

  // Section 4: National Insurance
  if (taxResult.total_nic > 0) {
    const nicLines: SA302Line[] = [];
    if (taxResult.class2_nic > 0) {
      nicLines.push({ label: 'Class 2 NIC', amount: taxResult.class2_nic });
    }
    if (taxResult.class4_nic > 0) {
      nicLines.push({ label: 'Class 4 NIC', amount: taxResult.class4_nic });
    }
    nicLines.push({ label: 'Total National Insurance', amount: taxResult.total_nic, bold: true });
    sections.push({ title: 'National Insurance Contributions', lines: nicLines });
  }

  // Section 5: CGT
  if (computed.cgt && (computed.cgt.taxable_gains || 0) > 0) {
    const cgtLines: SA302Line[] = [];
    cgtLines.push({ label: 'Total gains', amount: computed.cgt.total_gains });
    if (computed.cgt.total_losses > 0) {
      cgtLines.push({ label: 'Less: Losses', amount: computed.cgt.total_losses });
    }
    cgtLines.push({ label: 'Net gains', amount: computed.cgt.net_gains });
    cgtLines.push({ label: 'Annual exempt amount', amount: computed.cgt.annual_exempt_amount });
    cgtLines.push({ label: 'Taxable gains', amount: computed.cgt.taxable_gains, bold: true });
    sections.push({ title: 'Capital Gains', lines: cgtLines });
  }

  // Section 6: Summary
  const summaryLines: SA302Line[] = [];
  summaryLines.push({ label: 'Income tax', amount: taxResult.total_income_tax });
  if (taxResult.total_nic > 0) {
    summaryLines.push({ label: 'National Insurance', amount: taxResult.total_nic });
  }
  summaryLines.push({ label: 'Total tax and NIC due', amount: taxResult.total_tax_liability, bold: true, separator: true });

  // Payments on account
  if (taxResult.poa_first_payment > 0) {
    summaryLines.push({ label: `First payment on account (due ${taxResult.first_poa_date})`, amount: taxResult.poa_first_payment });
    summaryLines.push({ label: `Second payment on account (due ${taxResult.second_poa_date})`, amount: taxResult.poa_second_payment });
    summaryLines.push({ label: `Balancing payment (due ${taxResult.balancing_payment_date})`, amount: taxResult.balancing_payment });
  }

  sections.push({ title: 'Tax Calculation Summary', lines: summaryLines });

  return {
    tax_year: draft.identity?.tax_year || '',
    taxpayer_name: draft.identity?.full_name || '',
    utr: draft.identity?.utr || '',
    nino: draft.identity?.nino || '',
    sections,
    tax_result: taxResult,
    total_tax_due: taxResult.total_tax_liability,
  };
}
