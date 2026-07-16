/**
 * Pure billing-gate logic (no React/DB import), unit-tested. Decides whether the app should be
 * blocked (redirected to /subscription) for the active organization's billing state.
 */

// Subscription states that block access until the org resubscribes. 'canceled' = the Stripe
// subscription ended — leaving full access is the revenue leak (T1-9). past_due (dunning grace)
// and pending_payment (new, pre-subscribe) are intentionally NOT blocked here to avoid trapping
// paying customers mid-retry or orgs still completing signup; revisit as a product decision.
export const BLOCKING_BILLING_STATES = ["canceled"] as const;

// Routes still reachable while blocked, so the org can actually fix its subscription.
const EXEMPT_PREFIXES = ["/subscription"];

export function billingBlocksAccess(
  billingStatus: string | null | undefined,
  pathname: string,
): boolean {
  if (!billingStatus || !BLOCKING_BILLING_STATES.includes(billingStatus as (typeof BLOCKING_BILLING_STATES)[number])) {
    return false;
  }
  return !EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}
