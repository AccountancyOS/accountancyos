## Problem

`portal-b@accountancyOS.com` is a client-portal user — they have a row in `portal_access` but no row in `organization_users` or `user_roles`. When they sign in they're dropped onto the accountant app shell (sidebar, `/settings`, `/emails`, etc.) instead of the client portal. Individual data queries 403 because RLS correctly refuses them, but the UI chrome itself renders.

Root cause: `ProtectedRoute` in `src/App.tsx` only checks `user != null`. It doesn't ask "is this user a member of any organization, or are they a portal user?". Anyone authenticated gets the accountant UI.

Meanwhile `PortalGuard` (under `src/portal/`) does the inverse check on `/portal/*`, but nothing pushes portal users into `/portal/*` to begin with.

## Fix

One narrow change in `src/App.tsx`:

1. Extend `ProtectedRoute` so that after `user` is loaded, it asynchronously checks whether the user has any `organization_users` row.
   - If yes → render the accountant app as today.
   - If no → `<Navigate to="/portal" replace />`.
   - While the check is in flight → keep showing the existing centered spinner (no flash of accountant UI).

2. Use a single lightweight query (`select id from organization_users where user_id = :uid limit 1`) cached for the session via React Query, so the check runs once per login, not per route change.

No other files change. `PortalGuard` already handles the reverse case (accountant user landing on `/portal/*`), so no edits there.

## Out of scope

- No changes to RLS, RPCs, or any backend logic.
- No changes to `/portal/*` routes or `PortalGuard`.
- No changes to login/signup flow itself — the redirect happens on the first protected route after login.
- The `/portal/preview/:entityType/:entityId` accountant-preview route stays unguarded by the new check (it's already inside `ProtectedRoute` — accountants previewing the portal still need it, so the new check must allow it through). Simplest: skip the portal-user redirect when the path starts with `/portal/preview/`.

## Verification

1. Sign in as `portal-b@accountancyos.com` → land on `/portal` (or whatever portal home resolves to), not the accountant sidebar.
2. Sign in as a staff/owner of org `54804f3d-…` → still land on the accountant app as before. No extra spinner beyond the existing auth-loading one.
3. Accountant clicking "Preview portal" on a quote/client still works (route `/portal/preview/...`).
