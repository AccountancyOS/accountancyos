/**
 * Billing status types
 * Matches the database enum for organization billing states
 */

export type BillingStatus = 
  | 'pending_payment' 
  | 'active' 
  | 'past_due' 
  | 'canceled';

export interface SubscriptionInfo {
  subscribed: boolean;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  planName: string | null;
  stripeCustomerId: string | null;
  checkedAt: string | null;
}

export interface OrganizationBilling {
  billingStatus: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  pendingCheckoutSessionId: string | null;
}

/**
 * Check if billing status allows full access
 */
export function hasActiveSubscription(status: BillingStatus | null | undefined): boolean {
  return status === 'active';
}

/**
 * Check if billing status requires payment attention
 */
export function requiresPaymentAttention(status: BillingStatus | null | undefined): boolean {
  return status === 'past_due' || status === 'pending_payment';
}

/**
 * Get user-friendly billing status message
 */
export function getBillingStatusMessage(status: BillingStatus | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Your subscription is active';
    case 'past_due':
      return 'Payment past due - please update your payment method';
    case 'canceled':
      return 'Subscription canceled';
    case 'pending_payment':
    default:
      return 'Complete payment to activate your subscription';
  }
}
