## Plan

1. Confirm the source of the incorrect welcome text is the live organization record, not the client onboarding screen.
2. Update the backend data so the practice attached to Churchills London and future quote/onboarding payloads uses the correct firm name, **Blue Tick accountant**, instead of **Leon's Practice**.
3. Add a small safeguard so the public quote/onboarding RPCs consistently return the organization display name used by the quote flow, preventing stale/default practice names from reappearing.
4. Verify the Churchills onboarding record now resolves to **Blue Tick accountant** on the public onboarding page.

## Technical Notes

- The UI renders `Welcome to {bundle.organization.name}` in `src/pages/PublicOnboarding.tsx`.
- The live backend currently has one organization row named `Leon's Practice`, and Churchills London’s onboarding application points to that organization.
- The fix should be made via a database migration/RPC update, not by hardcoding the name in React.