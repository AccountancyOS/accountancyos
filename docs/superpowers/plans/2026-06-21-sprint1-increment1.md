# Sprint 1 — Increment 1 Implementation Plan: Dormant canonical-lifecycle foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the per-org flag, idempotency backstops, a flag-aware activation evaluator (links/engagements/jobs/client_tasks/info-requests/portal; NO deadlines), and a narrow flag-gated guard on `lifecycle_approve_onboarding` — all dormant so that with the flag OFF (default) live behaviour is unchanged.

**Architecture:** All server-side, in `supabase/migrations/*.sql`. The evaluator mirrors the proven `lifecycle_approve_onboarding` body (`20260603180743`) **plus** active `accountant_client_links` creation, gated by a per-org boolean read through a SECURITY DEFINER helper. Deadlines remain owned by `deadline-engine.ts`. Verification is by static SQL review here + a documented live SQL/UI test plan (no DB in this environment).

**Tech Stack:** PostgreSQL (Supabase), plpgsql, pgmq-adjacent conventions already in repo. Migrations are forward-only; apply via Lovable / `supabase db push`.

**Spec:** `docs/superpowers/specs/2026-06-20-sprint1-increment1-design.md`

## Global Constraints

- One migration file per task is acceptable; all SQL must be idempotent and safe to re-run (`IF NOT EXISTS`, `CREATE OR REPLACE`, guarded `DO` blocks).
- Migration filename format: `supabase/migrations/<UTC yyyymmddHHMMSS>_<uuid>.sql`. Generate per task with: `echo "$(date -u +%Y%m%d%H%M%S)_$(uuidgen | tr 'A-Z' 'a-z')"`.
- **With the flag OFF, behaviour MUST be byte-identical to today.** Default `canonical_lifecycle_enabled = false`.
- The `lifecycle_approve_onboarding` change is a **narrow top-level guard ONLY**; everything below the guard stays byte-identical to `20260603180743`.
- The evaluator creates: **accountant_client_links, engagements, jobs, client_tasks, info-request emails, portal access. It MUST NOT create deadlines** (delegated to the deadline engine).
- pgcrypto/`gen_random_bytes` lives in the `extensions` schema; any function needing it uses `SET search_path TO 'public','extensions'`.
- Idempotency = lookup-before-insert (logical) + partial unique indexes (backstop). Unique indexes are created only after a duplicate preflight passes; duplicates → actionable `RAISE WARNING` + skip (data-dup case only); schema/syntax errors fail loudly.
- Cannot run migrations locally. Each task's "test" = a documented SQL/psql verification to run against the Supabase project, plus `npm run build` / `npx vitest run` where TS is touched (none expected in Inc 1).
- After each task: commit; fetch + rebase onto `origin/main` before pushing (Lovable pushes to the same branch); push.
- Constants/canonical values must match the DB (job status `blank`; client_tasks status `not_started`, visibility `client_visible`; link status `active`, initiator `practice`).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_<uuid>.sql` (Task 1) | Add `organizations.canonical_lifecycle_enabled` + `is_canonical_lifecycle_enabled()` reader |
| `supabase/migrations/<ts>_<uuid>.sql` (Task 2) | Idempotency backstop indexes (engagements, accountant_client_links ×2, jobs ×2) with duplicate preflight |
| `supabase/migrations/<ts>_<uuid>.sql` (Task 3) | `lifecycle_onboarding_gates()` shared read-only gate evaluator |
| `supabase/migrations/<ts>_<uuid>.sql` (Task 4) | `lifecycle_evaluate_onboarding_activation()` flag-aware evaluator (dormant) |
| `supabase/migrations/<ts>_<uuid>.sql` (Task 5) | Narrow flag-gated guard prepended to `lifecycle_approve_onboarding` |
| `docs/superpowers/plans/2026-06-21-sprint1-increment1.md` | This plan |

Each task is its own migration so a reviewer can reject one without blocking the others, and so a failed apply isolates to one concern.

---

## Task 1: Per-org feature flag + server-side reader

**Files:**
- Create: `supabase/migrations/<ts>_<uuid>.sql`

**Interfaces:**
- Produces: column `public.organizations.canonical_lifecycle_enabled boolean NOT NULL DEFAULT false`; function `public.is_canonical_lifecycle_enabled(p_org_id uuid) RETURNS boolean` (true only when the org row's flag is true; false for missing org).

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 1 Inc 1 / Task 1: per-org canonical-lifecycle flag + reader (dormant)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS canonical_lifecycle_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_canonical_lifecycle_enabled(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT canonical_lifecycle_enabled FROM public.organizations WHERE id = p_org_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_canonical_lifecycle_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_canonical_lifecycle_enabled(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.organizations.canonical_lifecycle_enabled IS
  'Sprint 1: when true, the canonical engagement-letter lifecycle (gate evaluator + hardened approval) is enforced for this org. Default false = legacy behaviour.';
```

- [ ] **Step 2: Static self-check**

Confirm: column is `DEFAULT false` and `NOT NULL`; function is `STABLE SECURITY DEFINER` with `search_path = public`; `COALESCE(..., false)` handles a missing org id. No other object touched.

- [ ] **Step 3: Live verification SQL (run against the Supabase project after apply)**

```sql
-- all existing orgs default to OFF
SELECT count(*) FILTER (WHERE canonical_lifecycle_enabled) AS enabled,
       count(*) AS total
FROM public.organizations;                         -- expect enabled = 0

SELECT public.is_canonical_lifecycle_enabled((SELECT id FROM public.organizations LIMIT 1));  -- expect false
SELECT public.is_canonical_lifecycle_enabled('00000000-0000-0000-0000-000000000000');         -- expect false (missing)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_<uuid>.sql
git commit -m "feat(sprint1): add per-org canonical_lifecycle_enabled flag + reader (dormant)"
git fetch origin && git rebase origin/main && git push origin main
```

---

## Task 2: Idempotency backstop indexes (preflighted, non-blocking on dup data)

**Files:**
- Create: `supabase/migrations/<ts>_<uuid>.sql`

**Interfaces:**
- Produces (each created ONLY if its duplicate preflight finds zero dup groups):
  `engagements_quote_service_uq` UNIQUE `(quote_id, service_id) WHERE quote_id IS NOT NULL`;
  `acl_active_client_uq` UNIQUE `(practice_id, client_id) WHERE client_id IS NOT NULL AND status='active'`;
  `acl_active_company_uq` UNIQUE `(practice_id, company_id) WHERE company_id IS NOT NULL AND status='active'`;
  `jobs_client_period_uq` UNIQUE `(organization_id, service_type, client_id, period_label) WHERE client_id IS NOT NULL AND company_id IS NULL`;
  `jobs_company_period_uq` UNIQUE `(organization_id, service_type, company_id, period_label) WHERE company_id IS NOT NULL AND client_id IS NULL`.

- [ ] **Step 1: Run the duplicate preflight queries FIRST (manually, against the project)**

Run all five before writing/applying. Each must return zero rows for its index to be created on apply. Also run the jobs both-set probe.

```sql
-- engagements (quote_id, service_id)
SELECT quote_id, service_id, count(*) c, array_agg(id) ids
FROM public.engagements WHERE quote_id IS NOT NULL
GROUP BY quote_id, service_id HAVING count(*) > 1;

-- accountant_client_links active per (practice, client)
SELECT practice_id, client_id, count(*) c, array_agg(id) ids
FROM public.accountant_client_links
WHERE client_id IS NOT NULL AND status = 'active'
GROUP BY practice_id, client_id HAVING count(*) > 1;

-- accountant_client_links active per (practice, company)
SELECT practice_id, company_id, count(*) c, array_agg(id) ids
FROM public.accountant_client_links
WHERE company_id IS NOT NULL AND status = 'active'
GROUP BY practice_id, company_id HAVING count(*) > 1;

-- jobs client-scoped
SELECT organization_id, service_type, client_id, period_label, count(*) c, array_agg(id) ids
FROM public.jobs WHERE client_id IS NOT NULL AND company_id IS NULL
GROUP BY organization_id, service_type, client_id, period_label HAVING count(*) > 1;

-- jobs company-scoped
SELECT organization_id, service_type, company_id, period_label, count(*) c, array_agg(id) ids
FROM public.jobs WHERE company_id IS NOT NULL AND client_id IS NULL
GROUP BY organization_id, service_type, company_id, period_label HAVING count(*) > 1;

-- jobs both-set probe (decides whether a 3rd index is even relevant)
SELECT count(*) FROM public.jobs WHERE client_id IS NOT NULL AND company_id IS NOT NULL;  -- expect 0
```

Expected: all five GROUP BY queries return **zero rows**; both-set probe returns **0**. If any returns rows, record the keys/ids and resolve the duplicates (or report) before relying on that index — the migration will WARN-and-skip that index regardless, but knowing up front is required.

- [ ] **Step 2: Write the migration (one guarded block per index)**

Each index uses the actionable preflight-then-create pattern. Full block for `engagements`; the other four follow the identical shape with their own key columns/filter.

```sql
-- Sprint 1 Inc 1 / Task 2: idempotency backstops (preflighted, non-blocking on dup DATA)

-- engagements (quote_id, service_id)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT quote_id, service_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.engagements WHERE quote_id IS NOT NULL
    GROUP BY quote_id, service_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'engagements_quote_service_uq: dup (quote_id=%, service_id=%) count=% rows=% — inspect: SELECT * FROM public.engagements WHERE quote_id=% AND service_id=%;',
      r.quote_id, r.service_id, r.c, r.row_ids, r.quote_id, r.service_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS engagements_quote_service_uq
      ON public.engagements (quote_id, service_id) WHERE quote_id IS NOT NULL;
  ELSE
    RAISE WARNING 'engagements_quote_service_uq SKIPPED: % dup group(s) — resolve and re-run.', n;
  END IF;
END $$;

-- accountant_client_links active per (practice, client)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT practice_id, client_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.accountant_client_links
    WHERE client_id IS NOT NULL AND status = 'active'
    GROUP BY practice_id, client_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'acl_active_client_uq: dup (practice_id=%, client_id=%) count=% rows=% — inspect: SELECT * FROM public.accountant_client_links WHERE practice_id=% AND client_id=% AND status=''active'';',
      r.practice_id, r.client_id, r.c, r.row_ids, r.practice_id, r.client_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS acl_active_client_uq
      ON public.accountant_client_links (practice_id, client_id)
      WHERE client_id IS NOT NULL AND status = 'active';
  ELSE
    RAISE WARNING 'acl_active_client_uq SKIPPED: % dup group(s) — resolve and re-run.', n;
  END IF;
END $$;

-- accountant_client_links active per (practice, company)
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT practice_id, company_id, count(*) AS c, array_agg(id) AS row_ids
    FROM public.accountant_client_links
    WHERE company_id IS NOT NULL AND status = 'active'
    GROUP BY practice_id, company_id HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'acl_active_company_uq: dup (practice_id=%, company_id=%) count=% rows=% — inspect: SELECT * FROM public.accountant_client_links WHERE practice_id=% AND company_id=% AND status=''active'';',
      r.practice_id, r.company_id, r.c, r.row_ids, r.practice_id, r.company_id;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS acl_active_company_uq
      ON public.accountant_client_links (practice_id, company_id)
      WHERE company_id IS NOT NULL AND status = 'active';
  ELSE
    RAISE WARNING 'acl_active_company_uq SKIPPED: % dup group(s) — resolve and re-run.', n;
  END IF;
END $$;

-- jobs client-scoped
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT organization_id, service_type, client_id, period_label, count(*) AS c, array_agg(id) AS row_ids
    FROM public.jobs WHERE client_id IS NOT NULL AND company_id IS NULL
    GROUP BY organization_id, service_type, client_id, period_label HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'jobs_client_period_uq: dup (org=%, service_type=%, client_id=%, period_label=%) count=% rows=%',
      r.organization_id, r.service_type, r.client_id, r.period_label, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_client_period_uq
      ON public.jobs (organization_id, service_type, client_id, period_label)
      WHERE client_id IS NOT NULL AND company_id IS NULL;
  ELSE
    RAISE WARNING 'jobs_client_period_uq SKIPPED: % dup group(s) — resolve and re-run.', n;
  END IF;
END $$;

-- jobs company-scoped
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT organization_id, service_type, company_id, period_label, count(*) AS c, array_agg(id) AS row_ids
    FROM public.jobs WHERE company_id IS NOT NULL AND client_id IS NULL
    GROUP BY organization_id, service_type, company_id, period_label HAVING count(*) > 1
  LOOP
    n := n + 1;
    RAISE WARNING 'jobs_company_period_uq: dup (org=%, service_type=%, company_id=%, period_label=%) count=% rows=%',
      r.organization_id, r.service_type, r.company_id, r.period_label, r.c, r.row_ids;
  END LOOP;
  IF n = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_period_uq
      ON public.jobs (organization_id, service_type, company_id, period_label)
      WHERE company_id IS NOT NULL AND client_id IS NULL;
  ELSE
    RAISE WARNING 'jobs_company_period_uq SKIPPED: % dup group(s) — resolve and re-run.', n;
  END IF;
END $$;
```

- [ ] **Step 3: Verify indexes exist after apply**

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('engagements_quote_service_uq','acl_active_client_uq',
                    'acl_active_company_uq','jobs_client_period_uq','jobs_company_period_uq')
ORDER BY indexname;   -- expect all 5 IF preflight was clean; any missing = check apply log WARNINGs
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_<uuid>.sql
git commit -m "feat(sprint1): idempotency backstop indexes (engagements/links/jobs), preflighted"
git fetch origin && git rebase origin/main && git push origin main
```

---

## Task 3: Shared read-only gate evaluator `lifecycle_onboarding_gates()`

**Files:**
- Create: `supabase/migrations/<ts>_<uuid>.sql`

**Interfaces:**
- Produces: `public.lifecycle_onboarding_gates(p_application_id uuid) RETURNS jsonb`. Writes nothing. Returns:
  `{ gates: {engagement_letter_signed, aml_passed, billing_settled, onboarding_submitted, not_already_closed, activation_context_present}::bool, all_pass: bool, outstanding: text[] }`.
  Consumed by Task 4 (evaluator) and Task 5 (approve guard).

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 1 Inc 1 / Task 3: shared read-only onboarding gate evaluator
CREATE OR REPLACE FUNCTION public.lifecycle_onboarding_gates(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a              public.onboarding_applications%ROWTYPE;
  v_el_signed    boolean := false;
  v_aml          boolean := false;
  v_billing      boolean := false;
  v_submitted    boolean := false;
  v_open         boolean := false;
  v_context      boolean := false;
  v_has_lines    boolean := false;
  v_outstanding  text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO a FROM public.onboarding_applications WHERE id = p_application_id;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('error', 'application_not_found', 'all_pass', false,
                              'outstanding', to_jsonb(ARRAY['application_not_found']));
  END IF;

  -- engagement_letter_signed: latest EL row signed AND application records signature
  v_el_signed := (
    EXISTS (
      SELECT 1 FROM public.engagement_letters el
      WHERE el.onboarding_application_id = p_application_id AND el.signed_at IS NOT NULL
    )
    AND a.contracts_signed_at IS NOT NULL
  );

  v_aml      := (a.aml_status = 'verified');
  v_billing  := (a.billing_status IN ('completed','skipped','not_required'));
  v_submitted := (a.submitted_for_review_at IS NOT NULL OR a.status IN ('portal_pending','for_review'));
  v_open     := (a.status NOT IN ('approved','rejected','cancelled'));

  -- activation_context_present: org + a quote with >=1 line + a resolvable target
  SELECT EXISTS (SELECT 1 FROM public.quote_lines ql WHERE ql.quote_id = a.quote_id) INTO v_has_lines;
  v_context := (
    a.organization_id IS NOT NULL
    AND a.quote_id IS NOT NULL
    AND v_has_lines
    AND (a.client_id IS NOT NULL OR a.company_id IS NOT NULL
         OR a.application_type IN ('individual','company'))  -- approve body can create the entity
  );

  IF NOT v_el_signed THEN v_outstanding := v_outstanding || 'engagement_letter_signed'; END IF;
  IF NOT v_aml       THEN v_outstanding := v_outstanding || 'aml_passed'; END IF;
  IF NOT v_billing   THEN v_outstanding := v_outstanding || 'billing_settled'; END IF;
  IF NOT v_submitted THEN v_outstanding := v_outstanding || 'onboarding_submitted'; END IF;
  IF NOT v_open      THEN v_outstanding := v_outstanding || 'not_already_closed'; END IF;
  IF NOT v_context   THEN v_outstanding := v_outstanding || 'missing_activation_context'; END IF;

  RETURN jsonb_build_object(
    'gates', jsonb_build_object(
      'engagement_letter_signed', v_el_signed,
      'aml_passed', v_aml,
      'billing_settled', v_billing,
      'onboarding_submitted', v_submitted,
      'not_already_closed', v_open,
      'activation_context_present', v_context
    ),
    'all_pass', (array_length(v_outstanding, 1) IS NULL),
    'outstanding', to_jsonb(v_outstanding)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_onboarding_gates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_onboarding_gates(uuid) TO authenticated, service_role;
```

- [ ] **Step 2: Static self-check**

Confirm: no INSERT/UPDATE/DELETE anywhere in the body; every gate uses a column proven to exist on `onboarding_applications` (`aml_status`, `billing_status`, `submitted_for_review_at`, `contracts_signed_at`, `status`, `client_id`, `company_id`, `application_type`, `quote_id`, `organization_id`); `all_pass` is true only when `outstanding` is empty.

- [ ] **Step 3: Live verification SQL (read-only; safe on real data)**

```sql
-- A fully-onboarded, not-yet-approved application should pass all gates:
SELECT public.lifecycle_onboarding_gates('<complete application id>');   -- all_pass=true, outstanding=[]
-- An incomplete application should list specific outstanding gates:
SELECT public.lifecycle_onboarding_gates('<incomplete application id>'); -- all_pass=false, outstanding=[...]
-- Already-approved application:
SELECT public.lifecycle_onboarding_gates('<approved application id>');   -- includes 'not_already_closed'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_<uuid>.sql
git commit -m "feat(sprint1): add shared read-only lifecycle_onboarding_gates() evaluator"
git fetch origin && git rebase origin/main && git push origin main
```

---

## Task 4: Flag-aware activation evaluator `lifecycle_evaluate_onboarding_activation()` (dormant)

**Files:**
- Create: `supabase/migrations/<ts>_<uuid>.sql`

**Interfaces:**
- Consumes: `is_canonical_lifecycle_enabled(uuid)` (Task 1), `lifecycle_onboarding_gates(uuid)` (Task 3), `lifecycle_approve_onboarding(uuid)` (existing), backstop indexes (Task 2).
- Produces: `public.lifecycle_evaluate_onboarding_activation(p_application_id uuid) RETURNS jsonb` with `mode ∈ {dry_run, activated, routed_to_review, noop_closed}`. **Called by nothing in Inc 1.**

**Design note (activation body):** rather than duplicate the 348-line approve body, the evaluator (a) ensures the active `accountant_client_link` exists (the one thing approve does NOT do), then (b) delegates entity/engagement/job/client_task/info-request/portal creation to the **existing, proven** `lifecycle_approve_onboarding`, which is already idempotent (lookup-before-insert) and sets the application to `approved`. This avoids a second copy of the activation logic in Inc 1. The link insert is guarded by the Task 2 unique indexes. **No deadlines are created.**

- [ ] **Step 1: Write the migration**

```sql
-- Sprint 1 Inc 1 / Task 4: flag-aware activation evaluator (DORMANT — nothing calls it yet)
CREATE OR REPLACE FUNCTION public.lifecycle_evaluate_onboarding_activation(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  a            public.onboarding_applications%ROWTYPE;
  v_flag       boolean;
  v_gates      jsonb;
  v_all_pass   boolean;
  v_approve    jsonb;
BEGIN
  SELECT * INTO a FROM public.onboarding_applications WHERE id = p_application_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Onboarding application not found: %', p_application_id;
  END IF;

  v_flag    := public.is_canonical_lifecycle_enabled(a.organization_id);
  v_gates   := public.lifecycle_onboarding_gates(p_application_id);
  v_all_pass := COALESCE((v_gates->>'all_pass')::boolean, false);

  -- Flag OFF: dry-run only. CREATE NOTHING.
  IF NOT v_flag THEN
    RETURN jsonb_build_object('mode', 'dry_run', 'flag', false,
                              'would_activate', v_all_pass, 'gates', v_gates);
  END IF;

  -- Already closed: no-op.
  IF a.status IN ('approved','rejected','cancelled') THEN
    RETURN jsonb_build_object('mode', 'noop_closed', 'status', a.status, 'gates', v_gates);
  END IF;

  -- Flag ON but gates fail: route to review, create nothing.
  IF NOT v_all_pass THEN
    UPDATE public.onboarding_applications
       SET status = 'for_review',
           review_feedback = COALESCE(review_feedback, '') ||
             CASE WHEN COALESCE(review_feedback,'') = '' THEN '' ELSE E'\n' END ||
             'Auto-evaluation outstanding gates: ' || (v_gates->>'outstanding'),
           updated_at = now()
     WHERE id = p_application_id;
    RETURN jsonb_build_object('mode', 'routed_to_review', 'gates', v_gates);
  END IF;

  -- Flag ON and all gates pass: ensure active link, then delegate activation.
  -- (1) accountant_client_link — the ONE output approve does not create.
  IF a.application_type = 'company' AND a.company_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accountant_client_links
      WHERE practice_id = a.organization_id AND company_id = a.company_id AND status = 'active'
    ) THEN
      INSERT INTO public.accountant_client_links (practice_id, company_id, status, initiated_by, activated_at)
      VALUES (a.organization_id, a.company_id, 'active', 'practice', now());
    END IF;
  ELSIF a.client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.accountant_client_links
      WHERE practice_id = a.organization_id AND client_id = a.client_id AND status = 'active'
    ) THEN
      INSERT INTO public.accountant_client_links (practice_id, client_id, status, initiated_by, activated_at)
      VALUES (a.organization_id, a.client_id, 'active', 'practice', now());
    END IF;
  END IF;
  -- NOTE: when client_id/company_id are NULL here, the entity is created by the
  -- delegated approve call below; Inc 2 moves link creation to run AFTER entity
  -- resolution. In Inc 1 this path is unreachable in practice (evaluator is
  -- dormant) and the missing_activation_context gate already requires a target.

  -- (2) entity + engagements + jobs + client_tasks + info-requests + portal — proven, idempotent.
  v_approve := public.lifecycle_approve_onboarding(p_application_id);

  RETURN jsonb_build_object('mode', 'activated', 'gates', v_gates, 'approve', v_approve);
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_evaluate_onboarding_activation(uuid) TO authenticated, service_role;
```

- [ ] **Step 2: Static self-check**

Confirm: with `v_flag=false` the function returns BEFORE any write; `routed_to_review` only UPDATEs status/feedback (no active rows); the link INSERT is lookup-guarded and matches the accept-RPC shape (`status='active'`, `initiator='practice'`); no `deadlines` INSERT anywhere; delegation to `lifecycle_approve_onboarding` is the only entity/engagement/job creation path. `review_feedback` is a real column on `onboarding_applications` (verify; if absent, fall back to writing into `rejection_reason`-style note column found in schema).

- [ ] **Step 3: Live verification — transaction-only (mutates nothing permanently)**

```sql
-- (a) Flag OFF dry-run: returns gate JSON, writes nothing
BEGIN;
SELECT public.lifecycle_evaluate_onboarding_activation('<any application id>');  -- mode=dry_run
ROLLBACK;

-- (b) Flag ON, INCOMPLETE application: routes to review, creates NO active rows
BEGIN;
UPDATE public.organizations SET canonical_lifecycle_enabled = true WHERE id = '<test org id>';
SELECT public.lifecycle_evaluate_onboarding_activation('<incomplete app in test org>'); -- mode=routed_to_review
SELECT status FROM public.onboarding_applications WHERE id = '<incomplete app in test org>'; -- for_review
SELECT count(*) FROM public.accountant_client_links
  WHERE practice_id = '<test org id>'
    AND (client_id = '<app client>' OR company_id = '<app company>')
    AND status = 'active' AND activated_at > now() - interval '1 minute';            -- expect 0
ROLLBACK;  -- discards the flag flip AND any writes
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_<uuid>.sql
git commit -m "feat(sprint1): add flag-aware lifecycle_evaluate_onboarding_activation() (dormant)"
git fetch origin && git rebase origin/main && git push origin main
```

---

## Task 5: Narrow flag-gated guard on `lifecycle_approve_onboarding`

**Files:**
- Create: `supabase/migrations/<ts>_<uuid>.sql` (re-deploys `lifecycle_approve_onboarding` = guard + verbatim `20260603180743` body)

**Interfaces:**
- Consumes: `is_canonical_lifecycle_enabled(uuid)`, `lifecycle_onboarding_gates(uuid)`.
- Produces: same `lifecycle_approve_onboarding(p_onboarding_id uuid) RETURNS jsonb` signature; behaviour unchanged when flag OFF.

- [ ] **Step 1: Write the migration**

Take the EXACT function text from `supabase/migrations/20260603180743_105cc69e-f025-4661-8acb-6232914e3b8d.sql` (lines 24–371) and insert ONLY the guard block immediately after the existing `IF v_onboarding.status = 'rejected' THEN … END IF;` (i.e. after line 65, before `v_aml_expiry_date := …`). Everything else stays byte-identical. The guard:

```sql
  -- Sprint 1: canonical-lifecycle guard. When this org has the flag ON, approval
  -- cannot activate unless all mandatory gates pass. Flag OFF = legacy behaviour.
  IF public.is_canonical_lifecycle_enabled(v_onboarding.organization_id) THEN
    DECLARE v_gates jsonb := public.lifecycle_onboarding_gates(p_onboarding_id);
    BEGIN
      IF NOT COALESCE((v_gates->>'all_pass')::boolean, false) THEN
        RAISE EXCEPTION 'Cannot approve onboarding %: outstanding gates %',
          p_onboarding_id, (v_gates->>'outstanding');
      END IF;
    END;
  END IF;
```

(Note: in plpgsql a mid-body `DECLARE` requires its own `BEGIN…END` sub-block, as written above.)

- [ ] **Step 2: Diff check (mandatory)**

```bash
# Confirm the ONLY difference vs the proven version is the inserted guard block.
diff <(sed -n '24,371p' supabase/migrations/20260603180743_105cc69e-f025-4661-8acb-6232914e3b8d.sql) \
     <(sed -n '/CREATE OR REPLACE FUNCTION public.lifecycle_approve_onboarding/,/^\$function\$;/p' supabase/migrations/<ts>_<uuid>.sql)
```
Expected: the diff shows ONLY the added guard block (and the `CREATE OR REPLACE` reapplication). No other line changed.

- [ ] **Step 3: Live verification SQL**

```sql
-- Flag OFF org: approval behaves exactly as before (activates a complete app).
SELECT public.lifecycle_approve_onboarding('<complete app in NON-flagged org>');  -- status approved, ids returned

-- Flag ON org, incomplete app: approval is blocked with the outstanding gates.
BEGIN;
UPDATE public.organizations SET canonical_lifecycle_enabled = true WHERE id = '<test org id>';
SELECT public.lifecycle_approve_onboarding('<incomplete app in test org>');  -- raises: outstanding gates [...]
ROLLBACK;

-- Flag ON org, complete app: approval proceeds.
BEGIN;
UPDATE public.organizations SET canonical_lifecycle_enabled = true WHERE id = '<test org id>';
SELECT public.lifecycle_approve_onboarding('<complete app in test org>');  -- approved
ROLLBACK;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_<uuid>.sql
git commit -m "feat(sprint1): flag-gated gate guard on lifecycle_approve_onboarding (body otherwise verbatim)"
git fetch origin && git rebase origin/main && git push origin main
```

---

## Increment-level live test plan (run after all 5 tasks applied, BEFORE enabling any org)

**Flag OFF (default) — prove no behaviour change:**
1. `SELECT canonical_lifecycle_enabled FROM organizations LIMIT 10;` → all `false`.
2. **UI:** in a real (non-flagged) practice, approve a completed onboarding application via the existing Onboarding screen → client/company activates, engagements + jobs + portal access appear exactly as before.
3. **UI:** accept a quote via the public `/q/:token` link → onboarding application is created and the flow proceeds exactly as today (accept is untouched in Inc 1).
4. Backstop indexes present (Task 2 Step 3 query) and apply log shows no dup WARNINGs (or the exact keys to resolve).
5. Dormant dry-run: `BEGIN; SELECT lifecycle_evaluate_onboarding_activation('<app id>'); ROLLBACK;` → `mode:dry_run`.

**Flag ON, single test org (transaction-only, ROLLBACK) — prove gating works without committing:**
6. Negative: incomplete app → `lifecycle_evaluate_onboarding_activation` returns `routed_to_review`, status becomes `for_review`, **zero** new active `accountant_client_links` / engagements / jobs (Task 4 Step 3b). ROLLBACK.
7. Guard: `lifecycle_approve_onboarding` on an incomplete app raises with the outstanding-gates list (Task 5 Step 3). ROLLBACK.

(Committed flag-ON activation for a real test org and the full 5-scenario matrix is Increment 5, after Increments 2–4 wire the evaluator into the live flow.)

---

## Self-Review

**Spec coverage:** flag + reader (Task 1 ↔ design §3); idempotency backstops null-safe + actionable (Task 2 ↔ §4, amendments 4/5/6); shared gates incl. `missing_activation_context` (Task 3 ↔ §2.1/2.2, amendment 2); flag-aware evaluator, dormant, links-not-deadlines (Task 4 ↔ §2, amendment 1 + confirmed scope); narrow flag-gated approve guard, body verbatim (Task 5 ↔ §6, amendment 3); rollback (§7 — per-org UPDATE + drop migration, noted in each task's reversibility); live tests incl. preflight + transaction-only negative gate (Increment test plan, amendment 7).

**Placeholder scan:** `<ts>_<uuid>` and `<… id>` are intentional per-task fill-ins (commands to generate them are given); all SQL bodies are complete. No TODO/TBD.

**Type consistency:** `lifecycle_onboarding_gates` returns `{gates, all_pass, outstanding}` and is consumed with `->>'all_pass'` / `->>'outstanding'` in Tasks 4 and 5 identically. Link insert columns match the accept-RPC (`practice_id, client_id|company_id, status, initiated_by, activated_at`). `is_canonical_lifecycle_enabled(uuid)` signature consistent across Tasks 1/4/5.

**Open risk flagged for execution:** Task 4 Step 2 and Task 3 require verifying `review_feedback` exists on `onboarding_applications` (types.ts listed it); if not, use the schema's actual review-note column. This is the one column to confirm at execution start.
