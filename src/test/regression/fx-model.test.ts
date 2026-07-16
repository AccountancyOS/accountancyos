import { describe, it, expect } from "vitest";
import { isUsableRate, fxRateBlocksPosting } from "@/lib/fx-model";

describe("isUsableRate (UI-2)", () => {
  it("accepts finite positive numbers (incl. numeric strings)", () => {
    expect(isUsableRate(1.23)).toBe(true);
    expect(isUsableRate("0.8654")).toBe(true);
    expect(isUsableRate(1)).toBe(true);
  });

  it("rejects zero, negatives, NaN, null/undefined and junk", () => {
    expect(isUsableRate(0)).toBe(false);
    expect(isUsableRate(-1.2)).toBe(false);
    expect(isUsableRate(NaN)).toBe(false);
    expect(isUsableRate(null)).toBe(false);
    expect(isUsableRate(undefined)).toBe(false);
    expect(isUsableRate("not-a-number")).toBe(false);
    expect(isUsableRate(Infinity)).toBe(false);
  });
});

describe("fxRateBlocksPosting (UI-2)", () => {
  it("blocks a non-GBP journal whose rate is the fallback sentinel", () => {
    expect(fxRateBlocksPosting({ currency: "EUR", source: "fallback" })).toBe(true);
  });

  it("does not block when a real rate source was resolved", () => {
    for (const source of ["cache", "api", "identity", "manual"]) {
      expect(fxRateBlocksPosting({ currency: "EUR", source })).toBe(false);
    }
  });

  it("never blocks GBP journals (no conversion needed)", () => {
    expect(fxRateBlocksPosting({ currency: "GBP", source: "fallback" })).toBe(false);
  });
});
