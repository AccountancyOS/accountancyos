import { describe, it, expect } from "vitest";
import { canBeSignatory, SIGNATORY_CAP, signatoryCapReached } from "@/lib/company-signatory-model";

describe("canBeSignatory", () => {
  it("returns true for an active officer (resigned_at is null)", () => {
    expect(canBeSignatory({ resigned_at: null })).toBe(true);
  });

  it("returns false for a resigned officer", () => {
    expect(canBeSignatory({ resigned_at: "2026-01-01" })).toBe(false);
  });
});

describe("signatoryCapReached", () => {
  it("exposes the cap as 10", () => {
    expect(SIGNATORY_CAP).toBe(10);
  });

  it("is not reached below the cap", () => {
    expect(signatoryCapReached(0)).toBe(false);
    expect(signatoryCapReached(9)).toBe(false);
  });

  it("is reached at exactly the cap", () => {
    expect(signatoryCapReached(10)).toBe(true);
  });

  it("is reached above the cap", () => {
    expect(signatoryCapReached(11)).toBe(true);
  });
});
