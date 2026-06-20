# Sprint 1 — Increment 1 Design: Dormant canonical-lifecycle foundation

**Date:** 2026-06-20
**Status:** Approved (with amendments 1–7) — design locked, implementation plan next.
**Scope:** Increment 1 of 5. Lay the flag-gated, dormant foundation for the canonical engagement-letter lifecycle. **With the per-org flag OFF (the default), nothing behaves differently.**

## Background

Today `public_accept_quote_by_token` eagerly creates active `accountant_client_links`, active `engagements`, `blank` jobs and `pending` deadlines at **quote acceptance** — before any engagement letter is signed. Sprint 1 makes activation conditional on completing onboarding (incl. EL signing) via a gate evaluator, and reduces acceptance to a pending funnel. Because this changes a live activation path that cannot be tested against the production DB from this environment, rollout is gated by a **per-org feature flag** and delivered in 5 increments.

### The 5-increment decomposition

1. **Increment 1 (this doc):** dormant foundation — per-org flag, idempotency backstops, activation evaluator (flag-aware), narrow flag-gated approval guard. No live behaviour change while the flag is OFF.
2. Accept-RPC pending funnel behind the per-org flag + wire the evaluator.
3. Onboarding/EL signing token enforcement.
4. Frontend lifecycle states and routing.
5. Controlled enablement for one test org + five-scenario verification.

Increments 2–5 are out of scope here.

---

## 1. Tables / columns / functions touched

| Object | Change |
|---|---|
| `organizations` | **Add** column `canonical_lifecycle_enabled boolean NOT NULL DEFAULT false` |
| `public.is_canonical_lifecycle_enabled(p_org_id uuid) → boolean` | **New** SECURITY DEFINER reader; single server-side source of truth for the flag |
| `public.lifecycle_onboarding_gates(p_application_id uuid) → jsonb` | **New** pure read-only gate evaluator (per-gate booleans + `all_pass` + outstanding list). Shared by the evaluator and the approve guard so gate logic can't drift. Writes nothing. |
| `public.lifecycle_evaluate_onboarding_activation(p_application_id uuid) → jsonb` | **New**, flag-aware, **dormant** (nothing calls it in Inc 1) |
| `public.lifecycle_approve_onboarding(p_onboarding_id uuid)` | **Modify**: add a narrow top-level flag-gated guard ONLY. Everything below the guard is byte-identical to `20260603180743`. |
| `engagements` | **New** partial unique index (backstop) |
| `accountant_client_links` | **New** two partial unique indexes (backstop) |
| `jobs` | **New** two partial unique indexes (backstop) |

No data rewrites. No other tables touched. No change to `public_accept_quote_by_token`, onboarding token RPCs, frontend, or services/jobs/deadlines logic.

## 2. The activation evaluator — gates and flag-awareness

`lifecycle_evaluate_onboarding_activation(p_application_id)` returns a `jsonb` verdict and is **flag-aware** (amendment 1):

```
load application A (and its organization_id = O)
flag := is_canonical_lifecycle_enabled(O)
gates := lifecycle_onboarding_gates(A)   -- shared pure read, no writes
IF NOT flag:
    RETURN { mode:'dry_run', flag:false, gates, would_activate: gates.all_pass }   -- creates NOTHING
IF flag AND gates.all_pass:
    perform_activation(A)            -- idempotent; see §4
    RETURN { mode:'activated', gates }
IF flag AND NOT gates.all_pass:
    set A.status = 'for_review', record outstanding gates (review_feedback/jsonb)
    RETURN { mode:'routed_to_review', gates }   -- creates NO active rows
```

So even when invoked directly with the flag OFF, the evaluator **cannot create active rows** — it only returns a gate/dry-run JSON. (Inc 2 is what actually calls it in the live flow, and only for flagged orgs.)

### 2.1 Mandatory gates (all on verified, real columns)

| Gate key | Condition |
|---|---|
| `engagement_letter_signed` | latest `engagement_letters` row for `onboarding_application_id = A` has `signed_at IS NOT NULL` **and** `onboarding_applications.contracts_signed_at IS NOT NULL` |
| `aml_passed` | `onboarding_applications.aml_status = 'verified'` |
| `billing_settled` | `onboarding_applications.billing_status IN ('completed','skipped','not_required')` |
| `onboarding_submitted` | `submitted_for_review_at IS NOT NULL` OR `status IN ('portal_pending','for_review')` |
| `not_already_closed` | `status NOT IN ('approved','rejected','cancelled')` |
| `activation_context_present` | **(amendment 2)** the minimum identifiers needed to create outputs safely are present — see §2.2 |

The plan's `requires_review`/`needs_review` gate is **dropped**: those columns do not exist on `onboarding_applications` (`needs_review` lives on `email_messages`). "Needs review" is the route-to-`for_review` exception path, not a separate flag.

`gates.all_pass` = every mandatory gate true. Any failure ⇒ route to `for_review` with the failing keys; **no partial activation**.

### 2.2 Missing-context gate (amendment 2)

To avoid partially activating, the evaluator requires the minimum context to create the engagement, link, and jobs as a set. First-cut condition (finalised against the `20260603180743` activation body during writing-plans):

- `organization_id` present, AND
- `quote_id` present and the quote has ≥1 `quote_lines` row, AND
- a resolvable activation **target**: `onboarding_applications.client_id` and/or `company_id` is set (or the activation body can deterministically create/resolve one from application data).

If insufficient ⇒ record outstanding gate **`missing_activation_context`**, route to `for_review`, create nothing. This gate fails *closed*.

## 3. How the per-org flag is read server-side

```sql
CREATE FUNCTION public.is_canonical_lifecycle_enabled(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT canonical_lifecycle_enabled FROM organizations WHERE id = p_org_id), false);
$$;
```

The evaluator and the hardened approve both call it with the application's `organization_id`. Default `false` ⇒ every existing org is OFF on apply.

## 4. Idempotency safeguards

**Layer 1 — logical (primary):** lookup-before-insert on natural keys before every insert (already present in `lifecycle_approve_onboarding`; mirrored in the evaluator's activation body).

**Layer 2 — DB backstops (partial unique indexes)** matching the keys the current code already keeps unique, so they should not collide with existing data:

- **engagements:** `UNIQUE (quote_id, service_id) WHERE quote_id IS NOT NULL`
- **accountant_client_links (amendment 5):** two explicit partial indexes
  - `UNIQUE (practice_id, client_id)  WHERE client_id  IS NOT NULL AND status = 'active'`
  - `UNIQUE (practice_id, company_id) WHERE company_id IS NOT NULL AND status = 'active'`
- **jobs (amendment 4):** two explicit partial indexes (avoid a single nullable composite — NULLs are distinct in a unique index, which would silently fail to dedup):
  - `UNIQUE (organization_id, service_type, client_id,  period_label) WHERE client_id  IS NOT NULL AND company_id IS NULL`
  - `UNIQUE (organization_id, service_type, company_id, period_label) WHERE company_id IS NOT NULL AND client_id IS NULL`
  - A **third** index for the both-set case is added **only if** the preflight (§8) shows jobs legitimately carrying both `client_id` and `company_id`. Code paths today set exactly one (accept-RPC target is client XOR company; template-engine and workflow-tick set one), so the expectation is none exist. Both-set rows are intentionally left unconstrained rather than guessed at.

We do **not** use the plan's `jobs(generation_reason)` key — the accept-RPC writes the same `generation_reason` (`quote_acceptance:<quote_id>`) for every line of a quote, so it is not unique.

**Non-blocking, actionable apply (amendment 6):** each unique index is preceded by a **duplicate preflight**. If duplicates exist, the migration `RAISE WARNING` with **index name, the duplicate key values, the duplicate row IDs, the count, and the exact inspection query**, then **skips** that index (migration still succeeds). If there are no duplicates, the index is created. Only the data-duplicate case is downgraded; **schema/syntax errors are not caught and still fail loudly.** Pattern per index:

```sql
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT quote_id, service_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.engagements
    WHERE quote_id IS NOT NULL
    GROUP BY quote_id, service_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'idx engagements_quote_service: duplicate (quote_id=%, service_id=%) count=% rows=% — inspect: SELECT * FROM engagements WHERE quote_id=% AND service_id=%;',
      r.quote_id, r.service_id, r.c, r.row_ids, r.quote_id, r.service_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS engagements_quote_service_uq
      ON public.engagements (quote_id, service_id) WHERE quote_id IS NOT NULL;
  ELSE
    RAISE WARNING 'idx engagements_quote_service skipped: % duplicate group(s) — resolve and re-run this migration.', n;
  END IF;
END $$;
```
(One such block per index, with the index's own key columns/filter.)

## 5. What stays dormant until later increments

- The evaluator is **called by nothing** in Inc 1 (Inc 2 wires it) and refuses to write when the flag is OFF.
- `public_accept_quote_by_token` is **unchanged** (Inc 2).
- Onboarding token enforcement — Inc 3. Frontend — Inc 4. Controlled enablement + 5-scenario verification — Inc 5.
- The hardened approve guard only fires when the org flag is ON; with all orgs OFF by default, it is dormant.

## 6. What changes for existing orgs with the flag OFF

**Nothing behavioural.** `is_canonical_lifecycle_enabled` returns false ⇒ the approve guard is skipped (body byte-identical to `20260603180743`), the evaluator never writes, accept-RPC is untouched. Globally-applied artefacts are only: the additive flag column (default false), two new functions (one dormant, one reader), and backstop indexes matching existing de-facto uniqueness (at worst they reject a *future* duplicate insert that would itself be a bug). The hardened approve change (amendment 3) is a **narrow top-level guard**:

```
-- top of lifecycle_approve_onboarding, before existing body:
IF is_canonical_lifecycle_enabled(<application's org>) THEN
   IF NOT (lifecycle_onboarding_gates(p_onboarding_id) ->> 'all_pass')::boolean THEN
      RAISE EXCEPTION 'Cannot approve: outstanding gates: %',
        lifecycle_onboarding_gates(p_onboarding_id) -> 'outstanding';
   END IF;
END IF;
-- ↓↓↓ everything below is byte-identical to 20260603180743 ↓↓↓
```

No refactor, no extraction, no reordering of the existing 348-line body.

## 7. Rollback plan

- **Instant, per-org:** `UPDATE organizations SET canonical_lifecycle_enabled = false WHERE id = …;` → reverts behaviour, no redeploy.
- **Full code rollback (down-migration):** drop the two new functions and the backstop indexes, restore `lifecycle_approve_onboarding` to the verbatim `20260603180743` body (kept in the implementation plan for mechanical restore), and `ALTER TABLE organizations DROP COLUMN canonical_lifecycle_enabled`. Low-stakes because every change is dormant/flag-gated.

## 8. Live test plan

### 8a. Flag-OFF (default) — prove no behaviour change
1. `SELECT canonical_lifecycle_enabled FROM organizations LIMIT 5;` → all `false`.
2. Approve an onboarding application in a non-flagged org → activates exactly as today.
3. Quote acceptance → unchanged.
4. Backstop indexes present (`\d engagements`, `\d accountant_client_links`, `\d jobs`); apply log shows no duplicate WARNINGs (or the exact keys/rows to resolve if it does).
5. **Safe dormant dry-run:** `BEGIN; SELECT lifecycle_evaluate_onboarding_activation('<test application id>'); ROLLBACK;` → returns `mode:'dry_run'` gate JSON, commits nothing.

### 8b. Added tests (amendment 7)
6. **Duplicate preflight query before each unique index** — run, per index, the GROUP BY … HAVING count(*) > 1 query (see §4) against live data and confirm it returns **zero rows** before relying on the backstop. Also run the jobs both-set probe:
   `SELECT count(*) FROM jobs WHERE client_id IS NOT NULL AND company_id IS NOT NULL;` (decides whether the third jobs index is needed).
7. **Transaction-only flag-ON negative-gate test** — prove an incomplete application routes to review and creates nothing:
   ```sql
   BEGIN;
   UPDATE organizations SET canonical_lifecycle_enabled = true WHERE id = '<test org>';
   -- pick an application in <test org> missing a gate (e.g. unsigned EL or aml_status<>'verified')
   SELECT lifecycle_evaluate_onboarding_activation('<incomplete application id>');  -- expect mode:'routed_to_review'
   SELECT status FROM onboarding_applications WHERE id = '<incomplete application id>';  -- expect 'for_review'
   -- assert NO new active rows were created for this entity:
   --   SELECT count(*) FROM accountant_client_links WHERE … created in this tx;
   --   SELECT count(*) FROM engagements WHERE quote_id = <app.quote_id>;  -- unchanged
   --   SELECT count(*) FROM jobs WHERE … ;  -- unchanged
   ROLLBACK;  -- discards the flag flip and any side effects
   ```
   Expected: `routed_to_review`, status `for_review`, zero active rows. ROLLBACK guarantees the test mutates nothing permanently.

## 9. Assumptions / to finalise in the implementation plan

- Exact `missing_activation_context` field set is finalised against the `20260603180743` approve body (does it create vs. assume client/company).
- Whether the activation body is duplicated into the evaluator (Inc 1) or shared (Inc 2 converges them) — Inc 1 may carry a mirrored body; convergence is an Inc 2 concern, kept out of scope here to avoid refactoring approve.
- The third jobs index depends on the §8b both-set probe result.
