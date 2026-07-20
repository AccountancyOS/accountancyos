# Unapplied Migrations Audit

**Snapshot date:** 2026-07-20
**Head of `schema_migrations`:** `20260720110128` (before reconciliation) → `20260720xxxxxx` (after reconciliation migration in this batch)

## Method

File-vs-database diff: filename timestamp compared against `supabase_migrations.schema_migrations.version` with a ±120 s tolerance to absorb the small clock skew Lovable introduces when it stamps the applied version (observed drift is ~2 s).

A file with no matching applied version in that window is treated as **unapplied**. For each unapplied file the primary objects it creates (tables / functions / triggers / cron jobs / columns) were then probed against the live catalog (`pg_proc`, `pg_trigger`, `cron.job`, `information_schema`) to classify it.

## Classification

- **A. Superseded** – object exists because a later migration created it. No action.
- **B. Genuinely missing** – object absent. Reconciled in migration `20260720_reconcile_missing_objects` (this batch).
- **C. Data / structural mutation** – file changes constraints, defaults, RLS, or backfills data. Objects on live DB may match or diverge; low blast-radius but worth a manual diff before treating as complete.

## Summary

| Bucket | Count |
| --- | --- |
| A. Superseded | 80 |
| B. Genuinely missing (fixed) | 5 |
| C. Data / structural mutation (informational) | 2 |
| **Total unapplied files** | **87** |

## B. Genuinely missing (now reconciled)

The following objects were absent from the live DB. All were re-created in the reconciliation migration approved 2026-07-20. Re-verified via `pg_proc` / `pg_trigger` post-apply.

| Origin migration | Object | Impact of the gap |
| --- | --- | --- |
| `20260617114623` | `public.gen_onboarding_access_token()` | Onboarding token DEFAULT clause referenced a non-existent function. New onboarding applications may have been created with a NULL token. |
| `20260620165927` | `public.get_cron_job_status(text)`, `public.vault_secret_exists(text)` | Smoke test could not detect cron / vault drift — the exact class of failure that silently broke the email worker. |
| `20260709170448` | `public.record_vat_filing_approval(uuid,uuid)`, `public.revoke_vat_filing_approval(uuid)`, `vat_returns.snapshot_hash` column | VAT accountant approval RPCs were missing. The UI flow to approve a VAT return for filing would 404 at the RPC layer. |
| `20260709215252` | `public.enforce_vat_filing_gate()` + `trg_enforce_vat_filing_gate` | DB backstop was missing: a VAT return could be flipped to `submitted` via a raw UPDATE without an approved snapshot. |
| `20260713085410` | `public.enforce_ct600_filing_gate()` + `trg_enforce_ct600_filing_gate` | Same class of gap for CT600 filings — the "mark filed" path was not gated at the DB level. |

**Post-fix verification query:**

```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND proname IN ('enforce_ct600_filing_gate','enforce_vat_filing_gate',
                   'gen_onboarding_access_token','get_cron_job_status',
                   'record_vat_filing_approval','revoke_vat_filing_approval',
                   'vault_secret_exists');
-- → all 7 rows returned.
```

## A. Superseded (no action)

80 files were re-authored under a later approved timestamp. Their primary objects (functions like `lifecycle_send_quote`, `public_accept_quote_by_token`, `claim_email_queue_row`, `portal_send_message`, etc., plus the `automation_engine_switches` and `invoice_settings` tables) all exist in the live DB. These files remain in `supabase/migrations/` for git history but do not need re-issuing.

## C. Data / structural mutation (informational)

Two files change constraints or defaults rather than creating objects, so they don't leave a clear catalog fingerprint:

- `20260620150856` – swaps the CHECK constraint name on `public.filings` (`chk_filings_status` → `chk_filing_status`).
- `20260620155406` – changes the default of `onboarding_applications.status` to `'in_progress'`.

Both are cosmetic / low-blast-radius. Leaving as-is unless a downstream feature reports a mismatch.

## Cron job renames (informational, not gaps)

Two chaser cron files referenced job names that later migrations replaced with longer names. Both are running under the new names, so nothing is missing:

- `chaser-tick` → live as `chaser-tick-every-15min`
- `chaser-trigger-scan` → live as `chaser-trigger-scan-every-6h`

## Prevention

Two guardrails were added in the same batch:

1. **Vitest regression** `src/test/regression/migration-application-drift.test.ts` – reads the file list from `supabase/migrations/`, queries `schema_migrations`, fails CI if any file has no applied version within ±120 s.
2. **Change checklist** – `docs/change-checklist.md` §3 now requires the author to confirm the approval card returned green (a row exists in `schema_migrations`) before marking the change complete.

Combined with the working agreement to verify each new migration against the live catalog before saying "done", this closes the specific failure mode ("card dismissed, feature silently broken") we hit with the email worker.