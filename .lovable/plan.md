## Problem

When a user re-opens an already-accepted quote link, `PublicQuoteView` shows "Proposal accepted. Continuing to your onboarding…" but never navigates anywhere. The auto-redirect only runs in the `accept()` handler from a fresh acceptance — when the page loads an existing accepted quote, `onboardingId` stays `null`, so neither the redirect nor the "Continue Onboarding" button appears.

## Fix

1. **DB**: Update `public_get_quote_by_token` to also return `onboarding_application_id` — look up the latest non-cancelled onboarding application linked to `v_quote.id` and include it in the payload.

2. **Frontend (`src/pages/PublicQuoteView.tsx`)**:
   - Extend the `QuotePayload` type with `onboarding_application_id?: string | null`.
   - On load, if the payload includes `onboarding_application_id`, store it in `onboardingId`.
   - When the quote is already accepted and we have `onboardingId`, auto-navigate to `/onboard/:id` after a short delay (same behaviour as fresh acceptance), and keep the visible "Continue Onboarding" button as a fallback.

## Scope

- One migration updating the SECURITY DEFINER RPC.
- One file edit: `src/pages/PublicQuoteView.tsx`.
- No schema changes, no other pages affected.
