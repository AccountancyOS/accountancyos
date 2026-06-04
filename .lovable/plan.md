# Confirm Portal Invitees Skipped Email Verification

## Status of the code fix

`supabase/functions/accept-portal-invite-signup/index.ts` already passes `email_confirm: true` to `admin.auth.admin.createUser` (line 115). The code change requested is therefore a no-op. The remaining symptom (test invitee unable to log in) is from a user row created before the flag was added, or a stale edge function deploy.

## Plan

1. **Redeploy the edge function** so production matches the current code. This guards against a stale build where `email_confirm: true` had not yet shipped when the test invitee signed up.

2. **One-off backfill migration** to confirm any existing portal invitees who are still flagged unverified. Scope tightly to users linked through `public.portal_access`, never blanket-confirm.

```sql
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmed_at       = COALESCE(confirmed_at, now())
WHERE email_confirmed_at IS NULL
  AND id IN (SELECT user_id FROM public.portal_access WHERE user_id IS NOT NULL);
```

I cannot list the affected `auth.users` rows from this session (the sandbox role has no `auth` schema access), so the backfill runs as a migration and the count is reported back from the migration output.

## Out of scope

- No portal frontend changes (`signInWithPassword` already correct).
- No change to the `{status: "created" | "already_exists" | "invalid_token" | "error"}` response contract.
- No bulk confirmation of unrelated `auth.users` rows.
