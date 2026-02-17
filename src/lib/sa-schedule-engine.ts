/**
 * SA Schedule Engine
 * Canonical schedule definitions for all 13 SA Non-MTD modules.
 * Each schedule maps directly to keys in filings.draft_schedule_data_json.
 * Uses the schema-field-engine for field definitions and validation.
 */

import type { SchemaDefinition } from './schema-field-engine';
import type { SADraftScheduleData } from '@/types/filing-schemas';

// ==================== IDENTITY SECTION ====================

const identitySection: SchemaDefinition['sections'][0] = {
  key: 'identity',
  title: 'Taxpayer Identity',
  order: 0,
  optional: false,
  fields: [
    { key: 'identity.full_name', label: 'Full Name', type: 'text', source: 'auto_populated', readonly: true, show_in_summary: true, validations: [{ type: 'required', message: 'Full name is required' }] },
    { key: 'identity.nino', label: 'National Insurance Number', type: 'text', source: 'auto_populated', readonly: true, help: 'Format: AB123456C', validations: [{ type: 'required', message: 'NINO is required' }, { type: 'pattern', value: '^[A-Z]{2}\\d{6}[A-D]$', message: 'Invalid NINO format' }] },
    { key: 'identity.utr', label: 'Unique Taxpayer Reference', type: 'text', source: 'auto_populated', readonly: true, help: '10-digit UTR', validations: [{ type: 'required', message: 'UTR is required' }, { type: 'pattern', value: '^\\d{10}$', message: 'UTR must be 10 digits' }] },
    { key: 'identity.date_of_birth', label: 'Date of Birth', type: 'date', source: 'auto_populated', readonly: true },
    { key: 'identity.address', label: 'Address', type: 'text', source: 'auto_populated', readonly: true },
    { key: 'identity.tax_year', label: 'Tax Year', type: 'text', source: 'auto_populated', readonly: true, show_in_summary: true },
  ],
};

// ==================== EMPLOYMENT ====================

const employmentSection: SchemaDefinition['sections'][0] = {
  key: 'employment',
  title: 'Employment Income',
  order: 1,
  optional: true,
  fields: [
    {
      key: 'employment.entries',
      label: 'Employment Records',
      type: 'table_grid',
      columns: [
        { key: 'employer_name', label: 'Employer Name', type: 'text' },
        { key: 'employer_paye_ref', label: 'PAYE Reference', type: 'text' },
        { key: 'gross_pay', label: 'Gross Pay', type: 'money' },
        { key: 'tax_deducted', label: 'Tax Deducted', type: 'money' },
        { key: 'benefits_in_kind', label: 'Benefits in Kind', type: 'money' },
        { key: 'employee_pension_contributions', label: 'Pension Contributions', type: 'money' },
        { key: 'expenses', label: 'Expenses', type: 'money' },
        { key: 'is_p45', label: 'P45?', type: 'boolean' },
        { key: 'leaving_date', label: 'Leaving Date', type: 'date' },
      ],
    },
  ],
};

// ==================== SELF EMPLOYMENT ====================

const selfEmploymentSection: SchemaDefinition['sections'][0] = {
  key: 'self_employment',
  title: 'Self-Employment',
  order: 2,
  optional: true,
  fields: [
    { key: 'self_employment.business_name', label: 'Business Name', type: 'text', validations: [{ type: 'required', message: 'Business name is required' }] },
    { key: 'self_employment.business_description', label: 'Business Description', type: 'text' },
    { key: 'self_employment.utr', label: 'Business UTR', type: 'text' },
    { key: 'self_employment.accounting_period_start', label: 'Accounting Period Start', type: 'date', validations: [{ type: 'required', message: 'Period start is required' }] },
    { key: 'self_employment.accounting_period_end', label: 'Accounting Period End', type: 'date', validations: [{ type: 'required', message: 'Period end is required' }] },
    { key: 'self_employment.turnover', label: 'Turnover', type: 'money', show_in_summary: true, computation_key: 'se_turnover' },
    { key: 'self_employment.other_business_income', label: 'Other Business Income', type: 'money' },
    // Expenses
    { key: 'self_employment.cost_of_goods', label: 'Cost of Goods', type: 'money' },
    { key: 'self_employment.wages_salaries', label: 'Wages & Salaries', type: 'money' },
    { key: 'self_employment.premises_costs', label: 'Premises Costs', type: 'money' },
    { key: 'self_employment.repairs_maintenance', label: 'Repairs & Maintenance', type: 'money' },
    { key: 'self_employment.general_admin', label: 'General Admin', type: 'money' },
    { key: 'self_employment.motor_expenses', label: 'Motor Expenses', type: 'money' },
    { key: 'self_employment.travel_subsistence', label: 'Travel & Subsistence', type: 'money' },
    { key: 'self_employment.advertising', label: 'Advertising', type: 'money' },
    { key: 'self_employment.entertainment', label: 'Entertainment', type: 'money' },
    { key: 'self_employment.legal_professional', label: 'Legal & Professional', type: 'money' },
    { key: 'self_employment.interest_bank_charges', label: 'Interest & Bank Charges', type: 'money' },
    { key: 'self_employment.accountancy_fees', label: 'Accountancy Fees', type: 'money' },
    { key: 'self_employment.depreciation', label: 'Depreciation', type: 'money' },
    { key: 'self_employment.other_expenses', label: 'Other Expenses', type: 'money' },
    { key: 'self_employment.total_expenses', label: 'Total Expenses', type: 'money', readonly: true, source: 'computed', computation_key: 'se_total_expenses' },
    { key: 'self_employment.net_profit', label: 'Net Profit', type: 'money', readonly: true, source: 'computed', show_in_summary: true, computation_key: 'se_net_profit' },
    // Capital allowances & adjustments
    { key: 'self_employment.capital_allowances', label: 'Capital Allowances', type: 'money' },
    { key: 'self_employment.balancing_charges', label: 'Balancing Charges', type: 'money' },
    { key: 'self_employment.goods_for_personal_use', label: 'Goods for Personal Use', type: 'money' },
    // Losses
    { key: 'self_employment.loss_brought_forward', label: 'Loss Brought Forward', type: 'money' },
    { key: 'self_employment.loss_carry_back_claim', label: 'Loss Carry Back Claim', type: 'money' },
    { key: 'self_employment.loss_carry_forward', label: 'Loss Carry Forward', type: 'money', readonly: true, source: 'computed' },
    { key: 'self_employment.adjusted_profit', label: 'Adjusted Profit', type: 'money', readonly: true, source: 'computed', show_in_summary: true, computation_key: 'se_adjusted_profit' },
  ],
};

// ==================== PROPERTY ====================

const propertySection: SchemaDefinition['sections'][0] = {
  key: 'property',
  title: 'Property Income',
  order: 3,
  optional: true,
  fields: [
    { key: 'property.uk_properties', label: 'UK Properties', type: 'table_grid', columns: [
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'is_furnished_holiday_let', label: 'FHL?', type: 'boolean' },
      { key: 'rent_received', label: 'Rent Received', type: 'money' },
      { key: 'insurance', label: 'Insurance', type: 'money' },
      { key: 'repairs_maintenance', label: 'Repairs', type: 'money' },
      { key: 'management_fees', label: 'Management Fees', type: 'money' },
      { key: 'mortgage_interest', label: 'Mortgage Interest', type: 'money' },
      { key: 'other_finance_costs', label: 'Other Finance', type: 'money' },
      { key: 'legal_professional', label: 'Legal & Professional', type: 'money' },
      { key: 'other_expenses', label: 'Other Expenses', type: 'money' },
      { key: 'total_expenses', label: 'Total Expenses', type: 'money' },
      { key: 'net_profit', label: 'Net Profit', type: 'money' },
    ]},
    { key: 'property.overseas_properties', label: 'Overseas Properties', type: 'table_grid', columns: [
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'rent_received', label: 'Rent Received', type: 'money' },
      { key: 'insurance', label: 'Insurance', type: 'money' },
      { key: 'repairs_maintenance', label: 'Repairs', type: 'money' },
      { key: 'management_fees', label: 'Management Fees', type: 'money' },
      { key: 'mortgage_interest', label: 'Mortgage Interest', type: 'money' },
      { key: 'other_finance_costs', label: 'Other Finance', type: 'money' },
      { key: 'legal_professional', label: 'Legal & Professional', type: 'money' },
      { key: 'other_expenses', label: 'Other Expenses', type: 'money' },
      { key: 'total_expenses', label: 'Total Expenses', type: 'money' },
      { key: 'net_profit', label: 'Net Profit', type: 'money' },
    ]},
    { key: 'property.uk_total_profit', label: 'UK Total Profit', type: 'money', readonly: true, source: 'computed', show_in_summary: true },
    { key: 'property.overseas_total_profit', label: 'Overseas Total Profit', type: 'money', readonly: true, source: 'computed' },
    { key: 'property.mortgage_interest_restriction', label: 'Mortgage Interest Restriction', type: 'money', help: 'Finance cost restriction (Section 24)' },
    { key: 'property.basic_rate_tax_reduction', label: 'Basic Rate Tax Reduction', type: 'money', readonly: true, source: 'computed' },
  ],
};

// ==================== DIVIDENDS ====================

const dividendsSection: SchemaDefinition['sections'][0] = {
  key: 'dividends',
  title: 'Dividends',
  order: 4,
  optional: true,
  fields: [
    { key: 'dividends.uk_dividends', label: 'UK Dividends', type: 'money', show_in_summary: true },
    { key: 'dividends.foreign_dividends', label: 'Foreign Dividends', type: 'money' },
    { key: 'dividends.foreign_tax_paid', label: 'Foreign Tax Paid', type: 'money' },
    { key: 'dividends.total_dividends', label: 'Total Dividends', type: 'money', readonly: true, source: 'computed', show_in_summary: true, computation_key: 'total_dividends' },
  ],
};

// ==================== INTEREST ====================

const interestSection: SchemaDefinition['sections'][0] = {
  key: 'interest',
  title: 'Interest Income',
  order: 5,
  optional: true,
  fields: [
    { key: 'interest.uk_bank_interest', label: 'UK Bank Interest', type: 'money' },
    { key: 'interest.uk_building_society_interest', label: 'UK Building Society Interest', type: 'money' },
    { key: 'interest.uk_other_interest', label: 'UK Other Interest', type: 'money' },
    { key: 'interest.foreign_interest', label: 'Foreign Interest', type: 'money' },
    { key: 'interest.foreign_tax_paid', label: 'Foreign Tax Paid', type: 'money' },
    { key: 'interest.total_interest', label: 'Total Interest', type: 'money', readonly: true, source: 'computed', show_in_summary: true },
  ],
};

// ==================== UNIT TRUST INCOME ====================

const unitTrustSection: SchemaDefinition['sections'][0] = {
  key: 'unit_trust_income',
  title: 'Unit Trust Income',
  order: 6,
  optional: true,
  fields: [
    { key: 'unit_trust_income.unit_trust_interest', label: 'Unit Trust Interest', type: 'money' },
    { key: 'unit_trust_income.unit_trust_dividends', label: 'Unit Trust Dividends', type: 'money' },
    { key: 'unit_trust_income.total_unit_trust_income', label: 'Total', type: 'money', readonly: true, source: 'computed' },
  ],
};

// ==================== PENSION INCOME ====================

const pensionSection: SchemaDefinition['sections'][0] = {
  key: 'pension_income',
  title: 'Pension Income',
  order: 7,
  optional: true,
  fields: [
    { key: 'pension_income.state_pension', label: 'State Pension', type: 'money' },
    { key: 'pension_income.state_pension_lump_sum', label: 'State Pension Lump Sum', type: 'money' },
    { key: 'pension_income.private_pensions', label: 'Private Pensions', type: 'money' },
    { key: 'pension_income.private_pension_tax_deducted', label: 'Tax Deducted from Private Pensions', type: 'money' },
    { key: 'pension_income.foreign_pensions', label: 'Foreign Pensions', type: 'money' },
    { key: 'pension_income.total_pension_income', label: 'Total Pension Income', type: 'money', readonly: true, source: 'computed', show_in_summary: true },
  ],
};

// ==================== CHARGEABLE EVENT GAINS ====================

const chargeableEventsSection: SchemaDefinition['sections'][0] = {
  key: 'chargeable_event_gains',
  title: 'Chargeable Event Gains',
  order: 8,
  optional: true,
  fields: [
    { key: 'chargeable_event_gains.events', label: 'Events', type: 'table_grid', columns: [
      { key: 'insurer_name', label: 'Insurer', type: 'text' },
      { key: 'policy_number', label: 'Policy Number', type: 'text' },
      { key: 'gain', label: 'Gain', type: 'money' },
      { key: 'years_held', label: 'Years Held', type: 'number' },
      { key: 'tax_treated_as_paid', label: 'Tax Treated As Paid', type: 'money' },
      { key: 'deficiency_relief_available', label: 'Deficiency Relief?', type: 'boolean' },
    ]},
    { key: 'chargeable_event_gains.total_gains', label: 'Total Gains', type: 'money', readonly: true, source: 'computed' },
    { key: 'chargeable_event_gains.total_tax_treated_as_paid', label: 'Total Tax Treated As Paid', type: 'money', readonly: true, source: 'computed' },
  ],
};

// ==================== TRUST & ESTATE INCOME ====================

const trustEstateSection: SchemaDefinition['sections'][0] = {
  key: 'trust_estate_income',
  title: 'Trust & Estate Income',
  order: 9,
  optional: true,
  fields: [
    { key: 'trust_estate_income.entries', label: 'Trust/Estate Entries', type: 'table_grid', columns: [
      { key: 'trust_name', label: 'Trust Name', type: 'text' },
      { key: 'income_type', label: 'Type', type: 'enum', enum_options: [{ value: 'income', label: 'Income' }, { value: 'capital', label: 'Capital' }] },
      { key: 'gross_amount', label: 'Gross Amount', type: 'money' },
      { key: 'tax_paid', label: 'Tax Paid', type: 'money' },
      { key: 'net_amount', label: 'Net Amount', type: 'money' },
    ]},
    { key: 'trust_estate_income.total_income', label: 'Total Income', type: 'money', readonly: true, source: 'computed' },
    { key: 'trust_estate_income.total_tax_paid', label: 'Total Tax Paid', type: 'money', readonly: true, source: 'computed' },
  ],
};

// ==================== CGT ====================

const cgtSection: SchemaDefinition['sections'][0] = {
  key: 'cgt',
  title: 'Capital Gains Tax',
  order: 10,
  optional: true,
  fields: [
    { key: 'cgt.disposals', label: 'Disposals', type: 'table_grid', columns: [
      { key: 'asset_description', label: 'Asset', type: 'text' },
      { key: 'asset_type', label: 'Type', type: 'enum', enum_options: [
        { value: 'property', label: 'Property' }, { value: 'shares', label: 'Shares' },
        { value: 'crypto', label: 'Crypto' }, { value: 'other', label: 'Other' },
      ]},
      { key: 'acquisition_date', label: 'Acquired', type: 'date' },
      { key: 'disposal_date', label: 'Disposed', type: 'date' },
      { key: 'disposal_proceeds', label: 'Proceeds', type: 'money' },
      { key: 'allowable_costs', label: 'Costs', type: 'money' },
      { key: 'gain_or_loss', label: 'Gain/Loss', type: 'money' },
      { key: 'is_residential_property', label: 'Residential?', type: 'boolean' },
      { key: 'token_symbol', label: 'Token', type: 'text' },
    ]},
    { key: 'cgt.total_gains', label: 'Total Gains', type: 'money', readonly: true, source: 'computed', show_in_summary: true },
    { key: 'cgt.total_losses', label: 'Total Losses', type: 'money', readonly: true, source: 'computed' },
    { key: 'cgt.net_gains', label: 'Net Gains', type: 'money', readonly: true, source: 'computed' },
    { key: 'cgt.annual_exempt_amount', label: 'Annual Exempt Amount', type: 'money', readonly: true, source: 'auto_populated' },
    { key: 'cgt.taxable_gains', label: 'Taxable Gains', type: 'money', readonly: true, source: 'computed', show_in_summary: true },
    { key: 'cgt.losses_brought_forward_used', label: 'Losses B/F Used', type: 'money' },
    { key: 'cgt.losses_carried_forward', label: 'Losses C/F', type: 'money', readonly: true, source: 'computed' },
    { key: 'cgt.crypto_disposals_count', label: 'Crypto Disposals Count', type: 'number', readonly: true, source: 'computed' },
    { key: 'cgt.crypto_total_gains', label: 'Crypto Total Gains', type: 'money', readonly: true, source: 'computed' },
  ],
};

// ==================== RELIEFS ====================

const reliefsSection: SchemaDefinition['sections'][0] = {
  key: 'reliefs',
  title: 'Reliefs & Deductions',
  order: 11,
  optional: true,
  fields: [
    { key: 'reliefs.gift_aid_payments', label: 'Gift Aid Payments', type: 'money' },
    { key: 'reliefs.gift_aid_carry_back', label: 'Gift Aid Carry Back', type: 'money' },
    { key: 'reliefs.pension_contributions_ras', label: 'Pension Contributions (RAS)', type: 'money', help: 'Relief at Source' },
    { key: 'reliefs.pension_contributions_net_pay', label: 'Pension Contributions (Net Pay)', type: 'money' },
    { key: 'reliefs.eis_relief', label: 'EIS Relief', type: 'money' },
    { key: 'reliefs.seis_relief', label: 'SEIS Relief', type: 'money' },
    { key: 'reliefs.vct_relief', label: 'VCT Relief', type: 'money' },
    { key: 'reliefs.community_investment_relief', label: 'Community Investment Relief', type: 'money' },
    { key: 'reliefs.other_reliefs', label: 'Other Reliefs', type: 'money' },
    { key: 'reliefs.total_reliefs', label: 'Total Reliefs', type: 'money', readonly: true, source: 'computed', show_in_summary: true },
  ],
};

// ==================== ADJUSTMENTS ====================

const adjustmentsSection: SchemaDefinition['sections'][0] = {
  key: 'adjustments',
  title: 'Adjustments & Additional Charges',
  order: 12,
  optional: true,
  fields: [
    { key: 'adjustments.student_loan_plan_type', label: 'Student Loan Plan Types', type: 'enum', enum_options: [
      { value: 'plan1', label: 'Plan 1' }, { value: 'plan2', label: 'Plan 2' },
      { value: 'plan4', label: 'Plan 4' }, { value: 'plan5', label: 'Plan 5' },
      { value: 'postgrad', label: 'Postgraduate' },
    ]},
    { key: 'adjustments.student_loan_deductions', label: 'Student Loan Deductions', type: 'money', readonly: true, source: 'computed' },
    { key: 'adjustments.hicbc_applicable', label: 'HICBC Applicable', type: 'boolean' },
    { key: 'adjustments.hicbc_charge', label: 'HICBC Charge', type: 'money', readonly: true, source: 'computed' },
    { key: 'adjustments.marriage_allowance_transfer', label: 'Marriage Allowance', type: 'enum', enum_options: [
      { value: 'none', label: 'None' }, { value: 'transfer_to_spouse', label: 'Transfer to Spouse' },
      { value: 'receive_from_spouse', label: 'Receive from Spouse' },
    ]},
    { key: 'adjustments.marriage_allowance_amount', label: 'Marriage Allowance Amount', type: 'money', readonly: true, source: 'computed' },
    { key: 'adjustments.underpaid_tax_coded_out', label: 'Underpaid Tax Coded Out', type: 'money' },
    { key: 'adjustments.poa_reduction_claimed', label: 'PoA Reduction Claimed', type: 'money' },
    { key: 'adjustments.poa_first_payment', label: 'First Payment on Account', type: 'money', readonly: true, source: 'computed' },
    { key: 'adjustments.poa_second_payment', label: 'Second Payment on Account', type: 'money', readonly: true, source: 'computed' },
    { key: 'adjustments.annual_allowance_charge', label: 'Pension Annual Allowance Charge', type: 'money' },
    { key: 'adjustments.scheme_pays_election', label: 'Scheme Pays Election', type: 'boolean' },
  ],
};

// ==================== FULL SA SCHEMA ====================

export const SA_NON_MTD_SCHEMA: SchemaDefinition = {
  schema_id: 'sa_non_mtd',
  name: 'SA Non-MTD Tax Return',
  version: '1.0',
  sections: [
    identitySection,
    employmentSection,
    selfEmploymentSection,
    propertySection,
    dividendsSection,
    interestSection,
    unitTrustSection,
    pensionSection,
    chargeableEventsSection,
    trustEstateSection,
    cgtSection,
    reliefsSection,
    adjustmentsSection,
  ],
};

// ==================== SCHEDULE KEYS ====================

/** List of all optional schedule module keys for toggling in the UI */
export const SA_SCHEDULE_MODULE_KEYS = [
  'employment',
  'self_employment',
  'property',
  'dividends',
  'interest',
  'unit_trust_income',
  'pension_income',
  'chargeable_event_gains',
  'trust_estate_income',
  'cgt',
  'reliefs',
  'adjustments',
] as const;

export type SAScheduleModuleKey = typeof SA_SCHEDULE_MODULE_KEYS[number];

// ==================== COMPUTATION HELPERS ====================

/**
 * Compute derived/totals fields from raw schedule data.
 * This is a pure function — no side effects, no DB calls.
 */
export function computeSAScheduleTotals(draft: SADraftScheduleData): SADraftScheduleData {
  const result = { ...draft };

  // Self-employment totals
  if (result.self_employment) {
    const se = { ...result.self_employment };
    se.total_expenses =
      (se.cost_of_goods || 0) + (se.wages_salaries || 0) + (se.premises_costs || 0) +
      (se.repairs_maintenance || 0) + (se.general_admin || 0) + (se.motor_expenses || 0) +
      (se.travel_subsistence || 0) + (se.advertising || 0) + (se.entertainment || 0) +
      (se.legal_professional || 0) + (se.interest_bank_charges || 0) + (se.accountancy_fees || 0) +
      (se.depreciation || 0) + (se.other_expenses || 0);
    se.net_profit = (se.turnover || 0) + (se.other_business_income || 0) - se.total_expenses;
    se.adjusted_profit = Math.max(0,
      se.net_profit + (se.balancing_charges || 0) + (se.goods_for_personal_use || 0) -
      (se.capital_allowances || 0) - (se.loss_brought_forward || 0)
    );
    se.loss_carry_forward = se.adjusted_profit <= 0 ? Math.abs(se.net_profit - (se.capital_allowances || 0)) : 0;
    result.self_employment = se;
  }

  // Dividends total
  if (result.dividends) {
    const d = { ...result.dividends };
    d.total_dividends = (d.uk_dividends || 0) + (d.foreign_dividends || 0);
    result.dividends = d;
  }

  // Interest total
  if (result.interest) {
    const i = { ...result.interest };
    i.total_interest = (i.uk_bank_interest || 0) + (i.uk_building_society_interest || 0) +
      (i.uk_other_interest || 0) + (i.foreign_interest || 0);
    result.interest = i;
  }

  // Unit trust total
  if (result.unit_trust_income) {
    const u = { ...result.unit_trust_income };
    u.total_unit_trust_income = (u.unit_trust_interest || 0) + (u.unit_trust_dividends || 0);
    result.unit_trust_income = u;
  }

  // Pension total
  if (result.pension_income) {
    const p = { ...result.pension_income };
    p.total_pension_income = (p.state_pension || 0) + (p.state_pension_lump_sum || 0) +
      (p.private_pensions || 0) + (p.foreign_pensions || 0);
    result.pension_income = p;
  }

  // Chargeable events totals
  if (result.chargeable_event_gains) {
    const ceg = { ...result.chargeable_event_gains };
    ceg.total_gains = (ceg.events || []).reduce((sum, e) => sum + (e.gain || 0), 0);
    ceg.total_tax_treated_as_paid = (ceg.events || []).reduce((sum, e) => sum + (e.tax_treated_as_paid || 0), 0);
    result.chargeable_event_gains = ceg;
  }

  // Trust estate totals
  if (result.trust_estate_income) {
    const te = { ...result.trust_estate_income };
    te.total_income = (te.entries || []).reduce((sum, e) => sum + (e.gross_amount || 0), 0);
    te.total_tax_paid = (te.entries || []).reduce((sum, e) => sum + (e.tax_paid || 0), 0);
    result.trust_estate_income = te;
  }

  // CGT totals
  if (result.cgt) {
    const c = { ...result.cgt };
    const disposals = c.disposals || [];
    c.total_gains = disposals.filter(d => d.gain_or_loss > 0).reduce((s, d) => s + d.gain_or_loss, 0);
    c.total_losses = Math.abs(disposals.filter(d => d.gain_or_loss < 0).reduce((s, d) => s + d.gain_or_loss, 0));
    c.net_gains = c.total_gains - c.total_losses;
    c.taxable_gains = Math.max(0, c.net_gains - (c.annual_exempt_amount || 0) - (c.losses_brought_forward_used || 0));
    c.losses_carried_forward = c.total_losses > c.total_gains ? c.total_losses - c.total_gains : 0;
    c.crypto_disposals_count = disposals.filter(d => d.asset_type === 'crypto').length;
    c.crypto_total_gains = disposals.filter(d => d.asset_type === 'crypto' && d.gain_or_loss > 0).reduce((s, d) => s + d.gain_or_loss, 0);
    result.cgt = c;
  }

  // Property totals
  if (result.property) {
    const p = { ...result.property };
    p.uk_total_profit = (p.uk_properties || []).reduce((s, prop) => s + (prop.net_profit || 0), 0);
    p.overseas_total_profit = (p.overseas_properties || []).reduce((s, prop) => s + (prop.net_profit || 0), 0);
    p.basic_rate_tax_reduction = (p.mortgage_interest_restriction || 0) * 0.2;
    result.property = p;
  }

  // Reliefs total
  if (result.reliefs) {
    const r = { ...result.reliefs };
    r.total_reliefs = (r.gift_aid_payments || 0) + (r.gift_aid_carry_back || 0) +
      (r.pension_contributions_ras || 0) + (r.pension_contributions_net_pay || 0) +
      (r.eis_relief || 0) + (r.seis_relief || 0) + (r.vct_relief || 0) +
      (r.community_investment_relief || 0) + (r.other_reliefs || 0);
    result.reliefs = r;
  }

  return result;
}

/**
 * Convert canonical SADraftScheduleData into the SAWorkpaperData format
 * consumed by calculateSelfAssessmentTax().
 */
export function canonicalToSAWorkpaperData(draft: SADraftScheduleData): {
  employment_income: number;
  benefits_in_kind: number;
  employment_expenses: number;
  self_employment_profit: number;
  dividends: number;
  bank_interest: number;
  property_income: number;
  other_income: number;
  pension_contributions: number;
  gift_aid: number;
} {
  const empEntries = draft.employment?.entries || [];
  const employment_income = empEntries.reduce((s, e) => s + (e.gross_pay || 0), 0);
  const benefits_in_kind = empEntries.reduce((s, e) => s + (e.benefits_in_kind || 0), 0);
  const employment_expenses = empEntries.reduce((s, e) => s + (e.expenses || 0) + (e.employee_pension_contributions || 0), 0);

  return {
    employment_income,
    benefits_in_kind,
    employment_expenses,
    self_employment_profit: draft.self_employment?.adjusted_profit || 0,
    dividends: draft.dividends?.total_dividends || 0,
    bank_interest: (draft.interest?.total_interest || 0),
    property_income: (draft.property?.uk_total_profit || 0) + (draft.property?.overseas_total_profit || 0),
    other_income:
      (draft.unit_trust_income?.total_unit_trust_income || 0) +
      (draft.pension_income?.total_pension_income || 0) +
      (draft.chargeable_event_gains?.total_gains || 0) +
      (draft.trust_estate_income?.total_income || 0),
    pension_contributions: draft.reliefs?.pension_contributions_ras || 0,
    gift_aid: draft.reliefs?.gift_aid_payments || 0,
  };
}
