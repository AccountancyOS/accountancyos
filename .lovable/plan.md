## Cross-Tenant Portal QA — Full Browser Walkthrough

You're logged in as **portal-a**. I'll drive the browser through the full matrix, sign out and back in as each subsequent user, and finish with a Supabase security rescan. Output is a pass/fail table with screenshots for any failure.

### Test matrix

```text
User     Scenario                          Expected
-------  --------------------------------  ------------------------------------------
A        Login + dashboard                 Sees E2E Acceptor only; tiles populate
A        Documents / invoices / messages   Only own client's records
A        Direct URL to B's client id       403 / not found, no data leak
A        Hit /dashboard, /clients (acct)   Redirect to /portal, no accountant UI
A        Open a document (signed URL)      URL scoped, expires, not guessable

B        Login + dashboard                 Sees Amy-Lee Stevens only
B        Direct URL to A's resources       Blocked
B        Same route-isolation checks       Blocked

C        Login + dashboard                 Sees Bassage Eyes by default
C        Entity switcher                   Lists both entities; switching reloads scope
C        Bassage Eyes vs Churchills        Data is disjoint per entity
C        Cross to A/B records              Blocked

D        Login attempt                     Blocked (revoked access)
                                           No portal session established

Accountant  Log in as leon@                  Lands on accountant app, not portal
            Visit /portal/*                  Not treated as a portal client
```

### Surface checks (every user)

- Sidebar/nav contains only portal-allowed items (no Bookkeeping, TrueLayer, Filings authoring, accountant write actions)
- No 500s / unhandled errors in console
- Network tab: no requests to accountant-only edge functions or RLS-restricted tables returning rows we shouldn't have

### Security rescan

After the functional matrix, run `security--run_security_scan` and `supabase--linter`. Fold any new Critical/High findings into the verdict and propose fixes (no code changes in this pass — flagged for the next loop).

### Deliverable

A single pass/fail report covering:

1. Active access (A, B, C)
2. Revoked access (D)
3. Cross-client isolation (A↔B, A↔C, B↔C)
4. Multi-entity switching (C)
5. Signed URL security
6. Route isolation (portal↔accountant)
7. Hidden unsafe surfaces
8. Critical/High RLS regressions (rescan)

Plus screenshots for any failure and a final verdict: **beta-ready** or **still internal-only, blockers listed**.

### Notes

- I'll only perform read actions. No destructive clicks (delete, pay, submit filings).
- Each user switch goes through proper sign-out → sign-in, not session hacking, so we exercise the real auth path.
- If the browser session fails to start, I'll fall back to the `portal-qa-probe` edge function authenticated per user and note the gap.
- No code changes in this loop. Findings → next loop.
