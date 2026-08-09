-- =====================================================================================
-- DEF-035 — five status literals that no CHECK constraint permits.
-- =====================================================================================
-- Every statement repaired here raises 23514 on EVERY call today, so each of these code
-- paths has never once succeeded. That is what makes the change behaviour-preserving in the
-- only sense that matters: **no statement that currently succeeds can behave differently
-- afterwards, because none of them currently succeeds.** These move code from always-fails
-- to works.
--
--   1  create_job_from_template      jobs.status       'not_started' -> 'blank'
--   2  create_job_from_template      jobs.priority     'medium'      -> 'normal'
--   3  create_job_from_template      job_tasks.status  'not_started' -> 'todo'
--   4  approve_filing_safe           filings.status    'approved_by_client' -> 'approved'
--   5  queue_filing_for_submission   filings.status    'queued'      -> the write is DELETED
--
-- WHY EACH REPLACEMENT IS THE ONLY DEFENSIBLE ONE.
--
--   1  `blank` has been the jobs.status DEFAULT since 20260408203205, and is the value all
--      seven application-code job creators write (job-template-engine, workflow-step-executor,
--      cosec-filing-service, auto-rollover-service, EmailJobTagger, workflow-tick, +1). The
--      vocabulary moved from a generic lifecycle to workflow stages in 20260217105419 and this
--      caller was never migrated. `blank` is the stage that means "created, not yet started".
--   2  `normal` is the priority every other creator writes. `medium` belongs to no vocabulary
--      in this schema; jobs_priority_check has permitted low/normal/high/critical since
--      20251126133923 and has never been altered.
--   3  `todo` is the job_tasks equivalent of the same "not yet started" concept, and is what
--      job-template-engine.ts:773 writes. job_tasks_status_check has never been altered.
--   4  `approved` is the canonical member of chk_filing_status. `approved_by_client` belongs
--      to chk_filings_status, a filing vocabulary DROPPED on 2026-06-20. Note BOTH occurrences
--      change: the UPDATE and the audit-log row that records the new value. Changing only the
--      UPDATE would leave the audit trail asserting a value that was never written — worse
--      than the original defect, because it would look correct.
--   5  Not a rename. Owner ruling 2026-08-09: queue and HMRC transport state belong on
--      filing_queue.status, never on the filing, because the HMRC layer must never own figures
--      of record. The function ALREADY inserts filing_queue with status 'queued' correctly;
--      the filings UPDATE was a duplicate of that fact in a column whose vocabulary forbids it.
--      Deleting it is the repair. This one has a visible consequence: because the illegal
--      UPDATE aborted the transaction, the filing_queue INSERT was rolled back with it — which
--      is why NO filing_queue row has ever existed and the CT submission pipeline has never
--      had work to find.
--
-- SCOPE. Three function bodies re-issued. No column, constraint, index, policy, trigger or
-- grant is altered. No data is modified. No vocabulary is widened — every replacement is a
-- value the relevant constraint already permits, which is checked below before and after.
--
-- AUTHORING METHOD. All three bodies were EXTRACTED from their defining migrations and edited
-- against asserted anchors; each substitution had to match an exact expected count or the
-- generator aborted. Nothing was retyped. (DEF-029 receipt rule.)
--
-- KNOWN LIMITATION. Bodies extracted from GIT, not LIVE. Two functions are already known to
-- exist on production in no migration (email_queue_dispatch, email_queue_wake), so git and
-- live are known to diverge. Before applying, the three live bodies must be diffed against
-- these; on any divergence this migration is redeclared rather than applied.
--
-- NOT IN SCOPE, deliberately. The CT poller recovery is a separate coherent change: the
-- pollers select filing_queue on `pending`, a value the constraint forbids, and the two edge
-- INSERTs additionally omit the NOT NULL snapshot_hash, write a non-existent `metadata`
-- column, use an illegal filing_type, and check no errors. Fixing one literal there without
-- the rest would leave the pipeline just as broken and look repaired.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §1  PRECONDITIONS — reproduce every defect before repairing it (Gate 6).
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_src text;
  v_fn  text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['create_job_from_template','approve_filing_safe',
                              'queue_filing_for_submission'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname = v_fn AND pronamespace = 'public'::regnamespace) THEN
      RAISE EXCEPTION 'DEF-035 precondition failed: public.% does not exist.', v_fn;
    END IF;
  END LOOP;

  -- Reproduce each defect. If a body no longer contains the bad literal it has been changed
  -- out of band and this repair was built against something that is no longer there.
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'create_job_from_template' AND pronamespace='public'::regnamespace LIMIT 1;
  IF v_src NOT LIKE '%not_started%' OR v_src NOT LIKE '%medium%' THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: create_job_from_template no longer writes not_started/medium — the live body is not the one this repair was built against.';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'approve_filing_safe' AND pronamespace='public'::regnamespace LIMIT 1;
  IF v_src NOT LIKE '%approved_by_client%' THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: approve_filing_safe no longer writes approved_by_client.';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname = 'queue_filing_for_submission' AND pronamespace='public'::regnamespace LIMIT 1;
  IF v_src NOT LIKE '%UPDATE public.filings%' THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: queue_filing_for_submission no longer updates filings — the duplicate status write this migration removes is already gone.';
  END IF;

  -- The replacement values must ALREADY be legal. This migration widens nothing, and asserting
  -- that is cheaper than discovering it in a post-assertion after four bodies have been
  -- rewritten.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='chk_jobs_status' AND conrelid='public.jobs'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%blank%') THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: jobs.status does not permit blank.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='jobs_priority_check' AND conrelid='public.jobs'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%normal%') THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: jobs.priority does not permit normal.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='job_tasks_status_check' AND conrelid='public.job_tasks'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%todo%') THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: job_tasks.status does not permit todo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='chk_filing_status' AND conrelid='public.filings'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%approved%') THEN
    RAISE EXCEPTION 'DEF-035 precondition failed: filings.status does not permit approved. Apply DEF-034 first.';
  END IF;

  RAISE NOTICE 'DEF-035 preconditions OK: all three functions present, all five defects reproduced, all four replacement values already legal.';
END $mig$;

-- -------------------------------------------------------------------------------------
-- §2  Re-issue the three bodies. Extracted and anchor-edited; only the literals changed.
-- -------------------------------------------------------------------------------------

-- ---- create_job_from_template ----------------------------------------------
CREATE OR REPLACE FUNCTION create_job_from_template(
  p_template_id uuid,
  p_organization_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_engagement_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_filing_deadline date DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template templates%ROWTYPE;
  v_template_content jsonb;
  v_job_id uuid;
  v_task record;
  v_task_id uuid;
  v_job_name text;
  v_workpaper_instance_id uuid;
  v_service services_catalog%ROWTYPE;
BEGIN
  -- Get template
  SELECT * INTO v_template FROM templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;
  
  v_template_content := v_template.content;
  
  -- Get service if provided
  IF p_service_id IS NOT NULL THEN
    SELECT * INTO v_service FROM services_catalog WHERE id = p_service_id;
  END IF;
  
  -- Determine job name
  v_job_name := COALESCE(p_name, v_template.name);
  
  -- Create the job
  INSERT INTO jobs (
    organization_id,
    client_id,
    company_id,
    engagement_id,
    service_id,
    name,
    status,
    priority,
    period_start,
    period_end,
    filing_deadline,
    source_template_id
  ) VALUES (
    p_organization_id,
    p_client_id,
    p_company_id,
    p_engagement_id,
    p_service_id,
    v_job_name,
    'blank', 'normal',
    p_period_start,
    p_period_end,
    p_filing_deadline,
    p_template_id
  ) RETURNING id INTO v_job_id;
  
  -- Create tasks from template
  IF v_template_content->'tasks' IS NOT NULL THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(v_template_content->'tasks')
    LOOP
      INSERT INTO job_tasks (
        job_id,
        organization_id,
        title,
        description,
        status,
        template_task_id,
        is_client_facing,
        relative_due_days,
        due_date,
        task_order
      ) VALUES (
        v_job_id,
        p_organization_id,
        v_task.value->>'name',
        v_task.value->>'description',
        'todo',
        v_task.value->>'id',
        COALESCE((v_task.value->>'isClientFacing')::boolean, false),
        (v_task.value->>'relativeDueDays')::integer,
        CASE 
          WHEN (v_task.value->>'relativeDueDays')::integer IS NOT NULL AND p_filing_deadline IS NOT NULL
          THEN p_filing_deadline - ((v_task.value->>'relativeDueDays')::integer || ' days')::interval
          ELSE NULL
        END,
        (v_task.value->>'order')::integer
      );
    END LOOP;
  END IF;
  
  -- Create workpaper if service has workpaper template
  IF v_service.workpaper_template_id IS NOT NULL THEN
    INSERT INTO workpaper_instances (
      organization_id,
      template_id,
      job_id,
      client_id,
      company_id,
      status,
      field_values
    ) VALUES (
      p_organization_id,
      v_service.workpaper_template_id,
      v_job_id,
      p_client_id,
      p_company_id,
      'draft',
      '{}'::jsonb
    ) RETURNING id INTO v_workpaper_instance_id;
    
    -- Link workpaper to job
    UPDATE jobs SET workpaper_instance_id = v_workpaper_instance_id WHERE id = v_job_id;
  END IF;
  
  -- Log audit
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_organization_id,
    'job',
    v_job_id,
    'created_from_template',
    jsonb_build_object('template_id', p_template_id, 'template_name', v_template.name)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'workpaper_instance_id', v_workpaper_instance_id
  );
END;
$$;

-- ---- approve_filing_safe ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_filing_safe(
  p_filing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filing record;
BEGIN
  -- Fetch filing
  SELECT * INTO v_filing FROM filings WHERE id = p_filing_id;
  
  IF v_filing.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Filing not found');
  END IF;
  
  -- Check permission
  IF NOT can_approve_filings(auth.uid(), v_filing.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only managers and above can approve filings');
  END IF;
  
  -- Update filing
  UPDATE filings SET 
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now()
  WHERE id = p_filing_id;
  
  -- Write audit log
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
  VALUES (v_filing.organization_id, 'filing', p_filing_id, 'approve', 'status', v_filing.status, 'approved', auth.uid());
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---- queue_filing_for_submission -------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_filing_for_submission(
  p_filing_id UUID,
  p_filing_type TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_validation JSONB;
  v_filing RECORD;
  v_snapshot_hash TEXT;
  v_idempotency_key TEXT;
  v_queue_id UUID;
  v_existing_queue RECORD;
BEGIN
  -- Validate first
  v_validation := public.validate_filing_submission(p_filing_id, p_filing_type, p_user_id);
  
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN v_validation;
  END IF;
  
  -- Get filing and snapshot hash
  SELECT * INTO v_filing FROM public.filings WHERE id = p_filing_id;
  
  IF p_filing_type = 'ACCOUNTS_CH' THEN
    SELECT snapshot_hash INTO v_snapshot_hash 
    FROM public.accounts_model_snapshots WHERE id = v_filing.accounts_snapshot_id;
  ELSE
    SELECT snapshot_hash INTO v_snapshot_hash 
    FROM public.ct_computation_snapshots WHERE id = v_filing.ct_snapshot_id;
  END IF;
  
  -- Generate idempotency key
  v_idempotency_key := v_filing.organization_id || ':' || p_filing_type || ':' || 
    COALESCE(v_filing.company_id::text, v_filing.client_id::text) || ':' ||
    v_filing.period_start || ':' || v_filing.period_end || ':' || v_snapshot_hash;
  
  -- Check for existing queue entry
  SELECT * INTO v_existing_queue 
  FROM public.filing_queue 
  WHERE idempotency_key = v_idempotency_key AND status NOT IN ('failed', 'cancelled');
  
  IF v_existing_queue.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', ARRAY['Filing already queued or submitted with this snapshot'],
      'existing_queue_id', v_existing_queue.id
    );
  END IF;
  
  -- Insert queue entry
  INSERT INTO public.filing_queue (
    organization_id, filing_id, filing_type, idempotency_key, snapshot_hash, 
    approval_id, status
  )
  VALUES (
    v_filing.organization_id, p_filing_id, p_filing_type, v_idempotency_key, 
    v_snapshot_hash, (v_validation->>'approval_id')::uuid, 'queued'
  )
  RETURNING id INTO v_queue_id;
  
  -- Update filing status
  -- DEF-035: the `filings.status = 'queued'` UPDATE that stood here has been REMOVED.
  -- `queued` is not in chk_filing_status, so this statement raised 23514 on every call and
  -- rolled back the whole function, including the filing_queue INSERT above — which is why
  -- no queue row has ever existed. Owner ruling 2026-08-09: queue and HMRC transport state
  -- live on filing_queue.status, never on the filing. The queue row already records it.
  
  RETURN jsonb_build_object(
    'valid', true,
    'queue_id', v_queue_id,
    'idempotency_key', v_idempotency_key
  );
END;
$$;


-- -------------------------------------------------------------------------------------
-- §3  POST-ASSERTIONS — self-verifying. A partial apply aborts the whole transaction.
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_src text;
  v_fn  text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['create_job_from_template','approve_filing_safe',
                              'queue_filing_for_submission'] LOOP
    SELECT prosrc INTO v_src FROM pg_proc
    WHERE proname = v_fn AND pronamespace = 'public'::regnamespace LIMIT 1;
    IF v_src IS NULL THEN
      RAISE EXCEPTION 'DEF-035 post-assert failed: public.% is absent after the re-issue.', v_fn;
    END IF;
    IF (SELECT count(*) FROM pg_proc
        WHERE proname = v_fn AND pronamespace='public'::regnamespace) <> 1 THEN
      RAISE EXCEPTION 'DEF-035 post-assert failed: public.% has more than one signature (the DEF-002 failure mode).', v_fn;
    END IF;
  END LOOP;

  -- 1/2/3 — create_job_from_template
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname='create_job_from_template' AND pronamespace='public'::regnamespace LIMIT 1;
  IF v_src LIKE '%not_started%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: create_job_from_template still writes not_started.';
  END IF;
  IF v_src LIKE '%''medium''%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: create_job_from_template still writes priority medium.';
  END IF;
  IF v_src NOT LIKE '%''blank''%' OR v_src NOT LIKE '%''normal''%' OR v_src NOT LIKE '%''todo''%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: create_job_from_template does not write blank/normal/todo.';
  END IF;
  -- Repaired, not truncated: it must still create both a job and its tasks.
  IF v_src NOT LIKE '%INSERT INTO jobs%' AND v_src NOT LIKE '%INSERT INTO public.jobs%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: create_job_from_template lost its jobs INSERT.';
  END IF;
  IF v_src NOT LIKE '%job_tasks%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: create_job_from_template lost its job_tasks INSERT.';
  END IF;

  -- 4 — approve_filing_safe. BOTH the UPDATE and the audit row must have moved.
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname='approve_filing_safe' AND pronamespace='public'::regnamespace LIMIT 1;
  IF v_src LIKE '%approved_by_client%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: approve_filing_safe still writes approved_by_client.';
  END IF;
  IF v_src NOT LIKE '%''approved''%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: approve_filing_safe does not write approved.';
  END IF;
  IF v_src NOT LIKE '%UPDATE public.filings%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: approve_filing_safe lost its filings UPDATE entirely.';
  END IF;

  -- 5 — queue_filing_for_submission. The filings UPDATE is gone; the queue INSERT survives.
  SELECT prosrc INTO v_src FROM pg_proc
  WHERE proname='queue_filing_for_submission' AND pronamespace='public'::regnamespace LIMIT 1;
  IF v_src LIKE '%UPDATE public.filings%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: queue_filing_for_submission still updates filings.status. Queue and transport state belong on filing_queue.';
  END IF;
  IF v_src NOT LIKE '%INSERT INTO public.filing_queue%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: queue_filing_for_submission lost its filing_queue INSERT — the one statement it exists to perform.';
  END IF;
  IF v_src NOT LIKE '%''queued''%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: queue_filing_for_submission no longer enqueues with status queued.';
  END IF;
  -- Idempotency is the whole point of that function; a truncated re-issue could lose it.
  IF v_src NOT LIKE '%idempotency_key%' THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: queue_filing_for_submission lost its idempotency key.';
  END IF;

  -- Nothing was widened. Every constraint this migration relies on must be untouched.
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname='chk_jobs_status' AND conrelid='public.jobs'::regclass
               AND pg_get_constraintdef(oid) LIKE '%not_started%') THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: chk_jobs_status was widened to admit not_started. The repair was to the caller, never to the vocabulary.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname='jobs_priority_check' AND conrelid='public.jobs'::regclass
               AND pg_get_constraintdef(oid) LIKE '%medium%') THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: jobs_priority_check was widened to admit medium.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname='chk_filing_status' AND conrelid='public.filings'::regclass
               AND pg_get_constraintdef(oid) LIKE '%approved_by_client%') THEN
    RAISE EXCEPTION 'DEF-035 post-assert failed: chk_filing_status was widened to admit approved_by_client.';
  END IF;

  RAISE NOTICE 'DEF-035 post-assertions passed: 3 bodies repaired, 5 literals corrected, 0 vocabularies widened.';
END $mig$;

COMMIT;
