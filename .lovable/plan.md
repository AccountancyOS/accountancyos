## Root Cause

Yes — the previous fixes targeted the in-app route `/portal/bookkeeping?tab=banking`, but the URL you are using is `https://client.accountancyos.com/banking`.

The current app only defines portal routes under `/portal/*`; there is no top-level `/banking` route. On the client portal domain, `/banking` currently falls through to the wrong route/login surface, so after sign-in it navigates to `/portal/dashboard` instead of rendering Banking.

## Plan

1. **Add client-domain route aliases**
   - Add top-level routes for the client portal paths used by `client.accountancyos.com`, including `/banking`.
   - Map `/banking` to the same protected portal bookkeeping screen as `/portal/bookkeeping`, with the Banking tab selected.
   - Keep existing `/portal/*` routes working unchanged.

2. **Make portal navigation domain-aware**
   - Update portal sidebar links so on `client.accountancyos.com` they point to `/dashboard`, `/documents`, `/messages`, `/banking`, etc.
   - Keep Lovable preview and the main app using `/portal/dashboard`, `/portal/bookkeeping`, etc.

3. **Preserve the intended destination through login**
   - If an unauthenticated user opens `/banking`, redirect them to the portal login while storing `/banking` as the return path.
   - After successful portal login, send them back to `/banking`, not `/portal/dashboard`.

4. **Open Banking callback compatibility**
   - Ensure connection callback parameters on `/banking` still land on the Banking tab and show success/error feedback.
   - Use query parameters rather than hardcoding the `/portal/bookkeeping` path.

5. **Verify**
   - Check `https://client.accountancyos.com/banking` behavior in preview-equivalent routing.
   - Confirm unauthenticated users see portal login, authenticated portal users render the Banking section, and the route no longer falls through to the generic auth/login page.

## Technical Notes

- Main files likely affected: `src/App.tsx`, `src/portal/routes/PortalRoutes.tsx`, `src/portal/layouts/PortalLayout.tsx`, `src/portal/guards/PortalGuard.tsx`, `src/portal/pages/PortalLogin.tsx`, and possibly `src/portal/pages/PortalBookkeepingFull.tsx` for defaulting `/banking` to `tab=banking`.
- No database schema changes are needed.
- This is a routing/domain-alias issue, not a banking component crash.