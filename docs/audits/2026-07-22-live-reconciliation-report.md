# Live DB vs Git Migrations — Table-Level Reconciliation Report

**Generated:** 2026-07-22
**Live inventory:** `mcp-claude_ai_AccountancyOS_Lovable-db_schema-1784743193066.txt` (225 public tables, 3748 columns)
**Intended schema:** `/Users/Leon/accountancyos/supabase/migrations/*.sql` (461 files, timestamp-ordered)
**Method:** Union/latest-wins parse of all `CREATE TABLE`, `ADD COLUMN`, `ALTER COLUMN SET/DROP DEFAULT`, `ALTER COLUMN SET/DROP NOT NULL`, `DROP COLUMN`, `DROP TABLE` across every migration; diffed against live inventory. Defaults normalized for interval spelling, schema qualifiers (`public.`/`extensions.`), cast noise, `now()`/`CURRENT_TIMESTAMP`, `H:M[:S]` time literals, and paren/whitespace grouping. Findings independently re-verified by a second, parser-independent sweep and by reading each source migration.

## Summary counts

| Category | Count |
|---|---|
| A. Missing tables | 0 |
| B. Missing columns | 11 (across 3 migrations) |
| C. Missing/incorrect DEFAULT | 1 |
| D. Nullability mismatch | 1 |
| Live-only tables (not in git) | 0 |

**All 13 discrepancies are the same "apply-gap" class: additive migrations present in git that never took effect on the live DB.** Three used `ADD COLUMN IF NOT EXISTS` (B), one used `ALTER COLUMN … SET DEFAULT` (C), one used `ADD COLUMN … NOT NULL` against an already-existing column (D). No genuine schema drift in the other direction was found.

---

## C. Missing / incorrect DEFAULT (highest outage risk — prioritised)

### C1 — `onboarding_applications.status` — HIGH (production-breaking; this is the outage class)
- **Intent** (`20260620155406_f700d345-1707-41d6-b3d1-fb7fc3d7d703.sql:23`): `ALTER TABLE public.onboarding_applications ALTER COLUMN status SET DEFAULT 'in_progress';`
- **Live state:** `default = 'pending'::text` (the pre-fix value; not null).
- **Why it matters:** The migration header documents the exact bug — the column was created with `DEFAULT 'pending'`, migration `20260603105927` retired `'pending'` from the `onboarding_applications_status_check` CHECK constraint (and normalized existing rows to `'in_progress'`) but never updated the column DEFAULT. This fix migration to realign the default **never took effect live**. Live still defaults to `'pending'`, a value the CHECK constraint now rejects — so **any INSERT that omits `status` fails.** This is the silent-default apply-gap described in the task and the most likely cause of the referenced production outage.
- **Repair:** re-apply `ALTER TABLE public.onboarding_applications ALTER COLUMN status SET DEFAULT 'in_progress';`

---

## D. Nullability mismatch (NOT NULL intended, live nullable — prioritised)

### D1 — `bank_transactions.updated_at` — MEDIUM/HIGH
- **Intent** (`20260630220036_f2a13b61-a041-425e-a2b2-ec438491f951.sql:4`): `ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`
- **Live state:** `updated_at timestamp with time zone`, `default = now()`, **`nullable = true`**.
- **Why it matters:** The column pre-existed live as nullable with `DEFAULT now()`, so `ADD COLUMN IF NOT EXISTS` was a no-op and the `NOT NULL` constraint never applied. Practical insert risk is low (the `now()` default fills omitted inserts, and the `bank_transactions_set_updated_at` BEFORE-UPDATE trigger keeps it populated), but a direct `UPDATE … SET updated_at = NULL` is not blocked as intended.
- **Repair (verify no NULLs first):** `ALTER TABLE public.bank_transactions ALTER COLUMN updated_at SET NOT NULL;`

---

## B. Missing columns (additive migrations that never landed live)

All confirmed absent from the live table and never `DROP COLUMN`'d in any later migration. Grouped by source migration.

### B-group 1 — `engagement_letters` — entire "Sprint 1 / Increment 2" EL-lifecycle add never applied — HIGH
Source: `20260617113129_4a4a3a68-d9bb-4379-9f6c-a96e19d44513.sql` (`ALTER TABLE public.engagement_letters ADD COLUMN IF NOT EXISTS …`, additive block lines 17–23). None of these exist on the live `engagement_letters` table.

| Column | Intent (file:line) | Live | Notes |
|---|---|---|---|
| `status` | `:17` `text NOT NULL DEFAULT 'draft'` | absent | also carries a `_status_check` CHECK + index in same migration |
| `signed_by` | `:18` `uuid NULL` | absent | |
| `signer_name` | `:19` `text NULL` | absent | |
| `signer_email` | `:20` `text NULL` | absent | |
| `version` | `:21` `integer NOT NULL DEFAULT 1` | absent | |
| `client_id` | `:22` `uuid NULL REFERENCES public.clients(id)` | absent | |
| `company_id` | `:23` `uuid NULL REFERENCES public.companies(id)` | absent | |

Impact: the same migration also `CREATE OR REPLACE`s `protect_engagement_letter_signatures()` to reference `NEW.signed_by`/`NEW.signer_name`; if that function landed but the columns did not, the trigger will error. The whole increment appears to have not been applied live — verify the trigger/index/constraint state too (outside inventory scope).

### B-group 2 — `invoices` — portal-payment columns never applied — HIGH
Source: `20260625125504_f42cf8d2-1c2f-4f1b-a34f-3b13fc86a476.sql` (lines 5–6).

| Column | Intent (file:line) | Live | Notes |
|---|---|---|---|
| `paid_at` | `:5` `date` | absent | migration comment: "the columns the verify-on-return function writes" |
| `stripe_checkout_session_id` | `:6` `text` | absent | Stripe portal payment verify path writes this |

Impact: the portal Stripe payment verify-on-return function writes these columns; if the function is live but the columns are not, portal invoice payment confirmation will fail.

### B-group 3 — `templates` — quote-send columns never applied — HIGH
Source: `20260623103629_ec2c7565-69bb-4ae1-a00a-8671b9d1c7ee.sql` (lines 18–19).

| Column | Intent (file:line) | Live | Notes |
|---|---|---|---|
| `category` | `:18` `text` | absent | `lifecycle_send_quote` selects `WHERE category = 'quote' OR name ILIKE …` |
| `is_active` | `:19` `boolean DEFAULT true` | absent | query uses `COALESCE(is_active, true) = true`; default also missing |

Impact: migration header states `lifecycle_send_quote` already errors with "column category does not exist" when sending a quote. This fix never landed live, so quote-send remains broken unless the upstream rewrite removed the dependency.

---

## A. Missing tables

None. Every table intended by a `CREATE TABLE` (with no later `DROP TABLE`) is present in the live inventory (225 intended tables all matched).

---

## Live-only tables (not in git) — informational

None. Every one of the 225 live public tables maps to a `CREATE TABLE` in the git migrations. No Lovable-created-only tables were detected at the table level.

---

## Coverage / limits

- **Scope of this pass:** table existence, column existence, column DEFAULT, and column nullability only — the four dimensions the live inventory exposes.
- **NOT covered by the inventory (need separate verification):** functions / RPC bodies, triggers, CHECK / UNIQUE / FK constraints, indexes, RLS policies, grants/roles, cron jobs, storage buckets/objects, sequences, enum type definitions, and column *type* changes (only flagged if a migration explicitly altered a type — none surfaced). Notably, B-group 1 (`engagement_letters`) references a trigger + CHECK constraint + two indexes and B-groups 2–3 reference edge functions — those companion objects should be verified out-of-band, since a partial apply (function/trigger landed, columns did not) is the dangerous state.
- **False-positive discipline applied:** 19 candidate DEFAULT diffs were resolved to formatting-equivalent and dropped (interval spellings e.g. `interval '15 minutes'` ≡ `'00:15:00'::interval`; `uuid_generate_v4()` ≡ `extensions.uuid_generate_v4()`; `public.` qualifiers; `'09:00'` ≡ `'09:00:00'::time`; `DEFAULT NULL` ≡ no default; paren/cast grouping noise on the `paye_schemes.tax_year_start` date expression). Only genuinely divergent state is reported above.
- **One-directional confidence:** the "live-only = 0 / missing-tables = 0" results depend on Lovable-created objects also being back-written into git migrations; if Lovable can create live objects that never reach git, a table/column present live but absent from git would (correctly) not be a *gap to repair* but also would not appear here as a finding beyond the live-only list (which is empty).

---

## Ranked repair backlog (highest outage risk first)

1. **C1** `onboarding_applications.status` DEFAULT `'pending'` → `'in_progress'` — breaks default-omitting inserts *now*.
2. **B-group 3** `templates.category` + `is_active` — quote-send is documented as already erroring.
3. **B-group 2** `invoices.paid_at` + `stripe_checkout_session_id` — portal Stripe payment verification.
4. **B-group 1** `engagement_letters` 7 columns (+ verify companion trigger/constraint/indexes) — EL lifecycle increment.
5. **D1** `bank_transactions.updated_at` SET NOT NULL — lower live risk (default+trigger cover it), tighten when convenient.
