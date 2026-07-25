import { describe, it, expect } from "vitest";
import {
  nextAccountsPeriodFromCH,
  accountsPeriodLabel,
  accountsPeriodFromEnd,
  previousAccountsPeriod,
  buildAccountsLines,
  isAccountsServiceCode,
  ACCOUNTS_SERVICE_CODE,
} from "@/lib/proposal/accounts-periods";

/**
 * Proposal Phase 1 Task 4 — Company-accounts CH period prefill + catch-up.
 *
 * The materialize engine's company-accounts branch labels the period as:
 *   period_label = to_char(v_period_end, 'YYYY') || ' Year-End'   -- e.g. '2026 Year-End'
 * so a proposal-created Accounts job dedups against the same key
 * `(org, service_code, entity, period_label)`. `accountsPeriodLabel` MUST
 * mirror this byte-for-byte.
 *
 * Companies House exposes the next outstanding accounts period on the company
 * profile at `accounts.next_accounts.{period_start_on, period_end_on, due_on,
 * overdue}`. `nextAccountsPeriodFromCH` extracts it, with a fallback to the
 * flat `accounts_next_made_up_to` / `accounts_next_due` columns (which carry no
 * period_start nor overdue).
 */

describe("accountsPeriodLabel", () => {
  it("mirrors the engine: 'YYYY Year-End' from a Date", () => {
    expect(accountsPeriodLabel(new Date("2026-03-31"))).toBe("2026 Year-End");
  });

  it("accepts an ISO date string", () => {
    expect(accountsPeriodLabel("2025-12-31")).toBe("2025 Year-End");
  });
});

describe("accountsPeriodFromEnd", () => {
  it("derives period_start (end - 1yr + 1day) and label when only the end is known", () => {
    expect(accountsPeriodFromEnd("2025-12-31")).toEqual({
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      period_label: "2025 Year-End",
    });
  });

  it("uses an explicit period_start when supplied (CH gives period_start_on)", () => {
    expect(accountsPeriodFromEnd("2026-03-31", "2025-04-01")).toEqual({
      period_start: "2025-04-01",
      period_end: "2026-03-31",
      period_label: "2026 Year-End",
    });
  });
});

describe("previousAccountsPeriod", () => {
  it("shifts a period back one year for a catch-up period", () => {
    expect(
      previousAccountsPeriod({
        period_start: "2025-04-01",
        period_end: "2026-03-31",
        period_label: "2026 Year-End",
      })
    ).toEqual({
      period_start: "2024-04-01",
      period_end: "2025-03-31",
      period_label: "2025 Year-End",
    });
  });
});

describe("isAccountsServiceCode", () => {
  it("recognises only the company_accounts catalog code", () => {
    expect(isAccountsServiceCode("company_accounts")).toBe(true);
    expect(isAccountsServiceCode(ACCOUNTS_SERVICE_CODE)).toBe(true);
    expect(isAccountsServiceCode("sa_non_mtd")).toBe(false);
    expect(isAccountsServiceCode(null)).toBe(false);
    expect(isAccountsServiceCode(undefined)).toBe(false);
  });
});

describe("nextAccountsPeriodFromCH", () => {
  const nextAccounts = {
    period_start_on: "2025-04-01",
    period_end_on: "2026-03-31",
    due_on: "2026-12-31",
    overdue: false,
  };

  it("extracts next_accounts from ch_company_profile.accounts (spec path)", () => {
    expect(
      nextAccountsPeriodFromCH({
        ch_company_profile: { accounts: { next_accounts: nextAccounts } },
      })
    ).toEqual({
      period_start: "2025-04-01",
      period_end: "2026-03-31",
      due_on: "2026-12-31",
      overdue: false,
    });
  });

  it("extracts next_accounts when the raw CH profile is wrapped under .profile (edge-fn shape)", () => {
    expect(
      nextAccountsPeriodFromCH({
        ch_company_profile: { profile: { accounts: { next_accounts: nextAccounts } } },
      })
    ).toEqual({
      period_start: "2025-04-01",
      period_end: "2026-03-31",
      due_on: "2026-12-31",
      overdue: false,
    });
  });

  it("carries an overdue flag through from CH", () => {
    const overdueRow = {
      ch_company_profile: {
        accounts: { next_accounts: { ...nextAccounts, overdue: true } },
      },
    };
    expect(nextAccountsPeriodFromCH(overdueRow)?.overdue).toBe(true);
  });

  it("falls back to the flat columns when no jsonb next_accounts (no period_start, derives overdue from due)", () => {
    const now = new Date("2026-07-25T00:00:00Z");
    expect(
      nextAccountsPeriodFromCH(
        {
          ch_company_profile: null,
          accounts_next_made_up_to: "2025-12-31",
          accounts_next_due: "2026-09-30",
        },
        now
      )
    ).toEqual({
      period_start: null,
      period_end: "2025-12-31",
      due_on: "2026-09-30",
      overdue: false,
    });
  });

  it("flags overdue in the fallback path when the due date has passed", () => {
    const now = new Date("2026-07-25T00:00:00Z");
    expect(
      nextAccountsPeriodFromCH(
        { accounts_next_made_up_to: "2025-03-31", accounts_next_due: "2025-12-31" },
        now
      )?.overdue
    ).toBe(true);
  });

  it("returns null when neither CH jsonb nor flat columns carry an accounts period", () => {
    expect(nextAccountsPeriodFromCH({ ch_company_profile: null })).toBeNull();
    expect(nextAccountsPeriodFromCH({})).toBeNull();
  });
});

describe("buildAccountsLines", () => {
  it("produces one company_accounts line per period with correct bounds + label", () => {
    const confirmed = accountsPeriodFromEnd("2026-03-31", "2025-04-01");
    const catchUp = previousAccountsPeriod(confirmed);
    const lines = buildAccountsLines(
      { service_id: "svc-acc", default_price: 900 },
      [catchUp, confirmed]
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.period_label)).toEqual(["2025 Year-End", "2026 Year-End"]);
    expect(lines[0]).toEqual({
      service_id: "svc-acc",
      quantity: 1,
      unit_price: 900,
      billing_frequency: "monthly",
      period_start: "2024-04-01",
      period_end: "2025-03-31",
      period_label: "2025 Year-End",
    });
    expect(lines[1].period_start).toBe("2025-04-01");
    expect(lines[1].period_end).toBe("2026-03-31");
  });

  it("de-duplicates periods by label and sorts ascending (oldest first)", () => {
    const p2026 = accountsPeriodFromEnd("2026-03-31", "2025-04-01");
    const p2025 = previousAccountsPeriod(p2026);
    const lines = buildAccountsLines(
      { service_id: "svc-acc", default_price: 100 },
      [p2026, p2025, p2026]
    );
    expect(lines.map((l) => l.period_label)).toEqual(["2025 Year-End", "2026 Year-End"]);
  });
});
