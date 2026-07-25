import { describe, it, expect } from "vitest";
import {
  MTD_SERVICE_CODES,
  isMtdQuarterServiceCode,
  isMtdFinalServiceCode,
  mtdQuartersForTaxYear,
  mtdFinalForTaxYear,
  buildMtdQuarterLines,
  buildMtdFinalLines,
} from "@/lib/proposal/mtd-periods";

/**
 * Proposal Phase 1 Task 6b-3 — MTD ITSA tax-year decomposition.
 *
 * A UK MTD ITSA tax year runs 6 April (Y) → 5 April (Y+1), labelled `YYYY/YY`.
 * It decomposes into FOUR standard 5th-ending quarters plus one annual final
 * declaration. Each carries its own exact period so `lifecycle_materialize_jobs`
 * emits one distinct job per quarter/final (dedup key includes `period_label`),
 * and the live `calculate_deadline` arms map:
 *   - `mtd_quarter`     period_end (5 Jul/Oct/Jan/Apr) → fixed 7 Aug/Nov/Feb/May
 *   - `mtd_itsa_final`  period_end (5 Apr Y+1)         → 31 Jan Y+2
 */
describe("mtdQuartersForTaxYear", () => {
  it("2025 → four standard 5th-ending quarters of 2025/26 with distinct Q1–Q4 labels", () => {
    expect(mtdQuartersForTaxYear(2025)).toEqual([
      { period_start: "2025-04-06", period_end: "2025-07-05", period_label: "MTD Q1 2025/26" },
      { period_start: "2025-07-06", period_end: "2025-10-05", period_label: "MTD Q2 2025/26" },
      { period_start: "2025-10-06", period_end: "2026-01-05", period_label: "MTD Q3 2025/26" },
      { period_start: "2026-01-06", period_end: "2026-04-05", period_label: "MTD Q4 2025/26" },
    ]);
  });

  it("quarter period_ends are 5 Jul / 5 Oct / 5 Jan / 5 Apr (the live arm maps to 7 Aug/Nov/Feb/May)", () => {
    const ends = mtdQuartersForTaxYear(2025).map((q) => q.period_end.slice(5));
    expect(ends).toEqual(["07-05", "10-05", "01-05", "04-05"]);
  });

  it("labels are distinct per quarter", () => {
    const labels = mtdQuartersForTaxYear(2024).map((q) => q.period_label);
    expect(new Set(labels).size).toBe(4);
    expect(labels).toEqual([
      "MTD Q1 2024/25",
      "MTD Q2 2024/25",
      "MTD Q3 2024/25",
      "MTD Q4 2024/25",
    ]);
  });
});

describe("mtdFinalForTaxYear", () => {
  it("2025 → the whole tax year 2025-04-06…2026-04-05, label 'MTD Final 2025/26'", () => {
    expect(mtdFinalForTaxYear(2025)).toEqual({
      period_start: "2025-04-06",
      period_end: "2026-04-05",
      period_label: "MTD Final 2025/26",
    });
  });
});

describe("buildMtdQuarterLines", () => {
  it("emits 4 period-carrying one-off lines per selected year", () => {
    const lines = buildMtdQuarterLines(
      { service_id: "svc-q", default_price: 30 },
      [2024, 2025]
    );
    expect(lines).toHaveLength(8);
    for (const l of lines) {
      expect(l.service_id).toBe("svc-q");
      expect(l.quantity).toBe(1);
      expect(l.unit_price).toBe(30);
      expect(l.billing_frequency).toBe("now");
      expect(l.period_label).toMatch(/^MTD Q[1-4] 20\d\d\/\d\d$/);
    }
  });

  it("dedupes by period_label and sorts years ascending (oldest quarter first)", () => {
    const lines = buildMtdQuarterLines(
      { service_id: "svc-q", default_price: 30 },
      [2025, 2024, 2025]
    );
    expect(lines).toHaveLength(8);
    expect(lines.map((l) => l.period_label)).toEqual([
      "MTD Q1 2024/25",
      "MTD Q2 2024/25",
      "MTD Q3 2024/25",
      "MTD Q4 2024/25",
      "MTD Q1 2025/26",
      "MTD Q2 2025/26",
      "MTD Q3 2025/26",
      "MTD Q4 2025/26",
    ]);
  });

  it("honours an explicit billing_frequency override", () => {
    const lines = buildMtdQuarterLines(
      { service_id: "svc-q", default_price: 30, billing_frequency: "monthly" },
      [2025]
    );
    expect(lines.every((l) => l.billing_frequency === "monthly")).toBe(true);
  });
});

describe("buildMtdFinalLines", () => {
  it("emits one final-declaration line per selected year (deduped, ascending)", () => {
    const lines = buildMtdFinalLines(
      { service_id: "svc-f", default_price: 120 },
      [2025, 2024, 2025]
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.period_label)).toEqual([
      "MTD Final 2024/25",
      "MTD Final 2025/26",
    ]);
    expect(lines[0]).toMatchObject({
      service_id: "svc-f",
      quantity: 1,
      unit_price: 120,
      billing_frequency: "now",
      period_start: "2024-04-06",
      period_end: "2025-04-05",
    });
  });
});

describe("MTD service-code guards", () => {
  it("exposes the two MTD catalog codes", () => {
    expect(MTD_SERVICE_CODES).toEqual(["mtd_quarter", "mtd_itsa_final"]);
  });

  it("distinguishes quarter vs final codes", () => {
    expect(isMtdQuarterServiceCode("mtd_quarter")).toBe(true);
    expect(isMtdQuarterServiceCode("mtd_itsa_final")).toBe(false);
    expect(isMtdFinalServiceCode("mtd_itsa_final")).toBe(true);
    expect(isMtdFinalServiceCode("mtd_quarter")).toBe(false);
    expect(isMtdQuarterServiceCode("sa_non_mtd")).toBe(false);
    expect(isMtdFinalServiceCode(null)).toBe(false);
  });
});
