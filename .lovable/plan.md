## Problem

The "Queued" card on the Emails page double-counts both `queued` and `pending` statuses:

```ts
counts.queued = filterByStatus("queued").length
              + emails.filter(e => e.status === "pending").length
```

…but clicking the card sets `statusFilter = "queued"`, and the Supabase query then narrows the result with `.eq("status", "queued")`. Real rows in this org all have `status = 'pending'` (the value `lifecycle_approve_onboarding` and friends insert), so:

- The list empties.
- The refetched `emails` array no longer contains pending rows, so `counts.queued` drops to 0 as well.

## Fix

Make the Queued tab treat `queued` + `pending` as one logical bucket end-to-end.

### `src/pages/Emails.tsx`

1. **Query** (lines ~139–141): when `statusFilter === "queued"`, use
   `query.in("status", ["queued", "pending"])` instead of `.eq("status", "queued")`. Leave all other statuses on `.eq`.
2. **Count helper** (line ~300): no change needed — `counts.queued` already sums both statuses. It will just stop dropping to 0 once the query above returns pending rows.
3. **Row badge**: confirm `statusConfig` already renders `pending` rows with the "Queued" label (it does — `pending: { label: "Queued", … }`), so the UI stays consistent.

No backend, schema, or RPC changes. Single-file edit.

## Out of scope

- Renaming the `pending` status to `queued` in the DB (would touch RPCs, worker, and check constraint — separate task).
- Any change to Drafts/Failed tabs.
