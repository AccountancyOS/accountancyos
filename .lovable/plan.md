## Root Cause

`https://client.accountancyos.com/banking` renders blank because the React Router in `src/App.tsx` only defines portal routes under `/portal/*`. On the `client.*` subdomain, the path `/banking` has no matching route, so it falls through to `NotFound` / the auth redirect and never mounts the portal banking screen.

The earlier edits added the `portalPaths` helper and updated internal navigation, but the top-level route aliases that actually make `/banking`, `/dashboard`, `/login`, etc. resolvable on the client domain were not wired into `App.tsx`. That is the missing piece.

## Plan

1. **Add domain-aware route aliases in `src/App.tsx`**
   - Register top-level routes for the client portal: `/login`, `/forgot-password`, `/reset-password`, `/dashboard`, `/tasks`, `/documents`, `/questionnaires`, `/messages`, `/payments`, `/banking`, `/profile`.
   - Each route renders the same component as its `/portal/*` counterpart, wrapped in `PortalGuard`.
   - `/banking` mounts `PortalBookkeepingFull` with the Banking tab pre-selected.
   - Keep all existing `/portal/*` routes intact so the in-app preview keeps working.

2. **Gate aliases to the client domain (optional hardening)**
   - Either always register the aliases (simpler) or only register them when `isClientPortalDomain()` is true to avoid path collisions with future accountant-app routes. Recommend: always register, since none of the alias paths collide with current accountant routes.

3. **Login redirect**
   - Ensure `PortalGuard` sends unauthenticated users on the client domain to `/login?returnTo=/banking` (already implemented via `withReturnTo`), and that `PortalLogin` honors `returnTo` after sign-in.

4. **TrueLayer callback**
   - Confirm the callback path used when initiating bank connect is `portalPath('banking')` so the redirect returns to `https://client.accountancyos.com/banking?...` rather than `/portal/bookkeeping`.

5. **Verify**
   - Load `https://client.accountancyos.com/banking` unauthenticated → should land on `/login?returnTo=/banking`.
   - Sign in → should land back on `/banking` with the Banking tab rendered (no blank screen).
   - Load `/dashboard` on the client domain → renders `PortalDashboard`.
   - In-app preview `/portal/bookkeeping` still works unchanged.

## Technical Notes

- File to change: `src/App.tsx` (add `<Route>` entries for the alias paths inside the existing router, wrapped by `PortalGuard`).
- Supporting files already in place: `src/portal/utils/portalPaths.ts`, `PortalGuard`, `PortalLogin`, `PortalBookkeepingFull` (reads `?tab=banking`).
- No DB or edge function changes required.
- No business-logic changes — purely routing.
