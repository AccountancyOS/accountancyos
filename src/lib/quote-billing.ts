import { isIncludedLine } from "./quote-defaults";

/**
 * Pure, side-effect-free model of the onboarding Stripe checkout builder.
 *
 * This is the single source of truth for HOW an accepted proposal's lines map to
 * Stripe line items. The `onboarding-stripe-checkout` edge function (Deno) mirrors
 * this logic byte-for-byte — it cannot import this module directly across the
 * app/edge boundary, so a regression test asserts the two stay in sync.
 *
 * Phase 1 · Task 2: zero-fee "Included" lines (unit_price === 0) are EXCLUDED
 * from both the recurring and one-off builders. When no chargeable line remains,
 * `skipped` is returned so the caller skips Stripe entirely (no session created).
 */

export interface CheckoutLineInput {
  service_name?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  subtotal?: number | string | null;
  billing_frequency?: string | null;
}

export interface StripePriceLine {
  quantity: number;
  price_data: {
    currency: string;
    unit_amount: number;
    recurring?: { interval: "month" };
    product_data: { name: string };
  };
}

export interface OnboardingCheckoutPlan {
  /** true when nothing is chargeable → caller must NOT call Stripe. */
  skipped: boolean;
  reason?: "no_chargeable_lines";
  isSubscription: boolean;
  lineItems: StripePriceLine[];
  addInvoiceItems: StripePriceLine[];
}

const isMonthly = (l: CheckoutLineInput): boolean =>
  (l.billing_frequency ?? "annual") === "monthly";

export function buildOnboardingCheckout(
  lines: CheckoutLineInput[] | null | undefined,
  currency: string
): OnboardingCheckoutPlan {
  const cur = (currency || "GBP").toLowerCase();

  // Zero-fee "Included" lines are excluded from Stripe entirely.
  const chargeable = (lines ?? []).filter((l) => !isIncludedLine(l));
  const oneOff = chargeable.filter((l) => !isMonthly(l));
  const monthly = chargeable.filter((l) => isMonthly(l));

  if (oneOff.length === 0 && monthly.length === 0) {
    return {
      skipped: true,
      reason: "no_chargeable_lines",
      isSubscription: false,
      lineItems: [],
      addInvoiceItems: [],
    };
  }

  const isSubscription = monthly.length > 0;

  const oneOffItem = (l: CheckoutLineInput): StripePriceLine => ({
    quantity: Number(l.quantity ?? 1),
    price_data: {
      currency: cur,
      unit_amount: Math.round(Number(l.subtotal) * 100),
      product_data: { name: l.service_name ?? "Service" },
    },
  });

  const monthlyItem = (l: CheckoutLineInput): StripePriceLine => ({
    quantity: Number(l.quantity ?? 1),
    price_data: {
      currency: cur,
      unit_amount: Math.round((Number(l.subtotal) / 12) * 100),
      recurring: { interval: "month" },
      product_data: { name: l.service_name ?? "Service" },
    },
  });

  const lineItems = isSubscription ? monthly.map(monthlyItem) : oneOff.map(oneOffItem);
  // In subscription mode, one-off positive lines ride on the first invoice.
  const addInvoiceItems = isSubscription ? oneOff.map(oneOffItem) : [];

  return { skipped: false, isSubscription, lineItems, addInvoiceItems };
}
