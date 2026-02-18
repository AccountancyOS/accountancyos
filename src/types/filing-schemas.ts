/**
 * Filing Schemas — TypeScript interfaces for all canonical schedule keys.
 * These define the shape of filings.draft_schedule_data_json
 * and filing_model_snapshots.snapshot_data.
 */

// ==================== COMMON ====================

export interface MoneyField {
  amount: number;
  source?: 'manual' | 'computed' | 'auto_populated';
  overridden?: boolean;
  override_reason?: string;
}

// ==================== SA EMPLOYMENT ====================

export interface EmploymentEntry {
  employer_name: string;
  employer_paye_ref?: string;
  gross_pay: number;
  tax_deducted: number;
  benefits_in_kind: number;
  employee_pension_contributions: number;
  expenses: number;
  is_p45?: boolean;
  leaving_date?: string;
}

export interface EmploymentSchedule {
  entries: EmploymentEntry[];
}

// ==================== SA SELF EMPLOYMENT ====================

export interface SelfEmploymentSchedule {
  business_name: string;
  business_description?: string;
  utr?: string;
  accounting_period_start: string;
  accounting_period_end: string;
  turnover: number;
  other_business_income: number;
  // Categorised expenses
  cost_of_goods: number;
  wages_salaries: number;
  premises_costs: number;
  repairs_maintenance: number;
  general_admin: number;
  motor_expenses: number;
  travel_subsistence: number;
  advertising: number;
  entertainment: number;
  legal_professional: number;
  interest_bank_charges: number;
  accountancy_fees: number;
  depreciation: number;
  other_expenses: number;
  total_expenses: number;
  net_profit: number;
  // Capital allowances
  capital_allowances: number;
  // Adjustments
  balancing_charges: number;
  goods_for_personal_use: number;
  // Loss handling
  loss_brought_forward: number;
  loss_carry_back_claim: number;
  loss_carry_forward: number;
  adjusted_profit: number;
}

// ==================== SA PROPERTY ====================

export interface PropertyEntry {
  address: string;
  is_furnished_holiday_let?: boolean;
  rent_received: number;
  // Expenses
  insurance: number;
  repairs_maintenance: number;
  management_fees: number;
  mortgage_interest: number;
  other_finance_costs: number;
  legal_professional: number;
  other_expenses: number;
  total_expenses: number;
  net_profit: number;
}

export interface PropertySchedule {
  uk_properties: PropertyEntry[];
  overseas_properties: PropertyEntry[];
  uk_total_profit: number;
  overseas_total_profit: number;
  mortgage_interest_restriction: number;
  basic_rate_tax_reduction: number;
}

// ==================== SA DIVIDENDS ====================

export interface DividendsSchedule {
  uk_dividends: number;
  foreign_dividends: number;
  foreign_tax_paid: number;
  total_dividends: number;
}

// ==================== SA INTEREST ====================

export interface InterestSchedule {
  uk_bank_interest: number;
  uk_building_society_interest: number;
  uk_other_interest: number;
  foreign_interest: number;
  foreign_tax_paid: number;
  total_interest: number;
}

// ==================== SA UNIT TRUST INCOME ====================

export interface UnitTrustIncomeSchedule {
  unit_trust_interest: number;
  unit_trust_dividends: number;
  total_unit_trust_income: number;
}

// ==================== SA PENSION INCOME ====================

export interface PensionIncomeSchedule {
  state_pension: number;
  state_pension_lump_sum: number;
  private_pensions: number;
  private_pension_tax_deducted: number;
  foreign_pensions: number;
  total_pension_income: number;
}

// ==================== SA CHARGEABLE EVENT GAINS ====================

export interface ChargeableEventEntry {
  insurer_name: string;
  policy_number: string;
  gain: number;
  years_held: number;
  tax_treated_as_paid: number;
  deficiency_relief_available: boolean;
}

export interface ChargeableEventGainsSchedule {
  events: ChargeableEventEntry[];
  total_gains: number;
  total_tax_treated_as_paid: number;
}

// ==================== SA TRUST & ESTATE INCOME ====================

export interface TrustEstateEntry {
  trust_name: string;
  income_type: 'income' | 'capital';
  gross_amount: number;
  tax_paid: number;
  net_amount: number;
}

export interface TrustEstateIncomeSchedule {
  entries: TrustEstateEntry[];
  total_income: number;
  total_tax_paid: number;
}

// ==================== SA CGT ====================

export interface CGTDisposalEntry {
  asset_description: string;
  asset_type: 'property' | 'shares' | 'crypto' | 'other';
  acquisition_date: string;
  disposal_date: string;
  disposal_proceeds: number;
  allowable_costs: number;
  gain_or_loss: number;
  is_residential_property: boolean;
  token_symbol?: string;
}

export interface CGTSchedule {
  disposals: CGTDisposalEntry[];
  total_gains: number;
  total_losses: number;
  net_gains: number;
  annual_exempt_amount: number;
  taxable_gains: number;
  losses_brought_forward_used: number;
  losses_carried_forward: number;
  // Crypto-specific
  crypto_disposals_count: number;
  crypto_total_gains: number;
}

// ==================== SA RELIEFS ====================

export interface ReliefsSchedule {
  gift_aid_payments: number;
  gift_aid_carry_back: number;
  pension_contributions_ras: number;
  pension_contributions_net_pay: number;
  eis_relief: number;
  seis_relief: number;
  vct_relief: number;
  community_investment_relief: number;
  other_reliefs: number;
  total_reliefs: number;
}

// ==================== SA ADJUSTMENTS ====================

export interface AdjustmentsSchedule {
  // Student loans
  student_loan_plan_type: ('plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgrad')[];
  student_loan_deductions: number;
  // HICBC
  hicbc_applicable: boolean;
  hicbc_charge: number;
  // Marriage allowance
  marriage_allowance_transfer: 'none' | 'transfer_to_spouse' | 'receive_from_spouse';
  marriage_allowance_amount: number;
  // Coding adjustments
  underpaid_tax_coded_out: number;
  // PoA
  poa_reduction_claimed: number;
  poa_first_payment: number;
  poa_second_payment: number;
  // Pension AA
  annual_allowance_charge: number;
  scheme_pays_election: boolean;
}

// ==================== FULL SA DRAFT ====================

export interface SADraftScheduleData {
  // Identity (auto-populated from client record)
  identity: {
    full_name: string;
    nino: string;
    utr: string;
    date_of_birth: string;
    address: string;
    tax_year: string;
  };
  // Schedule modules
  employment?: EmploymentSchedule;
  self_employment?: SelfEmploymentSchedule;
  property?: PropertySchedule;
  dividends?: DividendsSchedule;
  interest?: InterestSchedule;
  unit_trust_income?: UnitTrustIncomeSchedule;
  pension_income?: PensionIncomeSchedule;
  chargeable_event_gains?: ChargeableEventGainsSchedule;
  trust_estate_income?: TrustEstateIncomeSchedule;
  cgt?: CGTSchedule;
  reliefs?: ReliefsSchedule;
  adjustments?: AdjustmentsSchedule;
}

// ==================== CT600 DRAFT ====================

export interface CTAddBackEntry {
  account_code: string;
  account_name: string;
  amount: number;
  category: string;
  auto_detected: boolean;
  overridden: boolean;
  override_reason?: string;
}

export interface CTLossesSchedule {
  losses_brought_forward: number;
  losses_used_current_period: number;
  losses_carried_back: number;
  losses_carried_forward: number;
  loss_carry_back_claim_amount: number;
}

export interface RDClaimSchedule {
  scheme: 'sme' | 'rdec';
  // Qualifying cost categories
  staff_costs: number;
  subcontractor_costs: number;
  consumables: number;
  software: number;
  clinical_trial_volunteers: number;
  // Restrictions
  subsidised_expenditure: number;
  connected_party_subcontractor_restriction: number;
  // Computed
  total_qualifying_expenditure: number;
  enhancement_rate: number;
  additional_deduction: number;
  tax_credit: number;
  // Evidence
  evidence_artifact_ids: string[];
}

export interface CT600DraftScheduleData {
  // Company info
  company: {
    company_name: string;
    company_number: string;
    utr: string;
    period_start: string;
    period_end: string;
    associated_companies_count: number;
  };
  // From accounts
  accounting_profit: number;
  // Add-backs
  add_backs: CTAddBackEntry[];
  total_add_backs: number;
  // Capital allowances (reference to CA engine output)
  capital_allowances_total: number;
  // Trading profit
  trading_profit: number;
  // Other income
  property_income: number;
  chargeable_gains: number;
  // Deductions
  qualifying_donations: number;
  // Losses
  losses?: CTLossesSchedule;
  // R&D
  rd_claim?: RDClaimSchedule;
  // Computed outputs
  profits_chargeable: number;
  ct_liability: number;
  marginal_relief: number;
  ct_payable: number;
  // Linked filing refs
  linked_accounts_filing_id?: string;
  linked_tb_snapshot_version?: number;
}

// ==================== FRS105 ACCOUNTS DRAFT ====================

// --- Balance Sheet Line with Provenance ---

export interface BalanceSheetLineValue {
  amount: number;
  source: 'derived' | 'manual_override';
  override_reason?: string;
}

// --- Structured Disclosure Types (no generic blobs) ---

export type DisclosureStatus = 'complete' | 'required_missing' | 'not_required' | 'locked';

export interface DisclosureStatementOfCompliance {
  text: string; // system-generated, locked
  status: 'locked';
}

export interface DisclosureAverageEmployees {
  count: number; // >= 0
  source: 'payroll' | 'manual';
  confirmed: boolean;
  status: DisclosureStatus;
}

export interface DirectorsAdvanceEntry {
  director_name: string;
  opening_balance: number;
  movement: number;
  closing_balance: number;
  interest_rate: number | null; // null only if zero interest
  terms_narrative?: string; // sanitised
}

export interface DisclosureDirectorsAdvances {
  entries: DirectorsAdvanceEntry[];
  confirmed_none: boolean;
  accountant_affirmation?: boolean; // required when no ledger data
  status: DisclosureStatus;
  requirement_reason?: string;
}

export interface DividendEntry {
  amount: number;
  date: string;
  type: 'interim' | 'final' | 'special';
}

export interface DisclosureDividends {
  entries: DividendEntry[];
  confirmed_none: boolean;
  status: DisclosureStatus;
  requirement_reason?: string;
}

export interface RelatedPartyEntry {
  relationship: string;
  description: string;
  amount: number;
  balance: number;
  terms_narrative?: string; // sanitised
}

export interface DisclosureRelatedParty {
  entries: RelatedPartyEntry[];
  confirmed_none: boolean;
  status: DisclosureStatus;
  requirement_reason?: string;
}

export interface CommitmentEntry {
  category: 'capital_commitment' | 'lease_commitment' | 'guarantee' | 'contingent_liability' | 'other';
  amount: number;
  narrative?: string; // sanitised
}

export interface DisclosureCommitments {
  entries: CommitmentEntry[];
  confirmed_none: boolean;
  status: DisclosureStatus;
  requirement_reason?: string;
}

export interface DisclosureOffBalanceSheet {
  confirmed_none: boolean;
  narrative?: string; // sanitised
  status: DisclosureStatus;
}

export interface DisclosureGoingConcern {
  flagged: boolean;
  narrative?: string; // sanitised, only if flagged
  status: DisclosureStatus;
}

export interface DisclosurePriorPeriodAdjustments {
  flagged: boolean;
  description?: string; // sanitised, only if flagged
  amount?: number;
  status: DisclosureStatus;
}

export interface FRS105StructuredDisclosures {
  statement_of_compliance: DisclosureStatementOfCompliance;
  average_employees: DisclosureAverageEmployees;
  directors_advances: DisclosureDirectorsAdvances;
  dividends: DisclosureDividends;
  related_party_transactions: DisclosureRelatedParty;
  commitments: DisclosureCommitments;
  off_balance_sheet: DisclosureOffBalanceSheet;
  going_concern: DisclosureGoingConcern;
  prior_period_adjustments: DisclosurePriorPeriodAdjustments;
}

// --- Prior Period Comparatives ---

export interface FRS105PriorPeriod {
  period_start: string;
  period_end: string;
  tangible_assets: BalanceSheetLineValue;
  debtors: BalanceSheetLineValue;
  cash_at_bank: BalanceSheetLineValue;
  creditors_within_one_year: BalanceSheetLineValue;
  creditors_after_one_year: BalanceSheetLineValue;
  share_capital: BalanceSheetLineValue;
  retained_earnings: BalanceSheetLineValue;
  // Computed
  net_current_assets: number;
  total_assets_less_current_liabilities: number;
  net_assets: number;
  total_equity: number;
}

// --- FRS105 Balance Sheet with Provenance ---

export interface FRS105BalanceSheetDraft {
  tangible_assets: BalanceSheetLineValue;
  debtors: BalanceSheetLineValue;
  cash_at_bank: BalanceSheetLineValue;
  creditors_within_one_year: BalanceSheetLineValue;
  creditors_after_one_year: BalanceSheetLineValue;
  share_capital: BalanceSheetLineValue;
  retained_earnings: BalanceSheetLineValue;
  // Auto-computed (not persisted as line values)
  net_current_assets: number;
  total_assets_less_current_liabilities: number;
  net_assets: number;
  total_equity: number;
}

// --- Main FRS105 Draft ---

/** @deprecated Use FRS105StructuredDisclosures instead */
export interface DisclosureEntry {
  key: string;
  title: string;
  content: string;
  is_applicable: boolean;
}

export interface AccountsDraftScheduleData {
  company: {
    company_name: string;
    company_number: string;
    period_start: string;
    period_end: string;
  };
  // TB reference
  tb_source: 'ledger' | 'csv_import' | 'manual';
  // Balance sheet with line-level provenance
  balance_sheet: FRS105BalanceSheetDraft;
  // Prior period comparatives (first-class, own iXBRL context)
  prior_period?: FRS105PriorPeriod;
  // Structured disclosures (no free-text blobs)
  disclosures: FRS105StructuredDisclosures;
  // Director info
  directors: Array<{
    name: string;
    appointed_date?: string;
    resigned_date?: string;
  }>;
  // Approval
  approval: {
    approved_by_board: boolean;
    approval_date?: string;
    signatory_name?: string;
    signatory_role?: string;
  };
  // Legacy compat
  legacy_disclosures?: DisclosureEntry[];
}

// ==================== PARTNERSHIP DRAFT ====================

export interface PartnerAllocation {
  partner_client_id: string;
  partner_name: string;
  allocation_method: 'percentage' | 'fixed' | 'special';
  percentage?: number;
  fixed_amount?: number;
  computed_profit_share: number;
  computed_tax_adjustments: Record<string, number>;
}

export interface PartnershipDraftScheduleData {
  partnership: {
    partnership_name: string;
    utr: string;
    period_start: string;
    period_end: string;
  };
  // Income/expenses (similar to self-employment)
  turnover: number;
  total_expenses: number;
  net_profit: number;
  // Adjustments
  disallowable_expenses: number;
  capital_allowances: number;
  adjusted_profit: number;
  // Allocations
  allocations: PartnerAllocation[];
}

// ==================== UNION TYPE ====================

export type DraftScheduleData =
  | SADraftScheduleData
  | CT600DraftScheduleData
  | AccountsDraftScheduleData
  | PartnershipDraftScheduleData;

// ==================== FILING TYPE ENUM ====================

export type FilingType =
  | 'SA_NON_MTD'
  | 'SA_MTD'
  | 'PARTNERSHIP'
  | 'ACCOUNTS_FRS105'
  | 'CT600';
