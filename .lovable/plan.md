The error is not coming from the submit function anymore. The submit function now uses the correct `organization_users` table, but the status update fires database triggers afterwards, and two trigger functions still reference the old missing `organization_members` table.

## Plan

1. **Patch the review notification trigger**
   - Update `notify_onboarding_for_review()` so it reads practice users from `organization_users` instead of the missing `organization_members` table.
   - Keep the existing notification behaviour: when the client submits onboarding, all users in that practice receive an in-app notification.

2. **Patch the approval notification trigger as well**
   - Update `notify_onboarding_approved()` for the same issue.
   - This prevents the next failure when the accountant later clicks **Approve & Activate**.

3. **Validate the exact Churchills London flow**
   - Confirm the trigger definitions no longer contain `organization_members`.
   - Re-run the submit-for-review RPC or equivalent database check for the affected onboarding application so the client is no longer stuck at the portal email step.

## Technical Details

- Existing table: `public.organization_users`
- Missing table causing the error: `public.organization_members`
- Failing point: `onboarding_applications.status` changes to `for_review`, which triggers `trg_notify_onboarding_for_review` after the update.
- Secondary future failure: `trg_notify_onboarding_approved` also references the same missing table and should be fixed at the same time.