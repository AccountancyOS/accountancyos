## What you'll see after this change

For each Companies House Sync entry in the Register Events Timeline:

- No more `ch_sync` chip on the right.
- A one-line audit row: **"21 Jul 2026 · 17:53 · by Amy Cronin"** (falls back to *"System"* for older rows where no user was captured — verified: existing rows have `created_by = NULL`).
- A bullet list of the actual discrepancies from that sync, e.g.
  - *PSC "Amy‑Lee Bassage" exists in Companies House but not in the internal register.*
  - *Officer "Jane Doe" has resigned at Companies House but is still active internally.*

Summary chip stays: *"1 officers, 1 PSCs synced (1 discrepancies)"*.

## Files to change

1. **`src/components/cosec/RegisterEventsTimeline.tsx`** (UI only)
   - Remove the `<Badge>{event.source}</Badge>` chip.
   - Format the header timestamp as `dd MMM yyyy · HH:mm` from `created_at` (drop the separate "N minutes ago" line to declutter, or keep it — see technical notes).
   - Append `· by {first_name} {last_name}` when `event.created_by_profile` is present; otherwise `· by System`.
   - For `ch_sync` events, render an unordered list of `event.details.discrepancies[].message` (cap at 5 with a "+N more" line for parity with the Registers-tab panel).

2. **`src/lib/ch-sync-service.ts`** (`getRegisterEvents` select)
   - Extend the PostgREST select with `created_by_profile:profiles!company_register_events_created_by_fkey(first_name,last_name,email)`. If the FK name differs, fall back to a second query keyed by `created_by`. Confirmed `profiles` has `first_name`, `last_name`, `email`.

3. **`supabase/functions/companies-house-sync/index.ts`** (audit capture, forward-only)
   - The function already resolves `userId` via `supabase.auth.getUser(token)`. Add `created_by: userId` to the `company_register_events` insert payload so future rows carry the operator. No backfill for the three existing NULL rows — they'll render as "by System".
   - Deploy via `supabase--deploy_edge_functions(["companies-house-sync"])`. This is a behavioural additive change; the release convention pilot's version probe is unaffected.

## Out of scope

- No resolve/one-click workflow for discrepancies (still surfaces as read-only).
- No schema change — `created_by` column already exists on `company_register_events`.
- No change to the amber "N Discrepancies Found" panel on the Registers tab.

## Verification

- Reload `/companies/84bd9448-...` → Registers → Events. The two existing `ch_sync` rows should show the PSC discrepancy message and read *"21 Jul 2026 · 17:53 · by System"*, with no `ch_sync` chip.
- Click **Sync Now** to run a fresh sync, then confirm the new row shows your name.

## Technical notes

- Nested-select FK hint: PostgREST needs an explicit constraint name when there could be ambiguity. If the FK is named differently, the fallback is a second `.in("id", userIds)` fetch against `profiles` and a client-side merge — cheap, one round-trip.
- We're keeping `event.source` in the row (still used for filtering downstream) — only its visual chip is removed.