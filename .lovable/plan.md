## Scope

Frontend-only + one-off data cleanup. No changes to `companies-house-sync` — that work is coming from you in git and Lovable's part is a redeploy afterwards.

## Fix 1 — Row-level actions on the PSC card

The PSC card currently renders read-only rows. Add a per-row action menu (kebab in the far-right cell of each row, same pattern as officers if there's one there, otherwise a plain `DropdownMenu` with a `MoreHorizontal` trigger) with:

- **Delete PSC** — soft delete via `UPDATE company_pscs SET ceased_at = now(), ceased_reason = 'Removed manually'` (or a hard delete if there is no `ceased_at` on the schema — I'll verify against the live table before wiring). Confirmation dialog: "Remove Leon Stevens as a PSC? This will not file a PSC07 with Companies House."
- **Edit PSC** — opens the same dialog used by "+ Add PSC" pre-filled with the row's data. Out of scope for this pass if the edit dialog doesn't exist yet; the Delete action alone solves the immediate blocker.

Files (to be confirmed on read):
- `src/components/company-registers/PSCsCard.tsx` (or whatever mounts the "Persons with Significant Control (2)" card)
- reuse existing `DropdownMenu`, `AlertDialog` from shadcn
- add a `deletePsc(pscId)` call against the `company_pscs` table via the supabase client; invalidate the registers query so the row disappears.

RLS: `company_pscs` already has org-scoped RLS (four policies). No policy work needed — deletes will succeed for org staff/owners and be denied for anyone else.

## Fix 2 — Correct the "CH Status" badge

Right now both rows read "Not in CH". The rule should be:

- `ch_psc_id IS NOT NULL` → green "Synced with CH" badge
- `ch_psc_id IS NULL` → amber "Not in CH" badge (this row was added manually and has no CH counterpart yet)

That's a two-line change in the badge cell renderer. After Fix 1 removes the manual duplicate, only the CH-synced row remains and shows green.

## Fix 3 — One-off cleanup for Churchills London Ltd (data, not code)

Once the UI delete is in, either:

- (a) You delete the manual "Owns 75-100%" row through the UI. Done. The CH-synced row remains with the correct 50-75% figure.
- (b) Or I run this one-off via a targeted operation (still needs your say-so since it's a data change to your live register):

```sql
DELETE FROM public.company_pscs
 WHERE company_id = 'e1f4ebf7-9d99-4ca8-a2aa-61c4e804626f'
   AND id = '376cf437-5ccf-4bb1-9145-ee63fe77d8a9';
```

Recommend (a) — the UI delete proves the affordance works and leaves an audit trail through the app path.

## Not in this plan

- Any change to `companies-house-sync`. The legacy-PSC stitch (so future syncs auto-merge manual rows into their CH counterpart) is your git PR — Lovable's job is redeploy-from-git afterwards.
- Any change to the `psc_control_mismatch` discrepancy detection. Once the manual duplicate is gone, the mismatch disappears here anyway; a proper Accept-CH / Keep-Internal resolve UI is still deferred.
- Editing PSC control fields inline. Deferred with the resolve UI.

## Verification

1. Reload the Churchills workspace → each PSC row shows a kebab menu.
2. Delete the top "Owns 75-100%" row. Toast confirms; card refreshes; count drops to `(1)`.
3. Remaining row shows a green "Synced with CH" badge.
4. Registers timeline shows no fresh discrepancy on next sync (the control-mismatch panel should be gone).
5. Re-run CH sync → `promoted_pscs: 0`, `discrepancies_found: 0`.

## Files touched

- `src/components/company-registers/PSCsCard.tsx` (or equivalent — will be confirmed on the first read)
- possibly a small `usePscMutations.ts` next to it for the delete mutation
- no migration, no edge function change
