# Sprint 1 — Increment 3 Design: Onboarding access-token enforcement (IDOR)

**Date:** 2026-06-21
**Status:** Approved (enforcement tied to canonical flag; storage IDOR deferred). Design locked → plan (3a) next.
**Scope:** Close the bare-UUID IDOR on the public onboarding flow by threading the per-application `access_token` (added in `20260617114623`) through every public onboarding RPC and the token-delivery path. Backward-compatible cutover so no in-flight onboarding is locked out.

## Current state (verified)

- Route `/onboard/:applicationId` (App.tsx:178); `PublicOnboarding.tsx` reads only the bare UUID, never a token.
- The token exists per application (`onboarding_applications.access_token`, NOT NULL UNIQUE, `access_token_expires_at` default now()+90d) but is **deliberately stripped** from `public_get_onboarding`'s response — so the client has no way to read it via the UUID (correct).
- The onboarding RPCs accept only `p_application_id` (anon, bare UUID): `public_get_onboarding`, `public_preview_engagement_letter`, `public_sign_engagement_letter`, `public_record_aml_upload`, `public_skip_billing`, `public_complete_billing`, `public_submit_onboarding_for_review`.
- The client reaches `/onboard` from: (a) `PublicQuoteView` after accept (`navigate('/onboard/'+id)`, no token); (b) the emailed resume link built in `lifecycle_send_back_onboarding` (`/onboard/<id>`, no token); (c) Stripe round-trip URLs in `onboarding-stripe-checkout` (`/onboard/<id>?billing=…`, no token).
- The quote-accept RPCs (`public_get_quote_by_token`, `public_accept_quote_by_token`) are themselves secret-token-gated and do **not** currently return the access_token.

## Trusted token-delivery channels

The access_token must reach the client only through channels already protected by a secret, never via the guessable UUID:
1. **Quote acceptance** (secret quote token) → return `access_token`; `PublicQuoteView` builds `/onboard/:id?token=…`.
2. **Emailed resume link** (`lifecycle_send_back_onboarding`, SECURITY DEFINER) → build `/onboard/:id?token=…`.
3. **Stripe round-trip** (`onboarding-stripe-checkout`) → preserve `?token=…` on success/cancel URLs.

## Model: validate-if-present, then flag-gated required

- **Validation helper** `public.validate_onboarding_access_token(p_application_id uuid, p_token text) → boolean`: true iff a row exists with that id whose `access_token = p_token` and `access_token_expires_at > now()`.
- **Phase 3a (additive, all orgs, no lockout):** every onboarding RPC gains an **optional** last param `p_access_token text DEFAULT NULL`. Behaviour: token **provided & valid** → proceed; token **provided & invalid/expired** → reject; token **absent (NULL)** → proceed (legacy). The quote-accept RPCs return the token; the frontend + email + Stripe URLs thread it. Nothing breaks: old links (no token) still work; new links carry a valid token.
- **Phase 3b (enforcement flip, later):** for an application whose org has `canonical_lifecycle_enabled = true`, a NULL/invalid token is **rejected** (bare-UUID access closed). Non-flag orgs stay in validate-if-present until a later broadening. This rolls enforcement out with the same test org as the rest of Sprint 1 (Increment 5), verifiable in-app first.

Adding the optional param requires `DROP FUNCTION … ; CREATE FUNCTION …` per RPC (a new arg signature can't be added via CREATE OR REPLACE) — bodies reproduced verbatim + the token check; re-GRANT to anon, authenticated.

## Out of scope (deferred, confirmed)

- **Document-upload storage IDOR**: the `is_active_onboarding_path` storage RLS gates uploads/reads by path+status, not token. RLS can't take an arbitrary token param, so closing it needs path-embedded tokens or routing uploads through an edge function — a separate follow-up increment.
- The 3b enforcement flip is its own reviewed step after 3a is verified.

## What changes with flag OFF / no token (3a)

Nothing breaks. 3a only *adds* an optional param and *returns* the token from already-secret RPCs. An onboarding with no token in its URL (existing in-flight session) sends no token → RPCs proceed as today. A new onboarding carries a valid token → proceeds. Only a delivery bug (wrong token) would reject — caught immediately in the in-app test below.

## Live test plan (3a, app-level)

1. New quote → accept → land on `/onboard/:id?token=…` (token now in the URL).
2. Sign the engagement letter, upload AML, set/skip billing, submit → all succeed (valid token accepted).
3. An existing/old onboarding link without a token still works (legacy path).
4. (Later, 3b, test org) opening `/onboard/:id` **without** the token → blocked.

## Rollback

- 3a is additive; to revert, redeploy the prior RPC definitions (kept verbatim in the plan) and revert the frontend.
- 3b: per-org via the canonical flag.

## Decomposition (3a tasks)

1. `validate_onboarding_access_token()` helper (pure, reusable).
2. Read/EL RPCs gain optional token + validate-if-present: `public_get_onboarding`, `public_preview_engagement_letter`, `public_sign_engagement_letter`.
3. AML/billing/submit RPCs gain optional token + validate-if-present: `public_record_aml_upload`, `public_skip_billing`, `public_complete_billing`, `public_submit_onboarding_for_review`.
4. Quote-accept path returns `access_token`: `public_get_quote_by_token`, `public_accept_quote_by_token`.
5. Frontend threading: `PublicQuoteView` (build `/onboard?token=`), `PublicOnboarding` (read token, pass to every RPC), Stripe URLs, emailed resume link.
