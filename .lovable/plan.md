# Add `quote` and `engagement` to email context categories

## Goal

Extend the `email_queue.context` CHECK constraint to include two new categories — `quote` and `engagement` — and tag the relevant outbound emails with them so staff can filter the Emails work queue by these categories.

## Changes

### 1. Migration — widen the CHECK constraint

Drop and recreate `email_queue_context_check` to allow:

`invoice`, `chase`, `onboarding`, `filing`, `ad-hoc`, `portal`, `system`, `quote`, `engagement`

No data backfill (existing rows are unaffected; old `ad-hoc` quote emails stay as `ad-hoc`).

### 2. Tag outbound emails at source

- `lifecycle_send_quote` RPC — change inserted `context` from `ad-hoc` to `quote`.
- Engagement letter send paths — locate the RPC / edge function that enqueues engagement letter emails (likely `lifecycle_send_engagement_letter` or similar) and set `context = 'engagement'`. Cover both initial send and re-sign triggers.

### 3. Frontend — surface the new categories

- `src/lib/db-constants/check-constraints.ts` (or wherever the context enum lives) — add `quote` and `engagement`.
- `src/pages/Emails.tsx` — add the two options to the context filter dropdown and the badge label map (friendly labels: "Quote", "Engagement Letter").
- `src/components/email/EmailList.tsx` — extend the `CONTEXT_LABELS` map added in the previous increment.

## Out of scope

- No changes to sender/mailbox routing, template engine, or queue processor.
- No backfill of historical `ad-hoc` rows.
- No new UI surfaces beyond the existing context filter + badges.

## Files touched

- New migration under `supabase/migrations/`
- `src/lib/db-constants/check-constraints.ts`
- `src/pages/Emails.tsx`
- `src/components/email/EmailList.tsx`
- Whichever lifecycle RPC sends engagement-letter emails (to be identified during implementation; will report it back if it differs from expectation)

## Verification

- Sending a quote enqueues a row with `context='quote'`.
- Sending an engagement letter enqueues a row with `context='engagement'`.
- Both categories appear in the `/emails` filter and as badges on rows.
- Existing emails with other contexts continue to work unchanged.
