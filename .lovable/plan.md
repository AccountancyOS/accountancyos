## Goal
Fix the accepted Churchills London quote so the client is taken into onboarding, and prevent this stuck state for any future accepted quote.

## Findings
- Quote `Q-26-0004` for `Churchills London Ltd` is already accepted.
- Its quote token is marked as used.
- There is currently no linked onboarding application for that quote, so the public proposal page can only show “Proposal accepted” and has no `/onboard/:id` destination.
- The latest public quote loader now supports returning an onboarding ID, but it cannot redirect when the underlying onboarding row is missing.

## Plan
1. **Repair the Churchills London record**
   - Create the missing onboarding application for the accepted quote `Q-26-0004`.
   - Link it back to the quote, company, client, and Blue Tick practice data already stored on the accepted quote.
   - Set it to the correct starting state for the client onboarding wizard.

2. **Make accepted-quote replay self-healing**
   - Update the public quote-loading backend function so that if a quote is already accepted but has no onboarding application, it creates one before returning the payload.
   - Return the new `onboarding_application_id` immediately so the current frontend redirect works.

3. **Preserve the existing client experience**
   - Keep `/q/:token` showing the accepted confirmation briefly.
   - Then redirect to `/onboard/:applicationId` as already implemented.
   - Keep the visible “Continue Onboarding” button as a fallback if automatic navigation is blocked.

4. **Validate with the actual affected token**
   - Re-run the public quote RPC for Churchills London’s token.
   - Confirm it returns a non-null `onboarding_application_id`.
   - Confirm that the app will have a valid `/onboard/:id` target.

## Technical Notes
- This is a database-function/data-repair fix, not a routing issue.
- No new tables are required.
- No changes are needed to the public route definitions because `/onboard/:applicationId` already exists.