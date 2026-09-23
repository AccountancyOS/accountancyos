-- =====================================================================================
-- DEF-034 — vocabulary alignment. Retire two superseded CHECK constraints and repair the
-- three status literals that no constraint permits.
-- =====================================================================================
-- THE DEFECT CLASS. A column may carry several live CHECK constraints. Postgres enforces
-- every one of them, so the writable set is their INTERSECTION. Twice in this schema a new
-- vocabulary was added without retiring the old one, leaving states that are declared,
-- referenced by application code, and impossible to write.
--
--   `filings.status`   — `valid_status` (2025-11-27, 6 values) survived alongside
--     `chk_filing_status` (2026-06-20, 13 values). Seven states are unwritable, including
--     `submitted`. A filing cannot be recorded as submitted. `chk_filing_status` matches
--     both the `FilingStatus` TypeScript union and the hand registry, so `valid_status` is
--     the leftover. Owner ruling 2026-08-09: drop `valid_status`.
--
--   `deadlines.status` — `deadlines_status_check` (2025-11-27) survived alongside
--     `chk_deadlines_status` (2025-12-18). Only `pending`, `overdue` and `cancelled` are
--     writable, so a deadline cannot be marked `completed` or `in_progress`. Here the NEWER
--     constraint is the leftover: application code, the TypeScript types and the hand
--     registry all use the older vocabulary. Owner ruling 2026-08-09: drop
--     `chk_deadlines_status`, canonical = pending, in_progress, completed, filed, overdue,
--     cancelled.
--
-- BOTH DROPS ARE PROVABLY SAFE, and this is worth stating rather than assuming. Every
-- existing row currently satisfies BOTH constraints on its column — that is what "both are
-- enforced" means — so every row is already inside the intersection, and the intersection is
-- a subset of whichever constraint remains. Dropping a constraint cannot invalidate a row
-- that already satisfied the survivor. §1 asserts this rather than trusting the argument.
--
-- THE LITERAL REPAIRS. Three writes name values that no constraint permits, so every call
-- raises 23514:
--
--   `lifecycle_accept_portal_invitation`   portal_access.status  'revoked_by_system' -> 'revoked'
--   `lifecycle_generate_deadlines_for_job` client_tasks.status   'pending'  -> 'not_started'
--                                          client_tasks.visibility 'internal' -> 'internal_only'
--                                          deadlines.status      'open'     -> 'pending'
--
-- These are renames onto the vocabulary that already exists. No constraint is widened to
-- accommodate a caller, because widening a vocabulary to fit a typo is how the two
-- contradictions above came to exist.
--
-- HOW THIS WAS FOUND. Not by execution. `scripts/generate-db-vocabulary.py` derives the
-- writable set for all 196 constrained columns from the migrations, and
-- `scripts/audit-check-violations.py` checks every live function body against it. Both are
-- enforced by `src/test/regression/vocabulary-registry.test.ts`, so this class now fails the
-- build rather than surfacing one defect per fix-cycle in production.
--
-- DELIBERATELY NOT IN SCOPE.
--
--   `on_cgt_disposal_date_changed` is broken in four ways, not one, and only one is a
--     rename. It writes `deadlines.title` (the column is `name`), `deadline_type = 'filing'`
--     (allowed: custom, internal, statutory) and `status = 'upcoming'` (not in the canonical
--     set) — but before any of those it specifies
--     `ON CONFLICT (organization_id, client_id, service_code, deadline_type)`, and NO unique
--     index on `deadlines` exists anywhere in the migration history, so the statement raises
--     42P10 first. Adding that index would also assert a client may hold only one CGT
--     deadline ever, which is wrong: disposals span tax years and each carries its own
--     60-day deadline. The conflict target is a design error, not a typo. Held for a ruling.
--
--   `approve_filing_safe`, `queue_filing_for_submission` and `regress_filing_status` write
--     `approved_by_client`, `queued` and `ready_for_approval`. Dropping `valid_status` does
--     NOT legalise these — they belong to `chk_filings_status`, a THIRD filing vocabulary
--     dropped on 2026-06-20. `queued` in particular likely belongs on `filing_queue.status`,
--     since writing submission state onto the filing record conflates the projection with
--     the HMRC transport layer. Held for a ruling.
--
--   The job-workflow literals (`create_job_from_template`, `process_questionnaire_submission`,
--     `lifecycle_generate_jobs_for_service`) map a retired generic lifecycle onto workflow
--     stages. Which stage each state becomes is a workflow decision. Held for a ruling.
--
-- SCOPE. Two constraints dropped, two function bodies re-issued. No column is added or
-- removed, no constraint is widened, no data is modified.
--
-- AUTHORING METHOD. Both bodies were EXTRACTED from their defining migrations and edited
-- programmatically against asserted anchors — each substitution had to match exactly once or
-- the generator aborted. Nothing was retyped. (DEF-029 receipt rule.)
--
-- KNOWN LIMITATION. The bodies were extracted from GIT, not from LIVE. Two functions have
-- already been found on production that exist in no migration (`email_queue_dispatch`,
-- `email_queue_wake`), so git and live are known to diverge. Before this is applied, the two
-- live bodies must be diffed against the two here; if either differs, this migration is
-- redeclared rather than applied.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  PRECONDITIONS — reproduce the defect before repairing it (Gate 6).
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_bad  bigint;
  v_fn   text;
  v_src  text;
BEGIN
  -- The constraints to retire must actually be present. If they are already gone this has
  -- been applied or superseded, and re-issuing two bodies would be unjustified churn.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valid_status' AND conrelid = 'public.filings'::regclass
  ) THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: filings.valid_status is already absent — refusing to re-apply.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_deadlines_status' AND conrelid = 'public.deadlines'::regclass
  ) THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: deadlines.chk_deadlines_status is already absent — refusing to re-apply.';
  END IF;

  -- The constraints that must SURVIVE must be present, or the drop would leave the column
  -- unconstrained rather than correctly constrained.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_filing_status' AND conrelid = 'public.filings'::regclass
  ) THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: chk_filing_status is missing. Dropping valid_status would leave filings.status unconstrained.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deadlines_status_check' AND conrelid = 'public.deadlines'::regclass
  ) THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: deadlines_status_check is missing. Dropping chk_deadlines_status would leave deadlines.status unconstrained.';
  END IF;

  -- Assert the safety argument instead of trusting it: no surviving row may violate the
  -- constraint that remains. This should be impossible, which is exactly why it is cheap
  -- to check and expensive to assume.
  SELECT count(*) INTO v_bad FROM public.filings
  WHERE status IS NOT NULL
    AND status NOT IN ('accepted','approved','awaiting_approval','client_changes_requested',
                       'draft','filed','in_progress','not_started','ready_for_review',
                       'ready_to_file','rejected','sent_to_client','submitted');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: % filings row(s) hold a status outside chk_filing_status.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM public.deadlines
  WHERE status IS NOT NULL
    AND status NOT IN ('pending','in_progress','completed','filed','overdue','cancelled');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: % deadlines row(s) hold a status outside deadlines_status_check. Dropping chk_deadlines_status would expose them.', v_bad;
  END IF;

  -- Reproduce: both functions must exist and must still contain the forbidden literals.
  FOREACH v_fn IN ARRAY ARRAY['lifecycle_accept_portal_invitation',
                              'lifecycle_generate_deadlines_for_job'] LOOP
    SELECT prosrc INTO v_src FROM pg_proc
    WHERE proname = v_fn AND pronamespace = 'public'::regnamespace LIMIT 1;
    IF v_src IS NULL THEN
      RAISE EXCEPTION 'DEF-034 precondition failed: function public.% does not exist.', v_fn;
    END IF;
  END LOOP;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'lifecycle_accept_portal_invitation'
    AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_src NOT LIKE '%revoked_by_system%' THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: lifecycle_accept_portal_invitation no longer writes revoked_by_system — the live body is not the one this repair was built against.';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'lifecycle_generate_deadlines_for_job'
    AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_src NOT LIKE '%''open''%' THEN
    RAISE EXCEPTION 'DEF-034 precondition failed: lifecycle_generate_deadlines_for_job no longer writes deadlines.status = ''open'' — the live body is not the one this repair was built against.';
  END IF;

  RAISE NOTICE 'DEF-034 preconditions OK: both superseded constraints present, both survivors present, no row would be orphaned, both defects reproduced.';
END $mig$;

-- -------------------------------------------------------------------------------------
-- §2  Retire the superseded constraints.
-- -------------------------------------------------------------------------------------
-- The rule this enforces going forward: a migration that replaces a CHECK constraint MUST
-- drop the one it replaces, in the same migration. Both contradictions repaired here came
-- from not doing that.

ALTER TABLE public.filings   DROP CONSTRAINT valid_status;
ALTER TABLE public.deadlines DROP CONSTRAINT chk_deadlines_status;

-- -------------------------------------------------------------------------------------
-- §3  Re-issue the two bodies. Extracted and anchor-edited; only the literals changed.
-- -------------------------------------------------------------------------------------

-- ---- lifecycle_accept_portal_invitation ------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_accept_portal_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current_user_id uuid;
  v_portal_access record;
  v_entity_type text;
  v_entity_id uuid;
BEGIN
  -- Validate authentication
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
  END IF;

  -- Look up portal_access by token
  SELECT * INTO v_portal_access
  FROM portal_access
  WHERE invite_token = p_token
    AND status = 'invited'
    AND (invite_expires_at IS NULL OR invite_expires_at > now());

  -- If not found or expired
  IF v_portal_access.id IS NULL THEN
    -- Check if expired
    IF EXISTS (
      SELECT 1 FROM portal_access
      WHERE invite_token = p_token
        AND status = 'invited'
        AND invite_expires_at IS NOT NULL
        AND invite_expires_at <= now()
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'expired');
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;
  END IF;

  -- Validate no user_id conflict (prevent invite hijacking)
  IF v_portal_access.user_id IS NOT NULL AND v_portal_access.user_id != v_current_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'user_mismatch');
  END IF;

  -- Determine entity type and ID
  IF v_portal_access.client_id IS NOT NULL THEN
    v_entity_type := 'client';
    v_entity_id := v_portal_access.client_id;
  ELSIF v_portal_access.company_id IS NOT NULL THEN
    v_entity_type := 'company';
    v_entity_id := v_portal_access.company_id;
  END IF;

  -- Deactivate any duplicate active invites for this user + entity
  UPDATE portal_access
  SET 
    status = 'revoked',
    is_active = false,
    updated_at = now()
  WHERE user_id = v_current_user_id
    AND (
      (client_id = v_portal_access.client_id AND client_id IS NOT NULL) OR
      (company_id = v_portal_access.company_id AND company_id IS NOT NULL)
    )
    AND id != v_portal_access.id
    AND is_active = true;

  -- Update portal_access to active
  UPDATE portal_access
  SET
    user_id = v_current_user_id,
    status = 'active',
    is_active = true,
    accepted_at = now(),
    invite_token = NULL,
    invite_expires_at = NULL,
    updated_at = now()
  WHERE id = v_portal_access.id;

  -- Write to audit_log
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    metadata
  ) VALUES (
    v_portal_access.organization_id,
    'portal_access',
    v_portal_access.id,
    'accepted',
    v_current_user_id,
    jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id', v_entity_id,
      'role', v_portal_access.role
    )
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'portal_access_id', v_portal_access.id,
    'entity_type', v_entity_type,
    'entity_id', v_entity_id,
    'organization_id', v_portal_access.organization_id,
    'status', 'active'
  );
END;
$$;

-- ---- lifecycle_generate_deadlines_for_job ----------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_generate_deadlines_for_job(
  p_job_id uuid,
  p_facts  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job       RECORD;
  v_rule      RECORD;
  v_calc      jsonb;
  v_due       date;
  v_missing   text[];
  v_fact      text;
  v_created   int := 0;
  v_skipped   int := 0;
  v_missing_facts_logged int := 0;
  v_existing  uuid;
  v_results   jsonb := '[]'::jsonb;
  v_tax_year_end date;
  v_after_tax  boolean;
  v_fixed_txt  text;
  v_existing_dl record;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;

  IF NOT public._canonical_caller_in_org(v_job.organization_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT public._canonical_spine_enabled(v_job.organization_id) THEN
    RETURN jsonb_build_object('status','skipped','reason','canonical_spine_v1 flag disabled');
  END IF;

  IF v_job.job_template_code IS NULL OR v_job.canonical_service_code IS NULL THEN
    RAISE EXCEPTION 'Job % is not mapped to a canonical job template', p_job_id;
  END IF;

  FOR v_rule IN
    SELECT * FROM public.canonical_deadline_rules
     WHERE active = true
       AND (job_template_code = v_job.job_template_code
            OR (job_template_code IS NULL AND canonical_service_code = v_job.canonical_service_code))
  LOOP
    v_calc := v_rule.calculation_method;
    v_due := NULL;
    v_missing := ARRAY[]::text[];

    -- Check required_facts presence in p_facts JSON
    IF v_rule.required_facts IS NOT NULL THEN
      FOREACH v_fact IN ARRAY v_rule.required_facts
      LOOP
        -- skip "fact" entries that actually reference another deadline_code we may have just made
        IF p_facts ? v_fact THEN
          CONTINUE;
        END IF;
        -- internal cross-deadline references are resolved later; not blocking
        IF v_fact IN ('companies_house_accounts_filing','ct600_filing','partnership_tax_return_filing') THEN
          CONTINUE;
        END IF;
        v_missing := v_missing || v_fact;
      END LOOP;
    END IF;

    IF array_length(v_missing, 1) > 0 THEN
      -- create a client_task as a missing-fact placeholder (idempotent on title+job)
      IF NOT EXISTS (
        SELECT 1 FROM public.client_tasks
         WHERE job_id = p_job_id
           AND title = 'Missing data: ' || v_rule.deadline_name
      ) THEN
        INSERT INTO public.client_tasks (
          organization_id, client_id, company_id, job_id,
          title, description, status, visibility
        ) VALUES (
          v_job.organization_id, v_job.client_id, v_job.company_id, p_job_id,
          'Missing data: ' || v_rule.deadline_name,
          'Cannot compute "' || v_rule.deadline_name || '" — missing fact(s): '
            || array_to_string(v_missing, ', '),
          'not_started', 'internal_only'
        );
        v_missing_facts_logged := v_missing_facts_logged + 1;
      END IF;
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code,
        'action', 'missing_facts',
        'missing', v_missing
      );
      CONTINUE;
    END IF;

    -- Compute due_date from calculation_method (covers the common shapes)
    IF v_calc ? 'add_months_to' THEN
      v_due := ((p_facts->>(v_calc->>'add_months_to'))::date
                + ((v_calc->>'months')::int || ' months')::interval)::date;
    ELSIF v_calc ? 'add_to' THEN
      v_due := ((p_facts->>(v_calc->>'add_to'))::date
                + ((COALESCE(v_calc->>'months','0'))::int || ' months')::interval
                + ((COALESCE(v_calc->>'days','0'))::int || ' days')::interval)::date;
    ELSIF v_calc ? 'fixed_date' AND COALESCE((v_calc->>'after_tax_year')::boolean, false) THEN
      -- tax year of form '2024/25' → year-end 5 April 2025 → due = fixed_date in calendar year after tax_year_end
      v_tax_year_end := (
        SELECT (split_part(p_facts->>'tax_year','/',1)::int + 1)::text || '-04-05'
      )::date;
      v_fixed_txt := v_calc->>'fixed_date';
      v_due := to_date(v_fixed_txt || ' ' || (extract(year FROM v_tax_year_end)::int + 1)::text, 'DD Month YYYY');
    ELSIF v_calc ? 'offset_days_before' THEN
      -- Resolve against a previously created deadline by deadline_code on this job
      SELECT due_date INTO v_due FROM public.deadlines
       WHERE job_id = p_job_id AND deadline_code = (v_calc->>'offset_days_before')
       ORDER BY created_at DESC LIMIT 1;
      IF v_due IS NOT NULL THEN
        v_due := v_due - ((v_calc->>'default_days')::int);
      END IF;
    END IF;

    IF v_due IS NULL THEN
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code,
        'action', 'unsupported_calculation'
      );
      CONTINUE;
    END IF;

    -- Idempotent upsert keyed on (job_id, deadline_code)
    SELECT id INTO v_existing FROM public.deadlines
     WHERE job_id = p_job_id AND deadline_code = v_rule.deadline_code
     LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.deadlines (
        organization_id, client_id, company_id, engagement_id, job_id,
        name, deadline_type, service_code, canonical_service_code, deadline_code,
        due_date, status
      ) VALUES (
        v_job.organization_id, v_job.client_id, v_job.company_id, NULL, p_job_id,
        v_rule.deadline_name, v_rule.deadline_type, v_job.canonical_service_code,
        v_job.canonical_service_code, v_rule.deadline_code,
        v_due, 'pending'
      );
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code, 'due_date', v_due, 'action', 'created'
      );
    ELSE
      UPDATE public.deadlines
         SET due_date = v_due, updated_at = now()
       WHERE id = v_existing AND status NOT IN ('completed','filed');
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'deadline_code', v_rule.deadline_code, 'due_date', v_due, 'action', 'updated'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','ok',
    'job_id', p_job_id,
    'deadlines_created', v_created,
    'deadlines_updated', v_skipped,
    'missing_fact_tasks', v_missing_facts_logged,
    'results', v_results
  );
END;
$$;


-- -------------------------------------------------------------------------------------
-- §4  POST-ASSERTIONS — self-verifying. A partial apply aborts the whole transaction.
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_src text;
  v_fn  text;
BEGIN
  -- The superseded constraints are gone.
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'valid_status' AND conrelid = 'public.filings'::regclass) THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: filings.valid_status still exists.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'chk_deadlines_status' AND conrelid = 'public.deadlines'::regclass) THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: deadlines.chk_deadlines_status still exists.';
  END IF;

  -- The survivors are still there. Dropping the wrong one, or both, would leave the column
  -- unconstrained — strictly worse than the contradiction this migration repairs.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'chk_filing_status' AND conrelid = 'public.filings'::regclass) THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: chk_filing_status is gone — filings.status is now unconstrained.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'deadlines_status_check' AND conrelid = 'public.deadlines'::regclass) THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: deadlines_status_check is gone — deadlines.status is now unconstrained.';
  END IF;

  -- Exactly one CHECK constraint governs each repaired column. More than one is how this
  -- defect was born, so assert the count, not merely the absence of the two we dropped.
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.filings'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%') <> 1 THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: filings.status is governed by % CHECK constraints, expected exactly 1.',
      (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.filings'::regclass
        AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%');
  END IF;

  -- The states the drop was for are now genuinely writable. Asserting the constraint is
  -- absent is not the same as asserting the state can be written.
  IF NOT (SELECT pg_get_constraintdef(oid) LIKE '%submitted%' FROM pg_constraint
          WHERE conname = 'chk_filing_status' AND conrelid = 'public.filings'::regclass) THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: filings.status still cannot be set to submitted.';
  END IF;
  IF NOT (SELECT pg_get_constraintdef(oid) LIKE '%completed%' FROM pg_constraint
          WHERE conname = 'deadlines_status_check' AND conrelid = 'public.deadlines'::regclass) THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: deadlines.status still cannot be set to completed.';
  END IF;

  -- Both bodies were repaired, and repaired rather than truncated.
  FOREACH v_fn IN ARRAY ARRAY['lifecycle_accept_portal_invitation',
                              'lifecycle_generate_deadlines_for_job'] LOOP
    SELECT prosrc INTO v_src FROM pg_proc
    WHERE proname = v_fn AND pronamespace = 'public'::regnamespace LIMIT 1;
    IF v_src IS NULL THEN
      RAISE EXCEPTION 'DEF-034 post-assert failed: public.% is absent after the re-issue.', v_fn;
    END IF;
    IF (SELECT count(*) FROM pg_proc
        WHERE proname = v_fn AND pronamespace = 'public'::regnamespace) <> 1 THEN
      RAISE EXCEPTION 'DEF-034 post-assert failed: public.% has more than one signature (the DEF-002 failure mode).', v_fn;
    END IF;
  END LOOP;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'lifecycle_accept_portal_invitation'
    AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_src LIKE '%revoked_by_system%' THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: lifecycle_accept_portal_invitation still writes revoked_by_system.';
  END IF;
  IF v_src NOT LIKE '%portal_access%' THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: lifecycle_accept_portal_invitation lost its portal_access write entirely.';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'lifecycle_generate_deadlines_for_job'
    AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_src LIKE '%''open''%' THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: lifecycle_generate_deadlines_for_job still writes deadlines.status = ''open''.';
  END IF;
  IF v_src NOT LIKE '%internal_only%' THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: lifecycle_generate_deadlines_for_job does not write client_tasks.visibility = internal_only.';
  END IF;
  IF v_src NOT LIKE '%not_started%' THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: lifecycle_generate_deadlines_for_job does not write client_tasks.status = not_started.';
  END IF;
  IF v_src NOT LIKE '%deadlines%' THEN
    RAISE EXCEPTION 'DEF-034 post-assert failed: lifecycle_generate_deadlines_for_job lost its deadlines write entirely.';
  END IF;

  RAISE NOTICE 'DEF-034 post-assertions passed: 2 superseded constraints retired, 2 bodies repaired, 3 literals corrected.';
END $mig$;

COMMIT;
