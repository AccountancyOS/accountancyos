/**
 * FRS105 Disclosure Determination Engine
 * Pure-function engine that determines mandatory disclosure requirements
 * based on entity profile, ledger data, and filing state.
 *
 * Rules:
 * - The SYSTEM determines what is required, not the user
 * - confirmed_none is blocked if contradictory ledger data exists
 * - All 9 disclosure categories are always present; status is computed
 */

import type {
  FRS105StructuredDisclosures,
  DisclosureStatus,
  DisclosureStatementOfCompliance,
  DisclosureAverageEmployees,
  DisclosureDirectorsAdvances,
  DisclosureDividends,
  DisclosureRelatedParty,
  DisclosureCommitments,
  DisclosureOffBalanceSheet,
  DisclosureGoingConcern,
  DisclosurePriorPeriodAdjustments,
  FRS105BalanceSheetDraft,
} from "@/types/filing-schemas";

// --- Input types ---

export interface LedgerContext {
  /** DLA-tagged account balances (non-zero means advances exist) */
  dla_balances: { account_code: string; balance: number }[];
  /** Whether DLA tagging is available in the ledger */
  has_dla_tagging: boolean;
  /** RPT-tagged transaction totals */
  rpt_transactions: { relationship: string; amount: number }[];
  /** Whether RPT tagging is available */
  has_rpt_tagging: boolean;
  /** Dividend transactions detected */
  dividends_detected: { amount: number; date: string }[];
  /** Commitment/guarantee flags from modules */
  commitments_exist: boolean;
}

export interface CompanyProfile {
  company_name: string;
  company_number: string;
  principal_activity?: string;
}

export interface PayrollContext {
  available: boolean;
  employee_count?: number;
}

export interface DisclosureRequirement {
  status: DisclosureStatus;
  reason: string;
}

export interface DisclosureRequirements {
  statement_of_compliance: DisclosureRequirement;
  average_employees: DisclosureRequirement;
  directors_advances: DisclosureRequirement;
  dividends: DisclosureRequirement;
  related_party_transactions: DisclosureRequirement;
  commitments: DisclosureRequirement;
  off_balance_sheet: DisclosureRequirement;
  going_concern: DisclosureRequirement;
  prior_period_adjustments: DisclosureRequirement;
}

export interface DisclosureValidationResult {
  requirements: DisclosureRequirements;
  all_complete: boolean;
  missing_count: number;
  errors: string[];
}

// --- Compliance text ---

const STATEMENT_OF_COMPLIANCE_TEXT =
  "These accounts have been prepared in accordance with the micro-entity provisions of the Companies Act 2006 as set out in FRS 105 'The Financial Reporting Standard applicable to the Micro-entities Regime'.";

// --- Engine ---

/**
 * Compute disclosure requirements from facts.
 * Returns which disclosures are required, not_required, or locked.
 */
export function computeDisclosureRequirements(
  ledger: LedgerContext,
  _company: CompanyProfile,
  _payroll: PayrollContext,
  balanceSheet?: FRS105BalanceSheetDraft
): DisclosureRequirements {
  // Statement of compliance: always locked
  const statement_of_compliance: DisclosureRequirement = {
    status: "locked",
    reason: "System-generated, non-editable",
  };

  // Average employees: always required
  const average_employees: DisclosureRequirement = {
    status: "required_missing",
    reason: "Average number of employees is always required for FRS 105",
  };

  // Directors' advances: always required (either entries or confirmed_none)
  const dlaTotal = ledger.dla_balances.reduce((s, d) => s + Math.abs(d.balance), 0);
  const directors_advances: DisclosureRequirement = {
    status: "required_missing",
    reason:
      ledger.has_dla_tagging && dlaTotal > 0
        ? `Director loan balance of £${dlaTotal.toFixed(2)} detected`
        : "Directors' advances/credits/guarantees disclosure is always required",
  };

  // Dividends: required only if detected
  const dividends: DisclosureRequirement =
    ledger.dividends_detected.length > 0
      ? {
          status: "required_missing",
          reason: `${ledger.dividends_detected.length} dividend(s) detected in ledger`,
        }
      : { status: "not_required", reason: "No dividends detected" };

  // Related party transactions: required only if RPT-tagged transactions exist
  const related_party_transactions: DisclosureRequirement =
    ledger.has_rpt_tagging && ledger.rpt_transactions.length > 0
      ? {
          status: "required_missing",
          reason: `${ledger.rpt_transactions.length} related party transaction(s) detected`,
        }
      : { status: "not_required", reason: "No related party transactions detected" };

  // Commitments: always required (even if "none")
  const commitments: DisclosureRequirement = {
    status: "required_missing",
    reason: ledger.commitments_exist
      ? "Commitments/guarantees detected"
      : "Commitments/contingent liabilities disclosure is always required",
  };

  // Off-balance sheet: always required
  const off_balance_sheet: DisclosureRequirement = {
    status: "required_missing",
    reason: "Off-balance sheet arrangements disclosure is always required",
  };

  // Going concern: required only if flagged
  const going_concern: DisclosureRequirement = {
    status: "not_required",
    reason: "No going concern uncertainty flagged",
  };

  // Prior period adjustments: required only if flagged
  const prior_period_adjustments: DisclosureRequirement = {
    status: "not_required",
    reason: "No prior period adjustments flagged",
  };

  // Facts-based inclusion for tangible assets (if present, disclosure may be relevant)
  // This is handled by the balance sheet grid, not a separate disclosure

  return {
    statement_of_compliance,
    average_employees,
    directors_advances,
    dividends,
    related_party_transactions,
    commitments,
    off_balance_sheet,
    going_concern,
    prior_period_adjustments,
  };
}

/**
 * Validate disclosure completeness against requirements.
 * Returns whether all required disclosures are complete (hard gate for iXBRL).
 */
export function validateDisclosures(
  disclosures: FRS105StructuredDisclosures,
  ledger: LedgerContext,
  company: CompanyProfile,
  payroll: PayrollContext,
  balanceSheet?: FRS105BalanceSheetDraft
): DisclosureValidationResult {
  const requirements = computeDisclosureRequirements(ledger, company, payroll, balanceSheet);
  const errors: string[] = [];
  let missing = 0;

  // Statement of compliance: always complete (system-generated)
  requirements.statement_of_compliance.status = "locked";

  // Average employees
  if (disclosures.average_employees.confirmed && disclosures.average_employees.count >= 0) {
    requirements.average_employees.status = "complete";
  } else {
    missing++;
    errors.push("Average employees: count must be confirmed (>= 0)");
  }

  // Directors' advances
  const dlaTotal = ledger.dla_balances.reduce((s, d) => s + Math.abs(d.balance), 0);
  if (disclosures.directors_advances.confirmed_none) {
    if (ledger.has_dla_tagging && dlaTotal > 0) {
      missing++;
      errors.push(
        `Directors' advances: cannot confirm 'none' when ledger shows DLA balance of £${dlaTotal.toFixed(2)}`
      );
    } else if (!ledger.has_dla_tagging && !disclosures.directors_advances.accountant_affirmation) {
      missing++;
      errors.push("Directors' advances: accountant affirmation required when no ledger data available");
    } else {
      requirements.directors_advances.status = "complete";
    }
  } else if (disclosures.directors_advances.entries.length > 0) {
    // Validate each entry has required fields
    const invalidEntries = disclosures.directors_advances.entries.filter(
      (e) => !e.director_name || e.closing_balance === undefined
    );
    if (invalidEntries.length > 0) {
      missing++;
      errors.push(`Directors' advances: ${invalidEntries.length} entry/entries missing required fields`);
    } else {
      requirements.directors_advances.status = "complete";
    }
  } else {
    missing++;
    errors.push("Directors' advances: either entries or confirmed 'none' is required");
  }

  // Dividends
  if (requirements.dividends.status === "not_required") {
    // Not required, auto-complete
  } else if (disclosures.dividends.confirmed_none) {
    if (ledger.dividends_detected.length > 0) {
      missing++;
      errors.push("Dividends: cannot confirm 'none' when dividends detected in ledger");
    } else {
      requirements.dividends.status = "complete";
    }
  } else if (disclosures.dividends.entries.length > 0) {
    requirements.dividends.status = "complete";
  } else {
    missing++;
    errors.push("Dividends: entries or confirmed 'none' required");
  }

  // Related party transactions
  if (requirements.related_party_transactions.status === "not_required") {
    // Not required, auto-complete
  } else if (disclosures.related_party_transactions.confirmed_none) {
    if (ledger.has_rpt_tagging && ledger.rpt_transactions.length > 0) {
      missing++;
      errors.push("Related party transactions: cannot confirm 'none' when RPT transactions detected");
    } else {
      requirements.related_party_transactions.status = "complete";
    }
  } else if (disclosures.related_party_transactions.entries.length > 0) {
    requirements.related_party_transactions.status = "complete";
  } else {
    missing++;
    errors.push("Related party transactions: entries or confirmed 'none' required");
  }

  // Commitments
  if (disclosures.commitments.confirmed_none) {
    if (ledger.commitments_exist) {
      missing++;
      errors.push("Commitments: cannot confirm 'none' when commitments/guarantees detected");
    } else {
      requirements.commitments.status = "complete";
    }
  } else if (disclosures.commitments.entries.length > 0) {
    requirements.commitments.status = "complete";
  } else {
    missing++;
    errors.push("Commitments: entries or confirmed 'none' required");
  }

  // Off-balance sheet
  if (disclosures.off_balance_sheet.confirmed_none || disclosures.off_balance_sheet.narrative) {
    requirements.off_balance_sheet.status = "complete";
  } else {
    missing++;
    errors.push("Off-balance sheet: confirmation or narrative required");
  }

  // Going concern
  if (disclosures.going_concern.flagged) {
    if (disclosures.going_concern.narrative && disclosures.going_concern.narrative.trim().length > 0) {
      requirements.going_concern.status = "complete";
    } else {
      requirements.going_concern.status = "required_missing";
      missing++;
      errors.push("Going concern: narrative required when flagged");
    }
  }
  // If not flagged, status stays not_required

  // Prior period adjustments
  if (disclosures.prior_period_adjustments.flagged) {
    if (
      disclosures.prior_period_adjustments.description &&
      disclosures.prior_period_adjustments.amount !== undefined
    ) {
      requirements.prior_period_adjustments.status = "complete";
    } else {
      requirements.prior_period_adjustments.status = "required_missing";
      missing++;
      errors.push("Prior period adjustments: description and amount required when flagged");
    }
  }

  return {
    requirements,
    all_complete: missing === 0,
    missing_count: missing,
    errors,
  };
}

/**
 * Create default empty disclosures for a new FRS105 filing.
 */
export function createDefaultDisclosures(): FRS105StructuredDisclosures {
  return {
    statement_of_compliance: {
      text: STATEMENT_OF_COMPLIANCE_TEXT,
      status: "locked",
    },
    average_employees: {
      count: 0,
      source: "manual",
      confirmed: false,
      status: "required_missing",
    },
    directors_advances: {
      entries: [],
      confirmed_none: false,
      status: "required_missing",
    },
    dividends: {
      entries: [],
      confirmed_none: false,
      status: "not_required",
    },
    related_party_transactions: {
      entries: [],
      confirmed_none: false,
      status: "not_required",
    },
    commitments: {
      entries: [],
      confirmed_none: false,
      status: "required_missing",
    },
    off_balance_sheet: {
      confirmed_none: false,
      status: "required_missing",
    },
    going_concern: {
      flagged: false,
      status: "not_required",
    },
    prior_period_adjustments: {
      flagged: false,
      status: "not_required",
    },
  };
}

/**
 * Create default empty balance sheet with provenance.
 */
export function createDefaultBalanceSheet(): import("@/types/filing-schemas").FRS105BalanceSheetDraft {
  const zero = (): import("@/types/filing-schemas").BalanceSheetLineValue => ({
    amount: 0,
    source: "manual_override" as const,
  });
  return {
    tangible_assets: zero(),
    debtors: zero(),
    cash_at_bank: zero(),
    creditors_within_one_year: zero(),
    creditors_after_one_year: zero(),
    share_capital: zero(),
    retained_earnings: zero(),
    net_current_assets: 0,
    total_assets_less_current_liabilities: 0,
    net_assets: 0,
    total_equity: 0,
  };
}

/**
 * Recompute balance sheet totals from line values.
 */
export function recomputeBalanceSheetTotals(
  bs: import("@/types/filing-schemas").FRS105BalanceSheetDraft
): import("@/types/filing-schemas").FRS105BalanceSheetDraft {
  const net_current_assets =
    bs.debtors.amount + bs.cash_at_bank.amount - bs.creditors_within_one_year.amount;
  const total_assets_less_current_liabilities = bs.tangible_assets.amount + net_current_assets;
  const net_assets = total_assets_less_current_liabilities - bs.creditors_after_one_year.amount;
  const total_equity = bs.share_capital.amount + bs.retained_earnings.amount;
  return {
    ...bs,
    net_current_assets,
    total_assets_less_current_liabilities,
    net_assets,
    total_equity,
  };
}
