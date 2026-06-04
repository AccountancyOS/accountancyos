## Goal

Stop portal invite links from breaking when email clients URL-encode the base64 padding/special characters in the token. Restore Churchills London Ltd's link so Leon can complete onboarding.

## Root cause

`public.generate_invite_token()` returns standard base64 (`encode(gen_random_bytes(32), 'base64')`), which can contain `+`, `/`, and trailing `=`. Outlook/Hotmail Safe Links and many mail clients URL-encode these. The Client Portal app (separate project) then receives a token like `...%3D` and looks it up verbatim — the DB row is keyed by the raw `...=` string, so lookup fails and the Portal shows "Invalid invite link / unable to validate link, please contact your accountant".

Churchills' token `aI73LktzbSgd7xjFFKIDI0w0BhyshbQBx2ABFZbbpXE=` ends in `=`, so the issue reproduces every time.

## Plan

### 1. Fix token generation (DB migration)

Replace `public.generate_invite_token()` to emit a URL-safe token (base64url without padding):

```sql
CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  RETURN translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/', '-_'
  );
END;
$$;
```

All future invite tokens (portal access, quote acceptance, engagement signing, etc. that share this helper) will be URL-safe by construction. No application code needs to change because the token is stored and matched verbatim — only the character set is constrained.

### 2. Fix Churchills' existing invite

Two-part data fix inside the same migration (or run as a one-shot SQL):

- Regenerate the token on `portal_access` row `58c67301-6299-46a8-a0e7-993030e863a2` using the new function.
- Reset `invite_expires_at` to `now() + interval '14 days'`, leave `status = 'invited'`.
- Re-enqueue the welcome email by inserting a fresh row into `email_queue` (template: `portal_invite`), using the same body the original trigger uses, but with the **new** token in the URL. The `process-email-queue` cron will send it within 60s.

Result: Leon receives a new "Welcome to your client portal" email with a URL-safe link that will not be mangled by Hotmail.

### 3. Documentation note for the Client Portal project

I cannot edit the Client Portal app from here, but the Portal team should ensure their invite-validation route calls `decodeURIComponent(token)` before passing to `get_portal_invite_details`. Once step 1 is in place this becomes belt-and-braces, but it is good defensive practice for any legacy tokens still in the wild.

## Out of scope

- No changes to `get_portal_invite_details`, `portal_access` schema, or RLS.
- No new UI surfaces in the accountant app (a "Resend portal invite" button is a sensible follow-up but not required to unblock Leon today).
- No edits to the Client Portal project.

## Verification

After running the migration:
1. `SELECT invite_token FROM portal_access WHERE id='58c67301-...';` — confirm no `+`, `/`, or `=`.
2. Watch `process-email-queue` logs for the new send.
3. Ask Leon to click the new link.
