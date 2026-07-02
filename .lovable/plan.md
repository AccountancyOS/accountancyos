## Fix the client portal redirect allow-list entry

### Problem
The current allow-list entry is:

```text
https://client.accountancyos.com/
```

The trailing `/` with no wildcard matches **only** the root URL. The password-reset link redirects to `https://client.accountancyos.com/reset-password`, which does not match, so Supabase silently discards it and substitutes the Site URL (`https://accountancyos.lovable.app` → forwarded to `app.accountancyos.com`). Result: the reset link keeps landing on the accountant app and shows "invalid or expired".

### Fix (one edit, by you)
In **Cloud → Users → Auth Settings → URL Configuration → Redirect URLs**:

1. Remove `https://client.accountancyos.com/`
2. Add `https://client.accountancyos.com/**` (two asterisks — that's the wildcard syntax)
3. Save

<presentation-actions><presentation-open-backend>View Backend</presentation-open-backend></presentation-actions>

### Verify
- I'll re-run the redirect allow-list check and confirm the entry now ends in `/**`.
- You then request a password reset from the client portal; the emailed link should land on `https://client.accountancyos.com/reset-password` with a valid recovery session.

No code changes, no deploy.