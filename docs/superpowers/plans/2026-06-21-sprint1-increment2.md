# Sprint 1 — Increment 2 Implementation Plan: Accept pending funnel (flag-gated)

> REQUIRED SUB-SKILL: superpowers:executing-plans. Both tasks are dormant behind `canonical_lifecycle_enabled` (OFF by default) → applying them changes nothing for current orgs.

**Goal:** Behind the flag, (A) quote acceptance creates no active rows, and (B) gated approval creates the active accountant_client_link. Flag OFF → byte-identical to current `main`.

## Global Constraints
- One migration per task; reproduce each function body verbatim and add ONLY the guards. Prove with `diff` that nothing else changed (per the RPC-replacement guard).
- Migration filename: `supabase/migrations/<UTC ts>_<uuid>.sql`.
- Flag read server-side via `public.is_canonical_lifecycle_enabled(org)`.
- Commit each task; `git fetch` + rebase before push (Lovable shares `main`).

---

## Task A: `public_accept_quote_by_token` → pending funnel (flag-gated)

**Source of truth:** `supabase/migrations/20260603200107_7247b4e8-f099-4ed9-965f-f453046123f1.sql` (the migration defines `resolve_company_director` THEN `public_accept_quote_by_token`; reproduce BOTH verbatim, edit only the accept fn + its GRANT stays).

**Guards to add (4 edits, accept fn only):**
1. DECLARE: add `  v_canonical boolean;` immediately after the `  v_org uuid;` line.
2. After `  v_org := v_quote.organization_id;` add a line: `  v_canonical := public.is_canonical_lifecycle_enabled(v_org);`
3. Wrap each of the **three** `INSERT INTO public.accountant_client_links … VALUES (…);` two-line blocks in `IF NOT v_canonical THEN` / `END IF;`. (Disambiguate the two `client_id` ones by their VALUES: `v_client_id` in the SA block, `v_partnership_id` in the partnership block.)
4. Wrap the entire `FOR v_line IN … END LOOP;` (engagements/jobs/deadlines) in `IF NOT v_canonical THEN` / `END IF;`.

Leave untouched: pending client/company creation, the replay short-circuit, `UPDATE public.quotes … 'accepted'`, lead → `won`, `ported_to_*`, automation events, final RETURN.

- [ ] **Step 1:** Copy the source migration to the new file verbatim (new header comment), apply the 4 guard edits, keep `resolve_company_director` and both GRANTs unchanged.
- [ ] **Step 2 (mandatory diff):** `diff` the new `public_accept_quote_by_token` body against the source's lines 126–end. Expected: ONLY the added `v_canonical` declaration/assignment and the `IF NOT v_canonical THEN … END IF` wrappers appear as additions. Any other delta → fix before commit.
- [ ] **Step 3 (sanity):** confirm balanced `IF`/`END IF` and that the loop wrapper encloses the full `FOR … END LOOP;`.
- [ ] **Step 4:** Commit + push.

**Live verification (flag OFF, regression — safe now):** accept a quote via a public link in a non-flagged org → client activates with jobs exactly as today. **Flag ON (Increment 5):** accept → pending client, no jobs, no active link.

---

## Task B: gated approval creates the active link (canonical path)

**Source of truth:** the current `lifecycle_approve_onboarding` on `main` (the Increment 1 version, commit `8cfb658` — gate guard already at top). Reproduce verbatim + add ONE block.

**Guard to add (1 edit):** immediately BEFORE the final `UPDATE onboarding_applications SET status = 'approved'` (entity + engagements/jobs already created by then), insert:
```sql
  -- Sprint 1 Increment 2: in canonical mode, ensure the active practice<->entity
  -- link (the one activation output the approve body does not otherwise create).
  IF public.is_canonical_lifecycle_enabled(v_onboarding.organization_id) THEN
    IF v_company_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.accountant_client_links
                     WHERE practice_id = v_onboarding.organization_id
                       AND company_id = v_company_id AND status = 'active') THEN
        INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
        VALUES (v_onboarding.organization_id, v_company_id, 'active', 'practice', now());
      END IF;
    ELSIF v_client_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.accountant_client_links
                     WHERE practice_id = v_onboarding.organization_id
                       AND client_id = v_client_id AND status = 'active') THEN
        INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
        VALUES (v_onboarding.organization_id, v_client_id, 'active', 'practice', now());
      END IF;
    END IF;
  END IF;
```

- [ ] **Step 1:** Copy the current `main` `lifecycle_approve_onboarding` verbatim into the new migration; insert the block before the final status UPDATE.
- [ ] **Step 2 (mandatory diff):** `diff` against the current `main` function — only the added link-ensure block appears.
- [ ] **Step 3:** Commit + push.

**Live verification:** flag OFF → approval behaves exactly as today (the new block is skipped). Flag ON (Increment 5) → approving a completed onboarding yields an active practice↔client link in addition to engagements/jobs.

---

## Self-Review
- Spec coverage: Change A ↔ Task A; Change B ↔ Task B. Both flag-gated; flag OFF = verbatim. Rollback = per-org flag off / redeploy verbatim.
- Idempotency: Task B link-ensure is lookup-guarded + protected by `acl_active_client_uq`/`acl_active_company_uq`.
- Both tasks dormant on apply (flag OFF) → no inter-task app testing required; real app test is Increment 5.
