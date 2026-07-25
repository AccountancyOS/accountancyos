import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isIncludedLine } from "@/lib/quote-defaults";
import { buildOnboardingCheckout } from "@/lib/quote-billing";

// ---------------------------------------------------------------------------
// Phase 1 · Task 2 — zero-fee "Included" items.
// "Included" is DERIVED from unit_price === 0 (equivalently subtotal === 0).
// There is NO is_chargeable column/flag. Included lines are excluded from the
// Stripe line-item builders AND from the displayed one-off + monthly totals.
// ---------------------------------------------------------------------------

describe("isIncludedLine truth table", () => {
  it("treats unit_price === 0 as Included", () => {
    expect(isIncludedLine({ unit_price: 0, subtotal: 0 })).toBe(true);
    expect(isIncludedLine({ unit_price: "0", subtotal: "0" })).toBe(true);
    expect(isIncludedLine({ unit_price: 0.0 })).toBe(true);
  });

  it("treats any positive unit_price as chargeable", () => {
    expect(isIncludedLine({ unit_price: 120, subtotal: 120 })).toBe(false);
    expect(isIncludedLine({ unit_price: "0.01", subtotal: "0.01" })).toBe(false);
    expect(isIncludedLine({ unit_price: 999.99 })).toBe(false);
  });

  it("falls back to subtotal when unit_price is absent", () => {
    expect(isIncludedLine({ subtotal: 0 })).toBe(true);
    expect(isIncludedLine({ subtotal: 500 })).toBe(false);
  });

  it("never treats a missing/empty line as Included (avoids false positives)", () => {
    expect(isIncludedLine({})).toBe(false);
    expect(isIncludedLine(null)).toBe(false);
    expect(isIncludedLine(undefined)).toBe(false);
    expect(isIncludedLine({ unit_price: null, subtotal: null })).toBe(false);
  });
});

describe("buildOnboardingCheckout — excludes Included (£0) lines from Stripe", () => {
  it("emits Stripe items only for positive-value lines (mixed £0 + positive, one-off)", () => {
    const plan = buildOnboardingCheckout(
      [
        { service_name: "Accounts", quantity: 1, unit_price: 600, subtotal: 600, billing_frequency: "now" },
        { service_name: "Free advice call", quantity: 1, unit_price: 0, subtotal: 0, billing_frequency: "now" },
      ],
      "GBP"
    );
    expect(plan.skipped).toBe(false);
    expect(plan.isSubscription).toBe(false);
    expect(plan.lineItems).toHaveLength(1);
    expect(plan.lineItems[0].price_data.product_data.name).toBe("Accounts");
    expect(plan.lineItems[0].price_data.unit_amount).toBe(60000);
    expect(plan.addInvoiceItems).toHaveLength(0);
  });

  it("excludes £0 monthly lines from the subscription line items", () => {
    const plan = buildOnboardingCheckout(
      [
        { service_name: "Bookkeeping", quantity: 1, unit_price: 1200, subtotal: 1200, billing_frequency: "monthly" },
        { service_name: "Included portal", quantity: 1, unit_price: 0, subtotal: 0, billing_frequency: "monthly" },
        { service_name: "Setup fee", quantity: 1, unit_price: 300, subtotal: 300, billing_frequency: "now" },
      ],
      "GBP"
    );
    expect(plan.skipped).toBe(false);
    expect(plan.isSubscription).toBe(true);
    expect(plan.lineItems).toHaveLength(1);
    expect(plan.lineItems[0].price_data.product_data.name).toBe("Bookkeeping");
    expect(plan.lineItems[0].price_data.unit_amount).toBe(10000); // 1200/12*100
    expect(plan.lineItems[0].price_data.recurring?.interval).toBe("month");
    // one-off positive line rides on the first invoice
    expect(plan.addInvoiceItems).toHaveLength(1);
    expect(plan.addInvoiceItems[0].price_data.product_data.name).toBe("Setup fee");
  });

  it("all-£0 lines → skipped with reason, no Stripe items", () => {
    const plan = buildOnboardingCheckout(
      [
        { service_name: "Included A", quantity: 1, unit_price: 0, subtotal: 0, billing_frequency: "now" },
        { service_name: "Included B", quantity: 1, unit_price: 0, subtotal: 0, billing_frequency: "monthly" },
      ],
      "GBP"
    );
    expect(plan.skipped).toBe(true);
    expect(plan.reason).toBe("no_chargeable_lines");
    expect(plan.lineItems).toHaveLength(0);
    expect(plan.addInvoiceItems).toHaveLength(0);
  });

  it("empty line set → skipped", () => {
    const plan = buildOnboardingCheckout([], "GBP");
    expect(plan.skipped).toBe(true);
    expect(plan.reason).toBe("no_chargeable_lines");
  });
});

describe("onboarding-stripe-checkout edge function stays in sync", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../supabase/functions/onboarding-stripe-checkout/index.ts"),
    "utf8"
  );

  it("filters out Included (£0) lines before building Stripe items", () => {
    expect(src).toMatch(/isIncludedLine/);
  });

  it("skips Stripe entirely and returns no_chargeable_lines when nothing is chargeable", () => {
    expect(src).toMatch(/no_chargeable_lines/);
    expect(src).toMatch(/skipped:\s*true/);
  });
});
