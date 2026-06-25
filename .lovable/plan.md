## What's actually wrong

The deep audit (with file:line citations) identified **two independent bugs**. Neither throws an error, which is why error boundaries catch nothing and there are no console messages.

### Bug 1 — Permissions race silently redirects `?tab=banking` → `?tab=overview`
`src/portal/pages/PortalBookkeepingFull.tsx:56–79`

On cold load, `usePortalBookkeepingPermissions()` is still in-flight, so `perms` is `undefined`. The component computes `showBanking = !!perms?.showBankAccounts` → `false`, then an effect runs:

```ts
if (allowed[activeTab] === false) {
  setActiveTab("overview");
  setSearchParams({ tab: "overview" });
}
```

This fires **before** the permissions query resolves, kicks the user off the Banking tab, and overwrites the URL. By the time perms load, `activeTab` is already `"overview"`. Net effect: the Banking tab never gets a chance to mount.

Additionally, defaults in `src/portal/hooks/usePortalBookkeepingPermissions.ts:51–82` set `showBankAccounts: false` when no `portal_visibility_settings` row exists — so even after the race is fixed, the tab won't appear unless the row exists and the flag is on.

### Bug 2 — `/auth` bounce (accountant login, not portal login)
`src/lib/auth-context.tsx:272–279` + `src/App.tsx`

`AuthProvider` wraps every route including `/portal/*`. Its `useInactivityTimeout(!!user, signOut)` calls `signOut()` after 10 min of inactivity (or immediately on visibility-restore after 10+ min hidden), and `signOut` hard-navigates to `/auth` — the accountant login page. Portal users get dumped there with no way back into the portal. This is the reason you're currently on `/auth`.

There may also be a synchronous trigger from `enforceSessionLimits` (`auth-context.tsx:219`) signing portal users out if it treats them as duplicate sessions; we'll trace that as part of the fix.

## Fix plan

### 1. Stop the perms race (Bug 1)
`src/portal/pages/PortalBookkeepingFull.tsx`

- Read `isSuccess` from the perms query.
- Guard the redirect effect: `if (!permsLoaded) return;` at the top.
- Make the empty-tab case visible instead of silent: when the user navigates to `?tab=banking` but `showBankAccounts` is false after perms load, render a small "Banking is not enabled for this entity. Ask your accountant to enable it." card inside the tabs area instead of silently switching tabs. This guarantees we never blank-screen again from this pathway.

### 2. Stop the portal /auth bounce (Bug 2)
`src/lib/auth-context.tsx`

- Detect portal routes via `useLocation()` and disable the inactivity timer there: `useInactivityTimeout(!!user && !isPortalRoute, signOut)`. The portal has its own session model via `PortalAppShim`.
- When `signOut` is invoked on a portal route, navigate to `/portal/login` instead of `/auth`.
- Audit `enforceSessionLimits` (`src/lib/session-enforcement.ts`) and skip the call when the user is on a portal route, since portal users won't have an `organization_users` row and the check is irrelevant.

### 3. Data check (must do, no code change)
For the affected entity (Blue Tick test client), confirm `portal_visibility_settings.show_bank_accounts = true` and `allow_bank_connect = true`. If the row doesn't exist, banking will stay hidden regardless of the code fixes. I'll run a `SELECT` once we move to build mode and report what's there before/after fixing.

### 4. Make future blanks impossible to miss
`src/components/ui/error-boundary.tsx` already shows error message + first stack frame + Reload button. No change needed there — but I'll add a one-line console.info on each PortalBookkeepingFull mount with `{ activeTab, showBanking, permsLoaded }` so any future "blank tab" issue is one console glance away from a root cause.

## Out of scope

- Moving `<AuthProvider>` so it doesn't wrap `/portal/*` at all. That's the cleaner long-term fix but is a structural change to `App.tsx` routing; flagged in audit point #3 for a separate pass.
- Any change to `BankingTab.tsx`, `PortalBankHealthBanner`, or `ConnectBankDialog`. The audit confirmed none of these are throwing — the tab simply never renders.

## Verification

1. Cold-load `/portal/bookkeeping?tab=banking` → Banking tab content renders (assuming perms row enables it). No redirect to overview.
2. With `show_bank_accounts = false`, the same URL shows the explanatory card instead of a blank panel.
3. Leave a portal tab idle for >10 min → user is NOT bounced to `/auth`. If signed out, lands on `/portal/login`.
4. Console shows the diagnostic line on every portal bookkeeping load.
