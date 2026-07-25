import { describe, it, expect } from "vitest";
import {
  isVatServiceCode,
  isVatFrequency,
  isVatConfigComplete,
  vatStaggerParam,
  vatGeneratorArgs,
  defaultVatWindow,
  buildVatLines,
  isVatGroupValid,
  vatConfigFromCompany,
  type VatConfig,
  type VatPeriod,
} from "@/lib/proposal/vat-periods";

/**
 * Proposal Phase 1 Task 5b — VAT frequency/stagger period selection.
 *
 * The DB function `generate_vat_periods(p_frequency, p_stagger, p_from, p_to)`
 * is the SOLE source of truth for the stagger math and the period_label. These
 * helpers never re-implement that math — they only (a) translate the accountant's
 * frequency/stagger choice into the function's `p_stagger` integer, (b) gate the
 * UI on a complete config + selection, and (c) map already-generated periods to
 * one `vat_return` quote line each.
 */

describe("isVatServiceCode", () => {
  it("recognises only the vat_return catalog code", () => {
    expect(isVatServiceCode("vat_return")).toBe(true);
    expect(isVatServiceCode("sa_mtd")).toBe(false);
    expect(isVatServiceCode("company_accounts")).toBe(false);
    expect(isVatServiceCode(null)).toBe(false);
    expect(isVatServiceCode(undefined)).toBe(false);
  });
});

describe("isVatFrequency", () => {
  it("accepts the three supported frequencies", () => {
    expect(isVatFrequency("monthly")).toBe(true);
    expect(isVatFrequency("quarterly")).toBe(true);
    expect(isVatFrequency("annual_accounting")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isVatFrequency("annual")).toBe(false);
    expect(isVatFrequency("weekly")).toBe(false);
    expect(isVatFrequency(null)).toBe(false);
  });
});

describe("vatStaggerParam — maps config to the DB function's p_stagger", () => {
  it("quarterly → the 1/2/3 stagger group", () => {
    expect(vatStaggerParam({ frequency: "quarterly", staggerGroup: 2, annualEndMonth: null })).toBe(2);
  });
  it("annual_accounting → the chosen period-end month (1..12)", () => {
    expect(
      vatStaggerParam({ frequency: "annual_accounting", staggerGroup: null, annualEndMonth: 3 })
    ).toBe(3);
  });
  it("monthly → null (the function ignores stagger)", () => {
    expect(vatStaggerParam({ frequency: "monthly", staggerGroup: null, annualEndMonth: null })).toBeNull();
  });
});

describe("isVatConfigComplete — the frequency/stagger validation gate", () => {
  it("monthly is complete with no stagger", () => {
    expect(isVatConfigComplete({ frequency: "monthly", staggerGroup: null, annualEndMonth: null })).toBe(true);
  });
  it("quarterly requires a 1/2/3 stagger group", () => {
    expect(isVatConfigComplete({ frequency: "quarterly", staggerGroup: null, annualEndMonth: null })).toBe(false);
    expect(isVatConfigComplete({ frequency: "quarterly", staggerGroup: 1, annualEndMonth: null })).toBe(true);
    expect(isVatConfigComplete({ frequency: "quarterly", staggerGroup: 3, annualEndMonth: null })).toBe(true);
    // Out-of-range stagger is not accepted.
    expect(isVatConfigComplete({ frequency: "quarterly", staggerGroup: 4 as never, annualEndMonth: null })).toBe(false);
  });
  it("annual_accounting requires a period-end month 1..12", () => {
    expect(isVatConfigComplete({ frequency: "annual_accounting", staggerGroup: null, annualEndMonth: null })).toBe(false);
    expect(isVatConfigComplete({ frequency: "annual_accounting", staggerGroup: null, annualEndMonth: 12 })).toBe(true);
    expect(isVatConfigComplete({ frequency: "annual_accounting", staggerGroup: null, annualEndMonth: 0 })).toBe(false);
    expect(isVatConfigComplete({ frequency: "annual_accounting", staggerGroup: null, annualEndMonth: 13 })).toBe(false);
  });
  it("an unset frequency is never complete", () => {
    expect(isVatConfigComplete({ frequency: null, staggerGroup: null, annualEndMonth: null })).toBe(false);
  });
});

describe("vatGeneratorArgs — builds the RPC payload only when config is complete", () => {
  it("returns the exact { p_frequency, p_stagger, p_from, p_to } payload", () => {
    const cfg: VatConfig = { frequency: "quarterly", staggerGroup: 1, annualEndMonth: null };
    expect(vatGeneratorArgs(cfg, "2024-01-01", "2026-06-30")).toEqual({
      p_frequency: "quarterly",
      p_stagger: 1,
      p_from: "2024-01-01",
      p_to: "2026-06-30",
    });
  });
  it("passes the annual end-month through as p_stagger", () => {
    const cfg: VatConfig = { frequency: "annual_accounting", staggerGroup: null, annualEndMonth: 9 };
    expect(vatGeneratorArgs(cfg, "2024-01-01", "2026-06-30")).toEqual({
      p_frequency: "annual_accounting",
      p_stagger: 9,
      p_from: "2024-01-01",
      p_to: "2026-06-30",
    });
  });
  it("returns null when the config is incomplete (no RPC should fire)", () => {
    const cfg: VatConfig = { frequency: "quarterly", staggerGroup: null, annualEndMonth: null };
    expect(vatGeneratorArgs(cfg, "2024-01-01", "2026-06-30")).toBeNull();
  });
});

describe("defaultVatWindow — ~2 years back to ~1 year forward", () => {
  it("spans 2 years before to 1 year after the given date", () => {
    const win = defaultVatWindow(new Date("2026-07-25T00:00:00Z"));
    expect(win.from).toBe("2024-07-25");
    expect(win.to).toBe("2027-07-25");
  });
});

const q = (label: string, start: string, end: string): VatPeriod => ({
  period_start: start,
  period_end: end,
  period_label: label,
});

describe("buildVatLines — selected generator rows → one vat_return line each", () => {
  const input = { service_id: "svc-vat", default_price: 120 };

  it("maps each selected period to one line with its exact bounds & label", () => {
    const selected = [
      q("VAT Q/E 31 Mar 2026", "2026-01-01", "2026-03-31"),
      q("VAT Q/E 31 Dec 2025", "2025-10-01", "2025-12-31"),
    ];
    const lines = buildVatLines(input, selected);
    expect(lines).toHaveLength(2);
    // Sorted ascending by period_end (oldest catch-up first).
    expect(lines.map((l) => l.period_label)).toEqual([
      "VAT Q/E 31 Dec 2025",
      "VAT Q/E 31 Mar 2026",
    ]);
    expect(lines[0]).toEqual({
      service_id: "svc-vat",
      quantity: 1,
      unit_price: 120,
      billing_frequency: "monthly",
      period_start: "2025-10-01",
      period_end: "2025-12-31",
      period_label: "VAT Q/E 31 Dec 2025",
    });
  });

  it("does NOT re-derive labels — it passes the generator's period_label verbatim", () => {
    const selected = [q("VAT M/E 28 Feb 2026", "2026-02-01", "2026-02-28")];
    expect(buildVatLines(input, selected)[0].period_label).toBe("VAT M/E 28 Feb 2026");
  });

  it("de-duplicates by period_label", () => {
    const selected = [
      q("VAT Q/E 31 Mar 2026", "2026-01-01", "2026-03-31"),
      q("VAT Q/E 31 Mar 2026", "2026-01-01", "2026-03-31"),
    ];
    expect(buildVatLines(input, selected)).toHaveLength(1);
  });

  it("returns an empty array when nothing is selected", () => {
    expect(buildVatLines(input, [])).toEqual([]);
  });

  it("honours an explicit billing frequency override", () => {
    const lines = buildVatLines(
      { ...input, billing_frequency: "now" },
      [q("VAT Q/E 31 Dec 2025", "2025-10-01", "2025-12-31")]
    );
    expect(lines[0].billing_frequency).toBe("now");
  });
});

describe("isVatGroupValid — submit gating for a VAT service group", () => {
  const complete: VatConfig = { frequency: "quarterly", staggerGroup: 1, annualEndMonth: null };

  it("blocks when the config is incomplete", () => {
    expect(
      isVatGroupValid({
        config: { frequency: "quarterly", staggerGroup: null, annualEndMonth: null },
        selectedLabels: ["VAT Q/E 31 Mar 2026"],
        ongoing: false,
        ongoingStartLabel: null,
      })
    ).toBe(false);
  });

  it("blocks when no period is selected", () => {
    expect(
      isVatGroupValid({ config: complete, selectedLabels: [], ongoing: false, ongoingStartLabel: null })
    ).toBe(false);
  });

  it("passes with a complete config + at least one selected period (no ongoing work)", () => {
    expect(
      isVatGroupValid({
        config: complete,
        selectedLabels: ["VAT Q/E 31 Mar 2026"],
        ongoing: false,
        ongoingStartLabel: null,
      })
    ).toBe(true);
  });

  it("requires the first ongoing period to be identified when ongoing work is proposed", () => {
    expect(
      isVatGroupValid({
        config: complete,
        selectedLabels: ["VAT Q/E 31 Mar 2026"],
        ongoing: true,
        ongoingStartLabel: null,
      })
    ).toBe(false);
  });

  it("the identified first ongoing period must be one of the selected periods", () => {
    expect(
      isVatGroupValid({
        config: complete,
        selectedLabels: ["VAT Q/E 31 Mar 2026"],
        ongoing: true,
        ongoingStartLabel: "VAT Q/E 30 Jun 2026",
      })
    ).toBe(false);
    expect(
      isVatGroupValid({
        config: complete,
        selectedLabels: ["VAT Q/E 31 Mar 2026"],
        ongoing: true,
        ongoingStartLabel: "VAT Q/E 31 Mar 2026",
      })
    ).toBe(true);
  });
});

describe("vatConfigFromCompany — best-effort prefill from a linked company", () => {
  it("maps QUARTERLY + stagger group to a config", () => {
    expect(vatConfigFromCompany({ vat_frequency: "QUARTERLY", vat_stagger_group: 2 })).toEqual({
      frequency: "quarterly",
      staggerGroup: 2,
      annualEndMonth: null,
    });
  });
  it("maps MONTHLY", () => {
    expect(vatConfigFromCompany({ vat_frequency: "monthly", vat_stagger_group: null })).toEqual({
      frequency: "monthly",
      staggerGroup: null,
      annualEndMonth: null,
    });
  });
  it("returns an empty config when nothing is available", () => {
    expect(vatConfigFromCompany(null)).toEqual({
      frequency: null,
      staggerGroup: null,
      annualEndMonth: null,
    });
    expect(vatConfigFromCompany({ vat_frequency: null, vat_stagger_group: null })).toEqual({
      frequency: null,
      staggerGroup: null,
      annualEndMonth: null,
    });
  });
});
