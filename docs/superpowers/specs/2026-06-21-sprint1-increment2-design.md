# Sprint 1 — Increment 2 Design: Accept-RPC pending funnel (flag-gated)

**Date:** 2026-06-21
**Status:** Approved (scope confirmed: defer auto-activation). Design locked → implementation plan next.
**Scope:** Increment 2 of 5. Behind the per-org `canonical_lifecycle_enabled` flag, stop quote acceptance from activating the client, and make the gated approval the complete activation path. Flag OFF → behaviour byte-identical to today.

## Background / findings (verified against current `main`)

- The bypass is `public_accept_quote_by_token` (latest def `20260603200107`), called from `src/pages/PublicQuoteView.tsx:87`.
- Accept **already creates the client/company as `status='pending'`** (lines 234/278/305). What makes the relationship go live before the EL is signed is the **active rows it adds on top**: `accountant_client_links` (status `active`, lines 237/285/310), `engagements` (active, 357), `jobs` (408), `deadlines` (421/440).
- Accept does **not** create the `onboarding_application` (that is the self-heal path in `public_get_quote_by_token`, `20260604192142`). So the funnel needs to *remove* active-row creation, not add anything.
- Increment 1 shipped (all on `main`): the flag + reader, idempotency backstops, `lifecycle_onboarding_gates`, the dormant `lifecycle_evaluate_onboarding_activation`, and a flag-gated guard on `lifecycle_approve_onboarding` (blocks approval unless gates pass).
- `lifecycle_approve_onboarding`'s proven body creates entity + engagements + jobs + client_tasks + info-requests + portal, but **not** `accountant_client_links` and **not** deadlines. Since accept will stop creating the link (canonical orgs), **the active link must be created at approval** or a canonical client would have no practice↔client link.

## The two changes

### Change A — `public_accept_quote_by_token` becomes a pending funnel (flag-gated)

Add, right after the org is resolved (`v_org := v_quote.organization_id;`):
```sql
v_canonical boolean := public.is_canonical_lifecycle_enabled(v_org);
```
(declare `v_canonical boolean;` in the DECLARE block; assign after `v_org` is set).

Then wrap the **active-row creation** in `IF NOT v_canonical THEN … END IF`:
- the three `INSERT INTO public.accountant_client_links … 'active' …` statements (lines ~237, ~285, ~310), each guarded individually so the surrounding pending-entity creation is untouched;
- the entire `FOR v_line IN … LOOP … END LOOP` that creates engagements/jobs/deadlines (lines ~351–~455). This loop creates *only* active artefacts, so when canonical it is skipped wholesale.

Everything else is unchanged and runs for both flag states: pending client/company creation, `quotes` → `accepted`, lead → `won`, `ported_to_*`, automation events, the replay/already-accepted short-circuit, and the final return.

**Result, flag ON:** acceptance creates the pending entity + marks the quote accepted + lead won, and creates **no** active links/engagements/jobs/deadlines. **Flag OFF:** byte-identical to `20260603200107` (verified by diff — only the guards added).

### Change B — gated approval creates the active link in the canonical path

Extend the existing flag-gated section at the top of `lifecycle_approve_onboarding` so that, when the flag is ON (gates already enforced by the Increment 1 guard), approval **ensures the active `accountant_client_link`** for the application's entity. Idempotent: lookup-before-insert, and protected by the Increment 1 partial unique indexes (`acl_active_client_uq` / `acl_active_company_uq`).

Because the application's `client_id`/`company_id` may only be set *inside* approve's body (it can create the entity), the link-ensure must run **after** the entity is resolved. Cleanest minimal placement: immediately **before the final `UPDATE onboarding_applications SET status='approved'`** (after the entity + engagements/jobs loop), guarded by `IF public.is_canonical_lifecycle_enabled(v_onboarding.organization_id) THEN …`. The guard block uses the same link-insert shape as the accept-RPC (`practice_id, client_id|company_id, status='active', initiated_by='practice', activated_at=now()`), lookup-guarded.

Everything else in approve stays byte-identical to the current `main` version (which already includes the Increment 1 gate guard).

## Net canonical flow

accept → **pending** (no active rows) → client signs EL / completes AML / billing → accountant clicks **Approve** (existing UI, no change) → Increment 1 guard enforces gates → entity activates + engagements + jobs (proven body) + **active link** (Change B) → portal access. Deadlines are produced by the deadline engine from the now-active services/jobs (target architecture). Non-canonical orgs: accept activates fully and approve behaves exactly as today.

## Out of scope (deferred, confirmed)

- **Auto-activation** (the evaluator firing automatically at onboarding completion) — its own later increment; touches onboarding-completion RPCs and the evaluator's flag-off contract.
- Onboarding/EL token enforcement (Increment 3), frontend lifecycle states (Increment 4), test-org enablement + 5-scenario verification (Increment 5).

## What changes for existing orgs with the flag OFF

Nothing. `v_canonical` is false → every `IF NOT v_canonical` block runs as today; approve's new link-ensure is inside `IF is_canonical_lifecycle_enabled(...)` so it is skipped. Both functions are reproduced verbatim except the added guards (proven by diff).

## Rollback

- Instant, per-org: set `canonical_lifecycle_enabled = false`.
- Code: redeploy both functions from their current `main` definitions (kept verbatim in the plan for mechanical restore).

## Live test plan (app-level, after enablement in Increment 5; flag-OFF regression testable now)

**Flag OFF (now):** accept a quote via a public link → client activates with jobs exactly as today; approve an onboarding → activates as today. (Regression: nothing changed.)

**Flag ON (test org, Increment 5):**
1. Accept a quote → the client appears as **pending**, with **no jobs** and **no active link** yet.
2. Complete onboarding (sign EL, AML, billing).
3. Click **Approve** → client becomes **active**, jobs appear, portal access granted, and a practice↔client link exists.
4. Approve before onboarding is complete → blocked with the outstanding-gates message (Increment 1 guard).
