# Production-safe fix: signup, confirmation domain, org creation, /complete-payment

## 1. Supabase Auth URL config (via `configure_auth` + manual URL list)
Set Site URL = `https://app.accountancyos.com`. Add to allow-list:
- `https://app.accountancyos.com/**` (production)
- `https://accountancyos.lovable.app/**`
- `https://id-preview--484d38ef-d5f4-4a95-9b44-cfbcba7d7c13.lovable.app/**`
- `https://484d38ef-d5f4-4a95-9b44-cfbcba7d7c13.lovableproject.com/**`
- `http://localhost:8080/**`

Note: the redirect-URL list is set via the Auth admin API; `configure_auth` only covers signup/hibp flags. I'll apply the URL list through the supabase admin endpoint in the same step.

## 2. App-config: pin production redirect base

`src/lib/app-config.ts` — change `getAppUrl()` to:
- If hostname is `app.accountancyos.com` or `accountancyos.com` → return `https://app.accountancyos.com`.
- If hostname matches `*.lovable.app`, `*.lovableproject.com`, or `localhost` → return `window.location.origin` (dev/preview).
- Otherwise → `https://app.accountancyos.com` (production-safe default).

Then route every auth redirect through `getAppUrl()` instead of raw `window.location.origin`:
- `src/pages/Auth.tsx` — signup `emailRedirectTo`, password reset `redirectTo`.
- `src/pages/ConfirmEmail.tsx` — resend confirmation.
- Any magic-link / invite / email-change call sites surfaced by audit.

Stripe success/cancel URLs in the `create-checkout` edge function — switch from incoming `origin` header to `APP_PUBLIC_URL` env var (set to `https://app.accountancyos.com`), with the request `origin` used only when running against `localhost`/preview.

## 3. Database — enforce one-org-per-user + clean duplicates + idempotent RPC

Single migration:

```sql
-- (a) Verify no other duplicates beyond the known one. If any exist beyond
--     968f4acc-…, RAISE EXCEPTION so the migration aborts and we triage manually.
DO $$
DECLARE extra_dupes int;
BEGIN
  SELECT count(*) INTO extra_dupes FROM (
    SELECT user_id FROM organization_users
    WHERE user_id <> '968f4acc-f7ba-40ce-9735-3deb11835442'
    GROUP BY user_id HAVING count(*) > 1
  ) t;
  IF extra_dupes > 0 THEN
    RAISE EXCEPTION 'Unexpected duplicate memberships found; aborting migration.';
  END IF;
END $$;

-- (b) Remove the known duplicate org + membership for Leon.
--     Pre-check: confirm no dependent rows exist on ccbbc75a-… across all
--     tables that reference organization_id (clients, companies, jobs,
--     subscription_cache, invoices, leads, automations, etc.). If any are
--     found, abort with RAISE EXCEPTION listing them.
-- (Explicit cleanup follows once the check passes.)

DELETE FROM organization_users
 WHERE organization_id = 'ccbbc75a-a477-44b7-8a9c-3efc30e1ad4d';
DELETE FROM organizations
 WHERE id = 'ccbbc75a-a477-44b7-8a9c-3efc30e1ad4d';

-- (c) Enforce one org per user.
ALTER TABLE public.organization_users
  ADD CONSTRAINT organization_users_user_unique UNIQUE (user_id);

-- (d) Rewrite create_organization_with_owner: idempotent, race-safe.
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing_org uuid;
  new_org uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT organization_id INTO existing_org
    FROM organization_users WHERE user_id = uid LIMIT 1;
  IF existing_org IS NOT NULL THEN
    RETURN existing_org;
  END IF;

  INSERT INTO organizations (name, billing_status)
    VALUES (org_name, 'pending_payment')
    RETURNING id INTO new_org;

  BEGIN
    INSERT INTO organization_users (user_id, organization_id, role)
      VALUES (uid, new_org, 'owner');
  EXCEPTION WHEN unique_violation THEN
    -- A parallel call won the race. Drop our org and return theirs.
    DELETE FROM organizations WHERE id = new_org;
    SELECT organization_id INTO existing_org
      FROM organization_users WHERE user_id = uid LIMIT 1;
    RETURN existing_org;
  END;

  RETURN new_org;
END;
$$;
```

Keeps the existing SECURITY DEFINER posture; no RLS changes.

## 4. Frontend resilience

- `src/lib/ensure-organization.ts`
  - Add module-level in-flight promise guard so parallel callers await the same RPC.
  - Use `.order("created_at",{ascending:true}).limit(1).maybeSingle()` for the membership query.
  - Same name-resolution chain (localStorage → user_metadata → email-derived default).
  - Clear `pending_org_name` on success.

- `src/lib/app-context.tsx` — `loadOrganization` membership query: replace `.maybeSingle()` with `.order("created_at",{ascending:true}).limit(1).maybeSingle()`.

- `src/pages/Auth.tsx`
  - `handleSignUp`: trim org name, only store if non-empty, set localStorage + `options.data.pending_org_name`, use `getAppUrl()` for `emailRedirectTo`.
  - `handleSignIn`: remove the `ensureOrganization()` call — AppContext owns post-auth resolution.
  - Password reset: use `getAppUrl()`.

- `src/pages/CompletePayment.tsx`
  - If `getOrganizationId()` is null: call `ensureOrganization()`, refresh context, retry. If still null, show: "We couldn't finish setting up your practice. Please try signing in again or contact support."
  - Use the resulting org id to proceed to Stripe checkout.

- AppContext bootstrap: continue using `loadOrCreateOrganization`. Add an init guard so routing only happens once org load + ensure has settled (no flicker, no loops).

## 5. Stripe checkout

`supabase/functions/create-checkout/index.ts`:
- Compute `base` = `Deno.env.get("APP_PUBLIC_URL") ?? "https://app.accountancyos.com"` (overrideable to preview only when explicitly set).
- `success_url`: `${base}/payment-success?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `${base}/complete-payment`
- Add `allow_promotion_codes: true` to the session create call.
- Remove any custom discount-code UI/field in `CompletePayment.tsx`.

Set the `APP_PUBLIC_URL` edge-function secret to `https://app.accountancyos.com` via `add_secret`.

## 6. Logging

Add scoped `console.log("[auth]" / "[ensureOrg]" / "[checkout]", ...)` for: resolved redirect base, current `auth.uid()`, membership lookup result, RPC call/return, race-conflict branch, `/complete-payment` self-heal, generated success/cancel URLs. No raw errors to UI.

## 7. Verification

After deploy:
- DB: `select count(*) from organization_users where user_id = '968f4acc-…'` → 1; constraint exists.
- Browser: sign in as Leon — lands on `/complete-payment` with org loaded, no PGRST116.
- New signup from `app.accountancyos.com` — confirmation email link returns to `app.accountancyos.com/complete-payment`, exactly one org created.
- Stripe checkout shows "Add promotion code"; success returns to `app.accountancyos.com`.

## Files / migrations
- New migration (constraint + cleanup + RPC).
- `supabase/functions/create-checkout/index.ts`.
- `src/lib/app-config.ts`, `src/lib/ensure-organization.ts`, `src/lib/app-context.tsx`.
- `src/pages/Auth.tsx`, `src/pages/ConfirmEmail.tsx`, `src/pages/CompletePayment.tsx`.
- Supabase Auth URL config + `APP_PUBLIC_URL` secret.
