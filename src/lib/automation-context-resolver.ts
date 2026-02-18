/**
 * Automation Context Resolver
 * 
 * Computes named anchors from canonical period dates.
 * The anchor resolver receives explicit period dates — it NEVER parses period_key strings.
 * 
 * Returns a structured result with resolved anchors and missing reasons.
 * Missing anchors return null + reason, NEVER empty strings.
 */

import { ANCHOR_KEYS, type AnchorKey } from "./workflow-constants";

// ============================================================
// Types
// ============================================================

export interface AnchorResolverInput {
  /** ISO date from deadlines.period_start or instance context */
  periodStart: string;
  /** ISO date from deadlines.period_end or instance context */
  periodEnd: string;
  /** 'annual' | 'quarterly' | 'monthly' */
  periodType: string;
  /** Service type key: SA_NON_MTD, VAT, PAYROLL, LTD_ACCOUNTS_CT, CIS, etc. */
  serviceType: string;
  /** ISO date — company's accounting reference date (year end). Required for Ltd accounts/CT */
  companyYearEnd?: string;
  /** ISO datetime — when the triggering event occurred (for relative waits) */
  triggeringEventAt?: string;
}

export interface AnchorResolutionResult {
  /** Resolved anchors: anchor_key → ISO date string */
  anchors: Record<string, string>;
  /** Anchors that could not be resolved, with reasons */
  missing: Array<{ anchor_key: string; reason: string }>;
}

// ============================================================
// Date helpers (pure, no side effects)
// ============================================================

/** Parse an ISO date string to a Date object (date-only, no time component issues) */
function parseDate(iso: string): Date {
  const [year, month, day] = iso.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Format a Date to YYYY-MM-DD */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add months to a date (handles month overflow correctly) */
function addMonths(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Add days to a date */
function addDays(d: Date, days: number): Date {
  const result = new Date(d.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** Get the Nth of the month following a given date */
function nthOfFollowingMonth(d: Date, dayOfMonth: number): Date {
  const next = addMonths(d, 1);
  return new Date(next.getFullYear(), next.getMonth(), dayOfMonth);
}

// ============================================================
// Anchor Computation
// ============================================================

/**
 * Resolve anchors from canonical period data.
 * 
 * Each anchor is computed deterministically from the input dates.
 * If a required input is missing, the anchor is added to the `missing` array
 * with a specific reason — never silently omitted.
 */
export function resolveAnchors(input: AnchorResolverInput): AnchorResolutionResult {
  const anchors: Record<string, string> = {};
  const missing: Array<{ anchor_key: string; reason: string }> = [];

  const periodEnd = input.periodEnd ? parseDate(input.periodEnd) : null;
  const companyYearEnd = input.companyYearEnd ? parseDate(input.companyYearEnd) : null;

  // Always resolve TRIGGERING_EVENT if provided
  if (input.triggeringEventAt) {
    anchors[ANCHOR_KEYS.TRIGGERING_EVENT] = input.triggeringEventAt;
  }

  switch (input.serviceType) {
    case "SA_NON_MTD":
    case "SA_MTD":
      // SA_FILING_DEADLINE: 31 January of the year AFTER the tax year end
      // Tax year: 6 April to 5 April. periodEnd = 5 April YYYY
      if (periodEnd) {
        // Tax year ending 5 April 2026 → filing deadline 31 January 2027
        const filingYear = periodEnd.getFullYear() + 1;
        anchors[ANCHOR_KEYS.SA_FILING_DEADLINE] = `${filingYear}-01-31`;
      } else {
        missing.push({
          anchor_key: ANCHOR_KEYS.SA_FILING_DEADLINE,
          reason: "Period end date not set — cannot compute SA filing deadline",
        });
      }
      break;

    case "LTD_ACCOUNTS_CT":
      // COMPANY_ACCOUNTS_DUE_DATE: year end + 9 months
      // CT_PAYMENT_DUE_DATE: year end + 9 months + 1 day
      if (companyYearEnd) {
        const accountsDue = addMonths(companyYearEnd, 9);
        anchors[ANCHOR_KEYS.COMPANY_ACCOUNTS_DUE_DATE] = formatDate(accountsDue);
        
        const ctPaymentDue = addDays(accountsDue, 1);
        anchors[ANCHOR_KEYS.CT_PAYMENT_DUE_DATE] = formatDate(ctPaymentDue);
      } else {
        missing.push({
          anchor_key: ANCHOR_KEYS.COMPANY_ACCOUNTS_DUE_DATE,
          reason: "Company year end (accounting reference date) not set",
        });
        missing.push({
          anchor_key: ANCHOR_KEYS.CT_PAYMENT_DUE_DATE,
          reason: "Company year end (accounting reference date) not set",
        });
      }
      break;

    case "VAT":
      // VAT_SUBMISSION_DEADLINE: period end + 1 month + 7 days
      if (periodEnd) {
        const vatDeadline = addDays(addMonths(periodEnd, 1), 7);
        anchors[ANCHOR_KEYS.VAT_SUBMISSION_DEADLINE] = formatDate(vatDeadline);
      } else {
        missing.push({
          anchor_key: ANCHOR_KEYS.VAT_SUBMISSION_DEADLINE,
          reason: "VAT period end date not set",
        });
      }
      break;

    case "PAYROLL":
      // PAYROLL_EPS_DEADLINE: 19th of month following period end
      // PAYROLL_PAYE_PAYMENT_DEADLINE: 22nd of month following period end
      if (periodEnd) {
        anchors[ANCHOR_KEYS.PAYROLL_EPS_DEADLINE] = formatDate(
          nthOfFollowingMonth(periodEnd, 19)
        );
        anchors[ANCHOR_KEYS.PAYROLL_PAYE_PAYMENT_DEADLINE] = formatDate(
          nthOfFollowingMonth(periodEnd, 22)
        );
      } else {
        missing.push({
          anchor_key: ANCHOR_KEYS.PAYROLL_EPS_DEADLINE,
          reason: "Payroll period end date not set",
        });
        missing.push({
          anchor_key: ANCHOR_KEYS.PAYROLL_PAYE_PAYMENT_DEADLINE,
          reason: "Payroll period end date not set",
        });
      }
      break;

    case "CIS":
      // CIS_SUBMISSION_DEADLINE: 19th of month following period end
      // CIS period runs 6th to 5th
      if (periodEnd) {
        anchors[ANCHOR_KEYS.CIS_SUBMISSION_DEADLINE] = formatDate(
          nthOfFollowingMonth(periodEnd, 19)
        );
      } else {
        missing.push({
          anchor_key: ANCHOR_KEYS.CIS_SUBMISSION_DEADLINE,
          reason: "CIS period end date not set",
        });
      }
      break;

    default:
      // For service types without deadline anchors (CRM, ONBOARDING, SLA, COSEC, etc.)
      // Only TRIGGERING_EVENT is available (if provided above)
      break;
  }

  return { anchors, missing };
}

/**
 * Compute anchors for a workflow instance context and merge into existing context.
 * Called at instance creation time (ON_CREATE_ONLY rescheduling policy).
 */
export function computeAnchorsForContext(
  context: Record<string, unknown>,
  serviceType: string
): AnchorResolutionResult {
  const input: AnchorResolverInput = {
    periodStart: (context.period_start as string) || "",
    periodEnd: (context.period_end as string) || "",
    periodType: (context.period_type as string) || "annual",
    serviceType,
    companyYearEnd: (context.company_year_end as string) || undefined,
    triggeringEventAt: (context.triggering_event_at as string) || undefined,
  };

  return resolveAnchors(input);
}
