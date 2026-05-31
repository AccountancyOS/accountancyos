## What's happening

You signed up on the preview domain (`accountancyos.lovable.app`), but the `stripe-checkout` edge function told Stripe to return you to the **production** domain (`app.accountancyos.com`). Your Supabase session cookie/localStorage only exists on the origin you signed up on, so the production domain saw no user → `ProtectedRoute` redirected you to `/auth`. The onboarding checklist never got a chance to render.

Evidence from the edge-function log for your last attempt:
```
[STRIPE-CHECKOUT] Resolved app URLs - {
  "appBaseUrl": "https://app.accountancyos.com",
  "successUrl": "https://app.accountancyos.com/onboarding-wizard?session_id={...}"
}
```
And the auth log shows a `refresh_token_not_found` on the preview right after the Stripe round-trip, plus a fresh password login on `app.accountancyos.com` a couple of minutes later — the classic cross-origin session-loss footprint.

Root cause: `resolveAppBaseUrl()` in `supabase/functions/stripe-checkout/index.ts` honours `APP_PUBLIC_URL` (set to `https://app.accountancyos.com`) **before** it looks at the request origin. So preview signups get bounced to production after payment.

## Fix

### 1. Keep Stripe's return on the same origin (edge function)

`supabase/functions/stripe-checkout/index.ts` — rework `resolveAppBaseUrl` so the request origin wins for any known-safe host, and the env var is only the fallback when no origin header is present:

```text
if origin header host in [
  localhost, 127.0.0.1,
  *.lovable.app, *.lovableproject.com,
  app.accountancyos.com, accountancyos.com, www.accountancyos.com
] -> use that origin
else -> APP_PUBLIC_URL -> hard-coded https://app.accountancyos.com
```

Effect: preview signups return to preview, custom-domain signups return to the custom domain. Session survives the round-trip. No new env vars, no DB changes.

### 2. Land on the onboarding checklist, not the standalone wizard

You said the expected destination is the dismissible practice-onboarding checklist on the Overview dashboard. Today, both `OnboardingWizard.tsx` (post-verification) and `CompletePayment.tsx` (post-polling) push everyone into `/onboarding-wizard`. Change those success branches to:

- `organization.onboarding_completed === true` → `/welcome` (current behaviour)
- otherwise → `/overview` (the Overview dashboard, where the checklist lives)

The `/onboarding-wizard` route stays available for users who explicitly want the step-by-step wizard.

### 3. Self-heal a lost-session bounce on sign-in

Small guard in `src/pages/Auth.tsx#handleSignIn`: if `localStorage.pending_org_id` is set after a successful sign-in, navigate to `/complete-payment` instead of `/`, so a user who got bounced (or who returns later) lands back in the checkout/verification flow rather than the empty dashboard.

## Acceptance check

1. Sign up on the preview URL with a fresh email + click the confirmation email.
2. Stripe Checkout opens on the same origin.
3. Apply promo `LEON`, pay with `4242 4242 4242 4242`.
4. Return lands on the **preview** origin, still signed in.
5. After the brief verifying spinner, you land on `/overview` with the practice onboarding checklist visible.
6. Repeat on `app.accountancyos.com` — same behaviour, no cross-origin bounce.

## Files touched

- `supabase/functions/stripe-checkout/index.ts` — broaden `resolveAppBaseUrl` allow-list; prefer request origin.
- `src/pages/OnboardingWizard.tsx` — success branch redirects to `/overview` (unless wizard explicitly requested).
- `src/pages/CompletePayment.tsx` — verifying-success branch redirects to `/overview`.
- `src/pages/Auth.tsx` — sign-in self-heal to `/complete-payment` when `pending_org_id` is present.
