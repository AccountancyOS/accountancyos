import { describe, it, expect } from "vitest";
import { billingBlocksAccess } from "@/lib/billing-gate-model";

describe("billingBlocksAccess (T1-9)", () => {
  it("blocks a canceled org on a normal app route", () => {
    expect(billingBlocksAccess("canceled", "/jobs")).toBe(true);
    expect(billingBlocksAccess("canceled", "/")).toBe(true);
  });

  it("never blocks the /subscription route itself (so the org can resubscribe)", () => {
    expect(billingBlocksAccess("canceled", "/subscription")).toBe(false);
    expect(billingBlocksAccess("canceled", "/subscription/success")).toBe(false);
  });

  it("does not block active / past_due / pending_payment / trialing", () => {
    for (const status of ["active", "past_due", "pending_payment", "trialing"]) {
      expect(billingBlocksAccess(status, "/jobs")).toBe(false);
    }
  });

  it("does not block when billing status is missing", () => {
    expect(billingBlocksAccess(null, "/jobs")).toBe(false);
    expect(billingBlocksAccess(undefined, "/jobs")).toBe(false);
    expect(billingBlocksAccess("", "/jobs")).toBe(false);
  });
});
