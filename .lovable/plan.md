## Diagnosis

The 15‑minute delay is enforced only by the default on insert:

```
ALTER TABLE email_queue ALTER COLUMN scheduled_at SET DEFAULT now() + interval '15 minutes';
```

The worker `process-email-queue` drains rows with `status='pending' AND scheduled_at <= now()`. Both override paths already exist:

| Trigger | RPC called by UI | Effect |
|---|---|---|
| **Process Queue** button (`src/pages/Emails.tsx`) | `flush_email_queue_now(p_organization_id)` → then `supabase.functions.invoke('process-email-queue')` | Sets `scheduled_at = now()` for every `pending`/`queued` row in the org with a future `scheduled_at`, then runs the worker. |
| **Send now** per-row (`src/pages/Emails.tsx`) | `send_queued_email_now(p_email_id)` → then `process-email-queue` | Sets `scheduled_at = now()`, resets `status='pending'`, clears `error_message`, then runs the worker. |

So the feature you asked for is in place. The reason the two welcome emails for `leon.lim.stevens@gmail.com` still show `scheduled_at = 20:54:56` and `updated_at = 20:39:56` (creation time) is that `flush_email_queue_now` was never executed against them — the only "Process Queue" click that hit the DB was the earlier one (before the 20:39:56 approval enqueued them).

## Actions

1. **Unstick the two pending welcome emails right now.**
   Insert-tool UPDATE on `email_queue` to set `scheduled_at = now()` for the 2 rows (IDs `26a5e982-…` and `11b5aec3-…`), then call `process-email-queue` to drain.

2. **Verify by reading back** the rows (`status='sent'`, `sent_at` populated) and confirm `email_send_log` shows a `sent` entry per `message_id`.

3. **No code changes required.** Future clicks of Process Queue or Send Now will already short‑circuit the 15‑minute wait.

## Out of scope (ask if wanted)

- Remove the 15‑minute default entirely so all emails send on the next cron tick.
- Re‑label the Process Queue button (e.g. "Send all now") to make the immediate‑send behaviour obvious.
- Auto‑run flush after `lifecycle_approve_onboarding` so welcome emails always go out instantly on approval.
