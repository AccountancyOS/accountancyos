## Blocker found before flipping the flag

The runbook assumes `organizations.canonical_lifecycle_enabled` already exists on the live database. It does not.

- Org row confirmed: **Blue Tick Accountants & Tax Advisers LLP** (`a857a12c-a125-41de-bb45-9eb556d5b467`).
- Column check on live DB: `column "canonical_lifecycle_enabled" does not exist`.
- Migration files for Sprint 1 (Increments 1, 2, 3a, 3b) exist on disk under `supabase/migrations/` but are **not present** in `supabase_migrations.schema_migrations` — the latest applied migration is `20260622172620`, and none of the six `canonical_lifecycle` migrations show up as applied.

So we cannot just `UPDATE organizations SET canonical_lifecycle_enabled = true …` — the underlying schema, RPC guards, token enforcement, and `is_canonical_lifecycle_enabled()` reader aren't in the database yet. Flipping a non-existent flag would error; worse, even if we forced it through, none of the gated behaviour would actually trigger because the guarded RPC bodies aren't deployed either.

## What needs to happen

### Step 1 — Apply the pending Sprint 1 migrations to live DB
The six migration files already on disk need to be applied (in order):

```text
20260621154153 — Increment 1: add flag column + is_canonical_lifecycle_enabled() + gates
20260621160539 — Increment 1 follow-up
20260621160701 — Increment 1 follow-up
20260621174352 — Increment 2: pending funnel (quote accept no longer activates)
20260621174736 — Increment 2 follow-up
20260624074308 — Increment 3b: token enforcement on public onboarding RPCs
```

Each will go through the normal migration approval flow. They are designed to be **dormant** (default `false`) so applying them changes nothing for any existing org.

### Step 2 — Flip the flag for Blue Tick only
Once the migrations are applied:

```sql
UPDATE public.organizations
SET canonical_lifecycle_enabled = true
WHERE id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
```

Scope is strictly that one row. Every other org stays on the legacy path.

### Step 3 — Verification (owner-driven, per the runbook)
After the flip, the owner walks the five scenarios on Blue Tick (quote accept → pending shell, complete onboarding → approve activates, early approve blocked, Add Client → pending, Won lead doesn't auto-activate). Token enforcement (Increment 3b) is verified on the same org.

### Rollback
Single statement reverts behaviour instantly without touching schema or redeploying:

```sql
UPDATE public.organizations
SET canonical_lifecycle_enabled = false
WHERE id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
```

## Questions before I proceed

1. **Confirm I should apply the six pending Sprint 1 migrations to the live database now.** They'll each surface as a separate approval; nothing behavioural changes for any org until Step 2.
2. **Confirm Blue Tick is the intended test practice** (id `a857a12c-…b467`) and that you accept it being the only org with the canonical lifecycle live.

If both are "yes", I'll apply the migrations in order in build mode, then run the single `UPDATE` to flip the flag on Blue Tick.
