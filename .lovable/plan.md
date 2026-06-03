## Root Cause

Three problems compound, all triggered by the same approval:

1. **`lifecycle_grant_portal_access` silently failed** with `function gen_random_bytes(integer) does not exist`. The RPC's `EXCEPTION WHEN OTHERS` block swallowed it, so approval reported success but no `portal_access` row + no `invite_token` was ever created. Confirmed: `SELECT * FROM portal_access WHERE organization_id = '<org>'` returns 0 rows.
2. **Welcome email is untokenised.** `notify_onboarding_approved` links to `https://client.accountancyos.com` (root) instead of `/auth/portal-invite?token=<token>`. Even if step 1 worked, the client would not have arrived with a token.
3. **Client Portal project** has no way to bind the new `auth.users` signup back to the practice's `portal_access` row, because no token arrived. This is why it asked the client to "link to an accountant".

## Fix (this project)

1. **Resolve `gen_random_bytes`.**
   - Ensure `pgcrypto` is installed in `extensions` schema (Supabase default).
   - Update `public.generate_invite_token` and `public.lifecycle_grant_portal_access` so their `search_path` is `public, extensions` (or fully qualify as `extensions.gen_random_bytes`).
2. **Stop swallowing portal-grant failures.** Modify `lifecycle_approve_onboarding` so the `EXCEPTION WHEN OTHERS` block around the portal grant still does not abort approval, but returns `{ portal_access: { ok: false, error: '...' } }` in the JSON result and the Approve & Create Client UI surfaces it as a warning toast. No more silent failures of this exact class.
3. **Fix the welcome email URL.** Rewrite `notify_onboarding_approved` so the link is `https://client.accountancyos.com/auth/portal-invite?token=<invite_token>` — read the token from the `portal_access` row that `lifecycle_grant_portal_access` just inserted (function order in `lifecycle_approve_onboarding` must be: grant portal access first, then queue welcome email).
4. **Backfill for Bassage Eyes Ltd.**
   - Run `lifecycle_grant_portal_access` for the existing approved client so a `portal_access` row with token is created.
   - Locate the `auth.users` row the client already created (`amyleestevens7@gmail.com`) and set `portal_access.user_id = <that uid>`, `status = 'accepted'`, `accepted_at = now()`. This retroactively links them so they do not have to re-sign-up.
   - Send a one-off confirmation email so the client knows they are now linked.

## Fix (Client Portal project — separate task, separate Lovable project)

This project cannot edit the Client Portal repo. You will need to apply the matching change there:

- Implement `/auth/portal-invite?token=<token>` so it:
  1. Validates the token against `portal_access` (token exists, not expired, not revoked).
  2. Shows signup / Google / magic-link options pre-bound to the email on the `portal_access` row.
  3. On successful auth, updates `portal_access.user_id = auth.uid()`, `status = 'accepted'`, `accepted_at = now()`, then routes to the portal workspace.
- Block plain self-signup at `/auth/signup` (or any route that does not arrive with a valid token), so future clients cannot create disconnected accounts.

## Verification (before reporting done)

- Re-read `pg_proc` for both functions to confirm `search_path` includes `extensions`.
- Approve a fresh test onboarding and confirm:
  - `portal_access` has 1 new row with non-null `invite_token`.
  - `email_queue` has 1 welcome email whose body contains `/auth/portal-invite?token=`.
  - `audit_log` shows no `portal_access_failed`.
- Confirm Bassage Eyes Ltd backfill: `portal_access.user_id` is set, `status='accepted'`, and the existing client login now lands in the practice's workspace instead of the "link an accountant" screen.
