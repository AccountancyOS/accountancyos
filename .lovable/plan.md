## Goal
Give every queued email a 15-minute "cooling off" window before it sends, surface that scheduled time in the Emails page, and add two manual overrides: a global "Process Queue" that fires the whole queue now, and a per-row "Send now" that fires a single email immediately while leaving the rest scheduled.

## Behaviour

**Default schedule (15 min delay)**
- Whenever any code path enqueues an email (RPCs like `lifecycle_send_quote`, `queue_email_safe`, the `email-service.ts` insert, automations, chasers, etc.), if no explicit `scheduled_at` is supplied, default it to `now() + interval '15 minutes'`.
- The worker (`process-email-queue`) already respects `scheduled_at <= now()` when draining `public.email_queue` — no edge function change needed beyond what's already there.
- The cron gate (from the previous fix) already wakes when a `pending` row's `scheduled_at <= now()` — so the queue continues to self-drain on time.

**Process Queue button (global override)**
- Currently it just invokes the worker, which skips rows whose `scheduled_at` is in the future.
- Change behaviour so clicking it first promotes every pending row in this org whose `scheduled_at > now()` to `scheduled_at = now()`, then invokes the worker. Net effect: the entire queue sends immediately.

**Send now (per-row override)**
- Add a "Send now" item to the row action menu (and/or a small button) on each pending/queued row.
- It sets that single row's `scheduled_at = now()` and invokes the worker once. Other rows keep their original schedule.

**UI changes on `/emails`**
- Add a "Scheduled for" column to the queue tables showing `scheduled_at` formatted (e.g. `24 Jun 2026 09:42`) with a relative hint ("in 12 min" / "ready"). Fallback to `created_at` only when `scheduled_at` is null.
- Update the per-row dropdown to include **Send now** for `pending`/`queued` rows.
- Same column added to `EmailList.tsx`'s outstanding-queue card so client/job pages also show when each queued email will go.

## Technical details

1. **Migration** — three small changes in one migration:
   - `ALTER TABLE public.email_queue ALTER COLUMN scheduled_at SET DEFAULT (now() + interval '15 minutes');` so direct inserts inherit the delay.
   - Update `public.queue_email_safe(...)` so when `p_scheduled_at` is null it stores `now() + interval '15 minutes'`.
   - Update `public.lifecycle_send_quote(...)` (and any other lifecycle RPCs that insert into `email_queue` without `scheduled_at`) to do the same.
   - Add a `public.send_queued_email_now(p_email_id uuid)` SECURITY DEFINER RPC that verifies the caller's org owns the row and sets `scheduled_at = now()`, `status = 'pending'`. Grant `EXECUTE` to `authenticated`.
   - Add a `public.flush_email_queue_now(p_organization_id uuid)` SECURITY DEFINER RPC that promotes all this org's pending rows with `scheduled_at > now()` to `now()`. Grant `EXECUTE` to `authenticated`.

2. **Frontend**
   - `src/pages/Emails.tsx`:
     - `processQueueMutation`: call `flush_email_queue_now` first, then `supabase.functions.invoke("process-email-queue")`.
     - Add `sendNowMutation` that calls `send_queued_email_now` then invokes the worker; wire to a new "Send now" dropdown item.
     - Add a "Scheduled for" column to the table.
   - `src/components/email/EmailList.tsx`:
     - Render `scheduled_at` (with relative hint) on each outstanding-queue card.
   - `src/lib/email-service.ts` and any other client-side enqueue helpers: stop passing `scheduled_at: null` so the new DB default applies; allow callers to override when they need to.

3. **No edge function code changes.** The worker already filters by `scheduled_at <= now()` and the cron gate already accounts for it.

## Out of scope
- Changing the 5-second cron tick.
- Changing how auth emails (pgmq) are scheduled — this is only about `public.email_queue`.
- Making the 15-minute delay user-configurable (can be added later as an org setting if you want).