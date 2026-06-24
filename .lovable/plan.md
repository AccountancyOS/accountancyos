## Reality check on "never expires"

Our OAuth flow already requests the longest-lived token Google offers — `supabase/functions/gmail-auth/index.ts` sets `access_type=offline` and `prompt=consent`, so we always receive a refresh token. With the consent screen in **Production**, that refresh token does not age out. Google still revokes it in three cases we cannot prevent from code:

1. The user revokes the app at https://myaccount.google.com/permissions.
2. The Google account password is changed (Google invalidates outstanding refresh tokens).
3. The refresh token is unused for 6 months.

So "literally never expires" is not something code can guarantee — it is a Google policy. What we *can* guarantee is: (a) we always request offline + consent, (b) when Google does revoke, the UI surfaces a one-click Reconnect, and (c) the row shows the real reason instead of a generic string.

## Changes

### 1. Reconnect button on every disconnected mailbox row
`src/pages/Settings.tsx` (mailbox row, lines ~538-548):
- Render a primary **Reconnect** button whenever `mailbox.status !== 'active'` OR `mailbox.error_message` is set.
- The button calls the existing `connectGmailMutation` / `connectOutlookMutation` (Outlook mirror); both mutations already kick off the OAuth flow, and the existing `gmail-auth` / `outlook-auth` edge functions upsert on `(organization_id, email_address)` so the same row is refreshed in place — no DB changes.
- Hide the Sync button while in this state (it's already disabled when `status !== 'active'`, so just swap the visible action).

No new edge function, no new RPC, no schema change.

### 2. Persist Google's real error (covers the diagnostics half of the previous "all 3" plan)
Patch four edge functions so `connected_mailboxes.error_message` carries Google's actual response (e.g. `invalid_grant: Token has been expired or revoked.`) instead of the generic `Token refresh failed`:

- `supabase/functions/gmail-sync/index.ts`
- `supabase/functions/gmail-send/index.ts`
- `supabase/functions/outlook-sync/index.ts`
- `supabase/functions/outlook-send/index.ts`

In each:
- Change `refreshAccessToken` to return `{ ok: true, ... } | { ok: false, error }` where `error` is built from `response.status` plus the parsed `error` / `error_description` (or raw body fallback), truncated to 500 chars.
- Update every call site to write `refreshResult.error` into `connected_mailboxes.error_message` when `ok === false`, and return the same string in the response payload.

After the edit I'll deploy the four functions.

### 3. Action required from you (one-off, outside code)
- Open Google Cloud Console → APIs & Services → OAuth consent screen for the project tied to our `GOOGLE_CLIENT_ID`. Confirm Publishing status is **In production**, not Testing. If it's Testing, click **Publish app**. That single setting is the difference between refresh tokens that survive indefinitely and ones that die every 7 days.

I'll surface a chat reminder when the code is shipped.

## Out of scope
- Auto-reconnect (would require silent OAuth, which Google doesn't allow for refresh tokens — the user always has to consent).
- Background "keep-alive" pings (don't extend refresh-token lifetime; only Production mode does).
- Touching the transactional Lovable Emails queue (unrelated to Gmail).
