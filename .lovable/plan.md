## Problem

The CH sync **imports officers** into the internal registers (via `promoteOfficersToPersonSpine`) but **does not import PSCs** — it only *compares* them. So every CH PSC shows up as `psc_missing_internal`. When you add the PSC manually, the name doesn't match CH's version ("Leon Stevens" vs "Leon Lim Stevens"), so it then flags `psc_missing_ch` on top.

Two independent bugs in `supabase/functions/companies-house-sync/index.ts`.

## Fixes

### 1. Auto-promote CH PSCs into internal registers

Mirror the officer promotion pattern for PSCs. On each sync:

- For every active CH PSC (i.e. `ceased_on` is null), find or create the corresponding `company_persons` row for the practice, then upsert a `company_pscs` row keyed on `ch_psc_id`.
- Person dedupe order:
  1. If the PSC's CH id matches a `company_persons.ch_officer_id` for the same org (PSC is also a director) — reuse that person.
  2. Otherwise match by normalised full name + date-of-birth month/year against existing persons on that company — reuse if found.
  3. Otherwise insert a new `company_persons` row.
- Requires a new column `company_persons.ch_psc_id` (nullable, unique per org where not null) so PSC-originated persons dedupe cleanly across syncs. Migration will be needed.

`company_pscs` insert uses `ch_psc_id` as the conflict key (column already exists; add a partial unique index on `(company_id, ch_psc_id) where ch_psc_id is not null` in the same migration).

### 2. Robust name matching in discrepancy comparison

`compareWithInternalRegisters` currently does substring matching on the full name, which breaks on middle names. Replace with a normaliser:

- Lowercase, strip titles (mr/mrs/ms/miss/dr), collapse to `{first_token, last_token}` on both sides.
- Match when first tokens are equal AND last tokens are equal (ignore middles). Apply the same to officers and PSCs.

Once (1) lands, this discrepancy path mainly matters for legacy rows created before promotion existed; the normaliser stops false positives like "Leon Lim Stevens" vs "Leon Stevens" from reappearing.

## Files to change

- **New migration**: add `company_persons.ch_psc_id text` + unique partial index; add unique partial index `(company_id, ch_psc_id)` on `company_pscs`.
- `supabase/functions/companies-house-sync/index.ts`:
  - New `promotePscsToPersonSpine(supabase, orgId, companyId, chPSCs)` that runs after the officer promotion and before the discrepancy comparison.
  - New helpers `mapChPscToPerson`, `mapChPscToPscRow`.
  - Refactor comparison to use a shared `normaliseName(name) → { first, last }` helper.
  - Include a `promoted_pscs` count in the sync event `details` for the register events timeline.

## Verification

1. Delete the manually added "Leon Stevens" PSC on the Bassage Eyes test company.
2. Re-run sync → both PSCs appear in the internal register with correct nature-of-control.
3. Sync event summary reads `2 officers, 2 PSCs synced (0 discrepancies)`.
4. Re-run sync again → same counts, zero duplicates (dedupe on `ch_psc_id` works).
5. Manually change nature-of-control on one internal PSC → next sync flags `psc_control_mismatch`.

## Not in scope

- One-click "Accept CH" / "Keep Internal" resolve actions for discrepancies (still deferred).
- Backfilling `ch_psc_id` onto pre-existing manually-created PSCs — the normalised name matcher handles those.