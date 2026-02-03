

# Issue Analysis: Incomplete Stripe Signup Causes Slow/Frozen UI

## Problem Summary

When a user creates an account but does **not** complete the Stripe checkout process (e.g., closes the Stripe page, clicks cancel, or abandons the flow), the application can become extremely slow or appear frozen.

**Evidence from database:** Found 10+ organizations with `billing_status: 'pending_payment'` and no `stripe_customer_id` - these are users who signed up but never completed payment.

---

## Root Cause Analysis

The issue stems from **multiple synchronous Stripe API calls** being made during the authentication flow, combined with polling loops that create a cascading effect:

### 1. On Login/Page Load: Subscription Check Cascade

When a user with `billing_status = 'pending_payment'` logs in, the following happens:

```text
1. AppProvider loads → calls checkSubscriptionFromStripe()
2. check-subscription edge function:
   - Calls stripe.customers.list() (API call to Stripe)
   - If no cache, calls stripe.subscriptions.list() (another API call)
3. Index.tsx routing evaluates → redirects to /complete-payment
4. CompletePayment loads → calls check-subscription AGAIN
5. CompletePayment also polls refreshOrganization() up to 10 times
6. Each poll can trigger more Stripe API calls
```

### 2. Cold Start + Stripe API Latency

- **Edge function cold starts:** Each edge function invocation can take 1-3 seconds for cold starts
- **Stripe API calls:** Each Stripe API call adds 200-500ms
- **Multiple sequential calls:** With 2+ API calls per subscription check, this compounds to 5+ seconds per check
- **Polling multiplier:** If polling occurs (up to 10 attempts), this becomes 50+ seconds of blocking operations

### 3. No Short-Circuit for Known Pending State

The current flow **always** calls Stripe even when:
- The organization has no `stripe_customer_id` (never had a customer)
- The `billing_status` is already `pending_payment`
- There's no Stripe return guard indicating a recent checkout

---

## Technical Implementation Plan

### File 1: `src/lib/app-context.tsx`

**Changes:** Add early-exit logic to skip Stripe API calls when billing status is clearly not active and there's no Stripe customer.

| Current Behavior | New Behavior |
|-----------------|--------------|
| Always calls `check-subscription` edge function | Skip if `billing_status != 'active'` AND no `stripe_customer_id` |
| Waits for edge function response | Use local organization data for routing decisions |

**New Function:** `shouldSkipStripeCheck(org: Organization): boolean`

```text
Returns true if:
- org.billing_status is 'pending_payment' or null
- org.stripe_customer_id is null
- No localStorage Stripe return guard is active
```

### File 2: `supabase/functions/check-subscription/index.ts`

**Changes:** Add early exit when organization has no Stripe customer ID.

| Change | Purpose |
|--------|---------|
| Check `organizations.stripe_customer_id` first | If null, immediately return `subscribed: false` without calling Stripe API |
| Cache the result | Prevent repeated edge function calls |

This eliminates unnecessary Stripe API calls for users who never completed checkout.

### File 3: `src/pages/CompletePayment.tsx`

**Changes:** Remove redundant polling when user has clearly never completed payment.

| Current Behavior | New Behavior |
|-----------------|--------------|
| Polls on any recent Stripe return guard | Only poll if `stripe_return_ts` guard exists AND has `stripe_return_session_id` |
| 10 polling attempts regardless of context | Skip polling entirely for users who never had a checkout session |

### File 4: `src/pages/Index.tsx`

**Changes:** Add routing shortcut for known pending payment state.

| Current Behavior | New Behavior |
|-----------------|--------------|
| Waits for all loading states before routing | If `billing_status === 'pending_payment'` and no Stripe guard, route immediately to `/complete-payment` |

---

## Performance Impact

| Scenario | Current Time | After Fix |
|----------|-------------|-----------|
| User with no Stripe customer logs in | 3-10 seconds (edge function + Stripe API) | ~500ms (local check only) |
| User cancels Stripe checkout and returns | 10-50 seconds (polling loops) | ~1 second (immediate redirect) |
| User with active subscription | ~2 seconds | ~2 seconds (no change) |

---

## Files Summary

| File | Changes |
|------|---------|
| `src/lib/app-context.tsx` | Add `shouldSkipStripeCheck()` helper, skip edge function call when appropriate |
| `supabase/functions/check-subscription/index.ts` | Early exit when no `stripe_customer_id` exists |
| `src/pages/CompletePayment.tsx` | Remove redundant polling for non-Stripe-return cases |
| `src/pages/Index.tsx` | Add early routing for known `pending_payment` state |

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| User had subscription that was canceled | `stripe_customer_id` exists, so normal Stripe check runs |
| User just completed checkout, webhook pending | Stripe return guard triggers normal polling |
| User's cache is stale | Cache TTL logic still applies when Stripe check is needed |
| User has `past_due` status | Normal Stripe check runs to get latest status |

