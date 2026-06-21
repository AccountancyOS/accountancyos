# Sprint 1 — Increment 3a Implementation Plan: Onboarding token threading (additive)

> REQUIRED SUB-SKILL: superpowers:executing-plans. 3a is additive/backward-compatible (validate-if-present). The enforcement flip (3b) is a separate later plan.

**Goal:** Thread the per-application `access_token` through the public onboarding RPCs (optional, validate-if-present) and the trusted token-delivery path, so the frontend can carry it — without breaking any existing onboarding (no token sent → proceed as today).

## Global Constraints
- Adding the optional param changes a function's signature → use `DROP FUNCTION IF EXISTS public.fn(<old sig>); CREATE FUNCTION public.fn(<new sig>)`; reproduce the body VERBATIM from its latest source migration + add only the validation block; re-`GRANT EXECUTE … TO anon, authenticated`. Prove with `diff` that only the param + validation block changed.
- Validation block (same in every RPC), placed immediately after the row is loaded / at the top:
  ```sql
  IF p_access_token IS NOT NULL
     AND NOT public.validate_onboarding_access_token(p_application_id, p_access_token) THEN
    RAISE EXCEPTION 'Invalid onboarding access token' USING ERRCODE='42501';
  END IF;
  ```
  (NULL token → skip → legacy behaviour. Provided → must be valid.)
- Migration filename: `supabase/migrations/<UTC ts>_<uuid>.sql`. Commit each task; fetch+rebase before push.
- Frontend: `npm run build` must pass; pass the token as the new RPC arg; read it from `useSearchParams`.

## Task 1: `validate_onboarding_access_token()` helper

**File:** new migration. Pure read-only, SECURITY DEFINER, `search_path=public`.
```sql
CREATE OR REPLACE FUNCTION public.validate_onboarding_access_token(p_application_id uuid, p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_applications
    WHERE id = p_application_id
      AND access_token = p_token
      AND (access_token_expires_at IS NULL OR access_token_expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION public.validate_onboarding_access_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_onboarding_access_token(uuid, text) TO anon, authenticated, service_role;
```
- [ ] Write migration; commit + push. (No app effect yet.)

## Task 2: read/EL RPCs gain optional token (validate-if-present)
For each — reproduce verbatim from its latest source, add `p_access_token text DEFAULT NULL` as the LAST param, insert the validation block after the application row is fetched, re-GRANT:
- `public_get_onboarding(p_application_id uuid)` — source `20260617114623`.
- `public_preview_engagement_letter(p_application_id uuid)` — source `20260604205211`.
- `public_sign_engagement_letter(p_application_id uuid, p_signature_data jsonb)` — source `20260604205211`. (token becomes 3rd param.)
- [ ] One migration; DROP+CREATE each; diff each body; commit + push.

## Task 3: AML/billing/submit RPCs gain optional token (validate-if-present)
Same pattern for:
- `public_record_aml_upload(uuid, text, text, text, integer, text)` — source `20260603112138`.
- `public_skip_billing(uuid)` — source `20260603112138`.
- `public_complete_billing(uuid, text, numeric)` — source `20260603112138`.
- `public_submit_onboarding_for_review(uuid, text)` — source `20260603143837`.
- [ ] One migration; DROP+CREATE each; diff; commit + push.

## Task 4: quote-accept path returns the token (trusted channel)
- `public_get_quote_by_token(p_token uuid)` — source `20260604192142`: when it resolves/creates the onboarding application, add `access_token` of that application to the returned JSON (`'onboarding_access_token', <token>`).
- `public_accept_quote_by_token(p_token text)` — source: the Increment-2 Task A version (latest): add `'onboarding_access_token'` to the success RETURN (look up the onboarding application's token for the accepted quote).
- Safe: these RPCs are gated by the secret quote token, so returning the onboarding token here does not widen exposure.
- [ ] One migration; diff (only the added return field); commit + push.

## Task 5: frontend threading
- `PublicQuoteView.tsx`: capture `onboarding_access_token` from the accept/get-quote response; navigate to `/onboard/${appId}?token=${token}` (both nav sites, lines ~79 and ~111). If token missing, fall back to `/onboard/${appId}` (legacy).
- `PublicOnboarding.tsx`: read `const token = searchParams.get('token')`; pass `p_access_token: token ?? undefined` (i.e. only when present) to every onboarding RPC call (`public_get_onboarding`, `public_preview_engagement_letter`, `public_sign_engagement_letter`, `public_record_aml_upload`, `public_skip_billing`, `public_submit_onboarding_for_review`); preserve `token` in any `setSearchParams`/navigation.
- `onboarding-stripe-checkout/index.ts`: thread the token into success/cancel URLs (`?token=…&billing=…`) — read it from the request body (frontend passes it in the invoke body).
- `lifecycle_send_back_onboarding` (migration): build the resume link as `/onboard/<id>?token=<access_token>`.
- [ ] `npm run build` passes; commit + push.

## Live test (after Task 5 deploys)
Fresh quote → accept → `/onboard/:id?token=…` → sign EL, upload AML, billing, submit all succeed; an old `/onboard/:id` link (no token) still works.

## Self-Review
- Every onboarding RPC in the design's list is covered (Tasks 2–3); token delivery via all three channels (Task 4 + Task 5). Validation helper (Task 1). Enforcement flip is explicitly 3b (separate).
- Backward-compatible: NULL token → legacy everywhere. Diff-verify each RPC body.
