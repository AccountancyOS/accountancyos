/**
 * Proposal Phase 1 Task 4 — Company-accounts Companies House period prefill,
 * confirm and catch-up.
 *
 * The materialize engine's company-accounts branch computes the annual accounts
 * period from the company year-end and labels it:
 *
 *   period_end   = <most recent year-end on/before today>
 *   period_start = period_end - 1 year + 1 day
 *   period_label = to_char(period_end, 'YYYY') || ' Year-End'   -- e.g. '2026 Year-End'
 *
 * When a proposal writes one `quote_lines` row per outstanding accounts period
 * with these fields, the engine (which COALESCEs the explicit line period over
 * its computed fallback) emits one distinct Accounts job per period — the dedup
 * key `(org, service_code, entity, period_label)` includes `period_label`. The
 * helpers below MIRROR the engine label format byte-for-byte so the two never
 * drift.
 *
 * Companies House exposes the next outstanding accounts period on the company
 * profile at `accounts.next_accounts.{period_start_on, period_end_on, due_on,
 * overdue}`. We read that directly; when it is absent we fall back to the flat
 * `companies.accounts_next_made_up_to` (≈ period_end_on) / `accounts_next_due`
 * (≈ due_on) columns — which carry neither `period_start` nor `overdue`.
 */

export const ACCOUNTS_SERVICE_CODE = "company_accounts" as const;
export type AccountsServiceCode = typeof ACCOUNTS_SERVICE_CODE;

import type { BillingFrequency } from "@/lib/db-constants/check-constraints";
export type { BillingFrequency };

/** True only for the catalog code the accounts materialize branch keys on. */
export function isAccountsServiceCode(code: string | null | undefined): code is AccountsServiceCode {
  return code === ACCOUNTS_SERVICE_CODE;
}

export interface AccountsPeriod {
  /** ISO date `YYYY-MM-DD`, first day of the accounting period. */
  period_start: string;
  /** ISO date `YYYY-MM-DD`, the accounts year-end (made-up-to). */
  period_end: string;
  /** `YYYY Year-End`, e.g. `2026 Year-End`. */
  period_label: string;
}

/** The next outstanding accounts period extracted from Companies House. */
export interface CHNextAccounts {
  /** From `next_accounts.period_start_on`; `null` in the flat-column fallback. */
  period_start: string | null;
  /** From `next_accounts.period_end_on` (≈ `accounts_next_made_up_to`). */
  period_end: string;
  /** From `next_accounts.due_on` (≈ `accounts_next_due`). */
  due_on: string | null;
  /** From `next_accounts.overdue`; derived from `due_on < now` in the fallback. */
  overdue: boolean;
}

/**
 * Minimal shape read for the CH accounts period — a lead or company row. The
 * raw CH profile is stored on `ch_company_profile`; depending on the write path
 * the profile is either the object itself or wrapped under `.profile` (the
 * companies-house-sync edge function stores `{ profile, officers, pscs }`), so
 * both are probed. Flat columns exist on `companies`, not on `leads`.
 */
export interface CompanyCHSource {
  ch_company_profile?: unknown;
  accounts_next_made_up_to?: string | null;
  accounts_next_due?: string | null;
}

/** A drafted accounts quote line (period-carrying) ready to insert as a `quote_lines` row. */
export interface AccountsLineDraft extends AccountsPeriod {
  service_id: string;
  quantity: number;
  unit_price: number;
  billing_frequency: BillingFrequency;
}

export interface BuildAccountsLinesInput {
  service_id: string;
  default_price: number;
  /** Accounts are an ongoing engagement — defaults to `monthly` billing. */
  billing_frequency?: BillingFrequency;
}

/** Mirror of Postgres `to_char(period_end, 'YYYY') || ' Year-End'`. */
export function accountsPeriodLabel(periodEnd: string | Date): string {
  const year =
    typeof periodEnd === "string" ? periodEnd.slice(0, 4) : String(periodEnd.getUTCFullYear());
  return `${year} Year-End`;
}

/** Shift an ISO date by whole years (UTC), normalising overflow (e.g. 29 Feb). */
function shiftYearsISO(iso: string, deltaYears: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(
    Date.UTC(d.getUTCFullYear() + deltaYears, d.getUTCMonth(), d.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Derive the accounting period start from its end, mirroring the engine:
 * `period_start = period_end - 1 year + 1 day` (e.g. 2025-12-31 → 2025-01-01).
 */
export function periodStartFromEnd(periodEndISO: string): string {
  const end = new Date(`${periodEndISO}T00:00:00Z`);
  const start = new Date(
    Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1)
  );
  return start.toISOString().slice(0, 10);
}

/**
 * Build a full `{ period_start, period_end, period_label }` from a year-end.
 * When `periodStart` is supplied (CH provides `period_start_on`) it is used
 * verbatim; otherwise it is derived from the end.
 */
export function accountsPeriodFromEnd(
  periodEnd: string,
  periodStart?: string | null
): AccountsPeriod {
  return {
    period_start: periodStart ?? periodStartFromEnd(periodEnd),
    period_end: periodEnd,
    period_label: accountsPeriodLabel(periodEnd),
  };
}

/** The accounting period one year earlier — used to add a catch-up period. */
export function previousAccountsPeriod(period: AccountsPeriod): AccountsPeriod {
  const prevEnd = shiftYearsISO(period.period_end, -1);
  const prevStart = shiftYearsISO(period.period_start, -1);
  return {
    period_start: prevStart,
    period_end: prevEnd,
    period_label: accountsPeriodLabel(prevEnd),
  };
}

/** Locate the `accounts` object regardless of whether the profile is wrapped. */
function resolveAccountsObject(chProfile: unknown): Record<string, any> | null {
  if (!chProfile || typeof chProfile !== "object") return null;
  const root = chProfile as Record<string, any>;
  if (root.accounts && typeof root.accounts === "object") return root.accounts;
  const wrapped = root.profile as Record<string, any> | undefined;
  if (wrapped && typeof wrapped === "object" && wrapped.accounts && typeof wrapped.accounts === "object") {
    return wrapped.accounts;
  }
  return null;
}

/**
 * Extract the next outstanding accounts period for a company from Companies
 * House. Prefers the jsonb `accounts.next_accounts` (the only source of
 * `period_start_on` and `overdue`); falls back to the flat columns. Returns
 * `null` when no accounts period is available from either source.
 */
export function nextAccountsPeriodFromCH(
  company: CompanyCHSource | null | undefined,
  now: Date = new Date()
): CHNextAccounts | null {
  if (!company) return null;

  const accounts = resolveAccountsObject(company.ch_company_profile);
  const next = accounts?.next_accounts as Record<string, any> | undefined;

  if (next && next.period_end_on) {
    return {
      period_start: next.period_start_on ?? null,
      period_end: next.period_end_on,
      due_on: next.due_on ?? accounts?.next_due ?? null,
      overdue: Boolean(next.overdue),
    };
  }

  // Intermediate: accounts object present but no next_accounts sub-object.
  const jsonbMadeUpTo = accounts?.next_made_up_to as string | undefined;
  const jsonbNextDue = accounts?.next_due as string | undefined;

  const periodEnd = jsonbMadeUpTo ?? company.accounts_next_made_up_to ?? null;
  const dueOn = jsonbNextDue ?? company.accounts_next_due ?? null;

  if (!periodEnd) return null;

  return {
    period_start: null,
    period_end: periodEnd,
    due_on: dueOn,
    overdue: dueOn != null && new Date(`${dueOn}T00:00:00Z`).getTime() < now.getTime(),
  };
}

/**
 * Build one period-carrying `company_accounts` line per period. Periods are
 * de-duplicated by `period_label` and sorted ascending (oldest first) for
 * stable, chronological ordering. Each line is independently priced (default
 * price; the accountant can edit per line afterwards).
 */
export function buildAccountsLines(
  input: BuildAccountsLinesInput,
  periods: AccountsPeriod[]
): AccountsLineDraft[] {
  const frequency: BillingFrequency = input.billing_frequency ?? "monthly";
  const byLabel = new Map<string, AccountsPeriod>();
  for (const p of periods) byLabel.set(p.period_label, p);
  const unique = Array.from(byLabel.values()).sort((a, b) =>
    a.period_end < b.period_end ? -1 : a.period_end > b.period_end ? 1 : 0
  );
  return unique.map((period) => ({
    service_id: input.service_id,
    quantity: 1,
    unit_price: input.default_price,
    billing_frequency: frequency,
    ...period,
  }));
}
