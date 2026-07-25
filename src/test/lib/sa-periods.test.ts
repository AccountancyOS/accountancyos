import { describe, it, expect } from "vitest";
import {
  saTaxYearToPeriod,
  isSaServiceCode,
  saStartYearFromLabel,
  currentTaxYearStartYear,
  recentTaxYearStartYears,
  buildSaLines,
} from "@/lib/proposal/sa-periods";

/**
 * Proposal Phase 1 Task 3 — SA multiple exact tax years.
 *
 * The materialize engine's SA branch computes the tax-year period as:
 *   period_start = make_date(Y, 4, 6)          -- 6 Apr Y
 *   period_end   = make_date(Y+1, 4, 5)        -- 5 Apr Y+1
 *   period_label = EXTRACT(YEAR FROM start) || '/' || substr(EXTRACT(YEAR FROM end)::text, 3, 2)
 *                = 'YYYY/YY'                    -- e.g. 2023/24
 *
 * `saTaxYearToPeriod` MUST mirror this byte-for-byte so a per-line period the
 * dialog writes lines up exactly with what the engine would otherwise compute,
 * and the dedup key `(org, service_code, entity, period_label)` produces one
 * SA job per tax year.
 */
describe("saTaxYearToPeriod", () => {
  it("maps 2023 → 2023/24 tax year with 6 Apr / 5 Apr bounds", () => {
    expect(saTaxYearToPeriod(2023)).toEqual({
      period_start: "2023-04-06",
      period_end: "2024-04-05",
      period_label: "2023/24",
    });
  });

  it("maps 2024 → 2024/25", () => {
    expect(saTaxYearToPeriod(2024)).toEqual({
      period_start: "2024-04-06",
      period_end: "2025-04-05",
      period_label: "2024/25",
    });
  });

  it("handles a century roll (2099 → 2099/00)", () => {
    expect(saTaxYearToPeriod(2099)).toEqual({
      period_start: "2099-04-06",
      period_end: "2100-04-05",
      period_label: "2099/00",
    });
  });
});

describe("saStartYearFromLabel", () => {
  it("recovers the start year from a YYYY/YY label", () => {
    expect(saStartYearFromLabel("2023/24")).toBe(2023);
    expect(saStartYearFromLabel("2024/25")).toBe(2024);
  });
});

describe("isSaServiceCode", () => {
  it("recognises the two SA service codes only", () => {
    expect(isSaServiceCode("sa_non_mtd")).toBe(true);
    expect(isSaServiceCode("sa_mtd")).toBe(true);
    expect(isSaServiceCode("vat_return")).toBe(false);
    expect(isSaServiceCode(null)).toBe(false);
    expect(isSaServiceCode(undefined)).toBe(false);
  });
});

describe("currentTaxYearStartYear", () => {
  it("returns the same calendar year on/after 6 Apr", () => {
    expect(currentTaxYearStartYear(new Date("2026-04-06T00:00:00"))).toBe(2026);
    expect(currentTaxYearStartYear(new Date("2026-12-31T00:00:00"))).toBe(2026);
  });
  it("returns the previous calendar year before 6 Apr", () => {
    expect(currentTaxYearStartYear(new Date("2026-04-05T00:00:00"))).toBe(2025);
    expect(currentTaxYearStartYear(new Date("2026-01-01T00:00:00"))).toBe(2025);
  });
});

describe("recentTaxYearStartYears", () => {
  it("offers the current tax year plus the previous ones, current first", () => {
    const years = recentTaxYearStartYears(7, new Date("2026-07-25T00:00:00"));
    expect(years).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  });
});

describe("buildSaLines", () => {
  it("selecting two tax years builds two line objects with those labels & periods", () => {
    const lines = buildSaLines(
      { service_id: "svc-sa", default_price: 250 },
      [2023, 2024]
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.period_label)).toEqual(["2023/24", "2024/25"]);
    expect(lines[0]).toEqual({
      service_id: "svc-sa",
      quantity: 1,
      unit_price: 250,
      billing_frequency: "now",
      period_start: "2023-04-06",
      period_end: "2024-04-05",
      period_label: "2023/24",
    });
    expect(lines[1].period_start).toBe("2024-04-06");
    expect(lines[1].period_end).toBe("2025-04-05");
  });

  it("defaults each historic SA return to a one-off ('now') line, not monthly", () => {
    const lines = buildSaLines({ service_id: "svc-sa", default_price: 250 }, [2022]);
    expect(lines[0].billing_frequency).toBe("now");
  });

  it("de-duplicates and sorts the selected years ascending", () => {
    const lines = buildSaLines(
      { service_id: "svc-sa", default_price: 100 },
      [2024, 2022, 2024, 2023]
    );
    expect(lines.map((l) => l.period_label)).toEqual([
      "2022/23",
      "2023/24",
      "2024/25",
    ]);
  });

  it("returns an empty array when no years are selected", () => {
    expect(buildSaLines({ service_id: "svc-sa", default_price: 100 }, [])).toEqual([]);
  });
});
