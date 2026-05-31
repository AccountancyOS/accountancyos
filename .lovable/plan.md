### What went wrong

You signed up, got the confirmation email, clicked the link, were signed in — and then `/complete-payment` told you "Organization not found." The signup flow only creates your practice org when Supabase returns a session **immediately** from `signUp()`. With email confirmation enabled, `signUp()` returns no session — you're sent to `/confirm-email`, and the `create_organization_with_owner` RPC is never called. When you come back via the confirmation link, you're a verified user with no organization, so `/complete-payment` and everything downstream breaks.

Network logs confirm it: `organization_users` for your user id returns 0 rows.

### Fix

Persist the practice name at signup, then create the org **after** email confirmation (first time we have an authenticated session).

1. **Capture intent at signup** (`src/pages/Auth.tsx`)
   - In `handleSignUp`, before redirecting to `/confirm-email`, store `pending_org_name` in `localStorage`.
   - Also pass the org name through `supabase.auth.signUp` `options.data` so it lands on `user_metadata.pending_org_name` as a backup if localStorage is cleared.

2. **`ensureOrganization()` helper** — new `src/lib/ensure-organization.ts`
   - Runs whenever there's a session but `organization_users` is empty.
   - Org name source order: `localStorage.pending_org_name` → `user.user_metadata.pending_org_name` → fallback `"<email-local-part>'s Practice"`.
   - Calls the existing `create_organization_with_owner` RPC (SECURITY DEFINER, already atomic).
   - Clears `pending_org_name` on success and refreshes `AppContext`.

3. **Wire it into the post-confirm landing**
   - `src/lib/app-context.tsx` bootstrap: when a signed-in user has no org, call `ensureOrganization()` once, then route to `/complete-payment` (current happy path).
   - `Auth.tsx` `handleSignIn` gets the same safety net so already-stuck users self-heal on next sign-in.

4. **Self-heal `/complete-payment` for stuck users**
   - In `CompletePayment.handleCheckout`, if `getOrganizationId()` is null, call `ensureOrganization()` first instead of the "sign out and sign up again" toast.

5. **No DB changes.** `create_organization_with_owner` already exists and handles membership atomically.

### Files touched
- `src/pages/Auth.tsx` — store pending org name + sign-in self-heal.
- `src/pages/CompletePayment.tsx` — ensureOrganization fallback in `handleCheckout`.
- `src/lib/ensure-organization.ts` — new helper.
- `src/lib/app-context.tsx` — run helper on bootstrap when no org.

### After the fix
- New email-confirmed signups land on `/complete-payment` with their org already created.
- Your current account (`leon@bluetickaccountants.com`) self-heals on next sign-in — the org gets created automatically and you proceed to Stripe checkout.
