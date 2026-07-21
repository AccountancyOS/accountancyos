## Correction to the earlier claim

The statement "a CH function redeploy from git covers the PSC sync" is **not** true, and neither was my earlier report that PSC promotion was working end-to-end.

Two pieces were required:
1. Migration `20260721170839` — adds `company_persons.ch_psc_id` and unique indexes. **Applied on live** (verified).
2. `companies-house-sync` function rewrite that promotes PSCs. **Deployed on live** (verified — `booted` events in logs from today).

But the live edge-function log for the most recent sync shows:

```
[CH Sync] PSC promotion failed (non-fatal): there is no unique or exclusion
constraint matching the ON CONFLICT specification
```

So PSC promotion is running and silently failing on every sync — which is why phantom PSC discrepancies keep coming back.

## Root cause (verified against the live DB)

Both PSC unique indexes are **partial**:

```
company_persons_org_ch_psc_uq   ... WHERE (ch_psc_id IS NOT NULL)
company_pscs_company_ch_psc_uq  ... WHERE (ch_psc_id IS NOT NULL)
```

The function upserts with `onConflict: "organization_id,ch_psc_id"` and `onConflict: "company_id,ch_psc_id"`. PostgREST/supabase-js emits a bare `ON CONFLICT (col, col)` clause — no `WHERE` predicate. Postgres will only infer a **partial** unique index when the target list *and* the predicate match, so the inference fails and the whole upsert aborts with the exact error above.

The officer path works because it has both a partial index (`company_persons_org_ch_officer_unique`) **and** a plain unique index (`company_persons_org_ch_officer_uq`). The PSC path only has the partial one.

## Fix

New migration adding the missing plain unique indexes so `ON CONFLICT (organization_id, ch_psc_id)` and `ON CONFLICT (company_id, ch_psc_id)` can be inferred (Postgres allows multiple NULLs in a plain unique index, so no NULL-vs-NULL collision):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_psc_unique
  ON public.company_persons (organization_id, ch_psc_id);

CREATE UNIQUE INDEX IF NOT EXISTS company_pscs_company_ch_psc_unique
  ON public.company_pscs (company_id, ch_psc_id);
```

Leave the existing partial indexes in place — they don't hurt and they document intent.

No function change needed. No redeploy needed.

## Verification (re-verify end-to-end, as approved)

1. Apply migration.
2. Re-run CH sync on BASSAGE EYES LTD from the Registers tab.
3. Check `edge_logs` for `companies-house-sync` — the "PSC promotion failed" line must be **gone**.
4. Query live: `SELECT count(*) FROM public.company_pscs WHERE company_id = '<bassage>' AND ch_psc_id IS NOT NULL;` should be ≥ 1.
5. Reload the Registers tab — the amber "PSC 'Leon Lim Stevens' exists in CH but not in internal registers" panel should clear, and no reciprocal "exists internally but not in CH" should appear.
6. Delete any leftover manually-added "Leon Stevens" PSC row from before the fix, if the dedupe leaves a duplicate.

## Files

- New migration `supabase/migrations/<ts>_ch_psc_onconflict_indexes.sql` — the two `CREATE UNIQUE INDEX` statements above. No RLS/grants (indexes only).

## Not in scope

- Officer/PSC discrepancy one-click resolve UI.
- Backfilling `ch_psc_id` onto legacy manually-created PSC rows (fuzzy name matcher in the function already handles those).
