-- 001 — email_queue vocabulary reconciliation and sender classification
--
-- LONDON ONLY. Do not place this file in supabase/migrations/ — see ../london-increments/README.md.
-- Apply with: apply_migration, name `london_inc_001_email_vocabulary_and_sender_classification`.
--
-- ============================================================================
-- WHY
-- ============================================================================
--
-- Two independent vocabularies on public.email_queue had drifted away from the constraints that
-- police them, and the drift was silent because it broke the writers rather than the readers.
--
-- 1. STATUS. email_queue_status_check permits only pending|sent|failed|cancelled. But
--    queue_email_safe wrote 'draft'/'queued', trigger_records_request(uuid) wrote 'queued', and
--    acknowledge_failed_email_safe wrote 'ignored'. Every one of those statements raised 23514 and
--    rolled back its whole transaction. Consequences, all of them live:
--      - Compose Email was completely non-functional. All three modes route through
--        queue_email_safe, and both branches of its CASE were invalid values.
--      - trigger_records_request(uuid) — the overload the app actually calls — threw after
--        creating the questionnaire instance, linking it to the job and stamping
--        jobs.info_requested_at, so all of that rolled back too.
--      - The 'dismiss this failure' action failed.
--    email_queue holding zero rows is the visible symptom.
--
--    The fix is to collapse the synonyms into the canonical four, NOT to widen the constraint.
--    Widening would convert three loud 23514 errors into three silent never-drains, because the
--    drainer picks up on `.eq('status','pending')` — rows carrying 'queued' or 'draft' would
--    persist and then sit in the queue forever, invisible. Loud beats silent. This also matches
--    the repo's own drift registry, which already lists 'queued' and 'draft' as retired
--    (src/test/regression/vocabulary-drift.test.ts).
--
--    'queued' is a redundant synonym of 'pending' — scheduling is carried by scheduled_at, and a
--    second encoding of the same fact in status is duplication.
--    'ignored' is a redundant synonym of 'cancelled' — the fact that a human dismissed it is
--    already carried by acknowledged_at/acknowledged_by, which the same UPDATE sets.
--    'draft' is the one genuinely distinct state, and it is expressed as
--    status='pending' AND scheduled_at IS NULL. The drainer's `.lte('scheduled_at', now)` never
--    matches NULL, so an unscheduled row is structurally unsendable. No fifth status is needed.
--
-- 2. CONTEXT. email_queue_context_check permits quote|onboarding|engagement|job|invoice|system|
--    general, and process-email-queue routes on it: context='system' goes out through Postmark as
--    AccountancyOS; everything else, INCLUDING NULL, goes through the practice's connected mailbox
--    and is HELD if there is none. So an unclassified sender does not fail — it queues an email
--    that will never send. Several senders set no context at all, and one set a value
--    ('records_request') that is not in the constraint at all.
--
--    Classification follows the owner's rule: any email addressed to a practice's client or
--    external contact, or presented as correspondence from the practice, goes through the
--    practice's mailbox. Only AccountancyOS's own platform mail to practice staff is 'system'.
--
-- Both constraints are asserted below before anything is changed, so if either has been widened
-- out of band this migration refuses rather than encoding a stale assumption.
--
-- Idempotent: re-running is a no-op for anything already corrected. Every text edit asserts its
-- anchor matches exactly once and raises otherwise, so a body that has moved on fails loudly
-- instead of being silently half-edited.

BEGIN;

-- ============================================================================
-- PRECONDITIONS
-- ============================================================================

DO $pre$
DECLARE
  v_status_def text;
  v_context_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_status_def
    FROM pg_constraint WHERE conname = 'email_queue_status_check'
     AND conrelid = 'public.email_queue'::regclass;
  IF v_status_def IS NULL THEN
    RAISE EXCEPTION '001: email_queue_status_check is missing; refusing to reconcile a vocabulary with no constraint to reconcile it against';
  END IF;
  IF v_status_def NOT LIKE '%''pending''%' OR v_status_def NOT LIKE '%''sent''%'
     OR v_status_def NOT LIKE '%''failed''%' OR v_status_def NOT LIKE '%''cancelled''%' THEN
    RAISE EXCEPTION '001: email_queue_status_check is not the expected four-value set: %', v_status_def;
  END IF;
  -- If someone widened it out of band, the whole premise of this migration is wrong.
  IF v_status_def LIKE '%''draft''%' OR v_status_def LIKE '%''queued''%'
     OR v_status_def LIKE '%''ignored''%' OR v_status_def LIKE '%''held''%' THEN
    RAISE EXCEPTION '001: email_queue_status_check widened out of band (%); reconcile intent first', v_status_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_context_def
    FROM pg_constraint WHERE conname = 'email_queue_context_check'
     AND conrelid = 'public.email_queue'::regclass;
  IF v_context_def IS NULL THEN
    RAISE EXCEPTION '001: email_queue_context_check is missing; sender-identity routing depends on it';
  END IF;
  IF v_context_def NOT LIKE '%''system''%' OR v_context_def NOT LIKE '%''general''%'
     OR v_context_def NOT LIKE '%''job''%' OR v_context_def NOT LIKE '%''onboarding''%' THEN
    RAISE EXCEPTION '001: email_queue_context_check is not the expected set: %', v_context_def;
  END IF;
END $pre$;

-- ============================================================================
-- 1. queue_email_safe — status fix, sender classification, and a routing guard
-- ============================================================================
--
-- This one is replaced in full rather than text-edited, because the signature changes and because
-- three separate things move: the invalid status, the missing context column, and a new guard.
--
-- DROP + CREATE in one transaction, deliberately: appending a parameter to an existing function
-- via CREATE OR REPLACE is rejected by Postgres, and creating the new form alongside the old would
-- leave two overloads resolvable by the same named-argument call — the DEF-002 ambiguity defect
-- class. One transaction means there is no window in which neither form exists.
--
-- All known callers pass named arguments (src/lib/email-safe-service.ts, src/pages/OpsHealth.tsx
-- x2, all via supabase.rpc which marshals by name), so appending is safe. There are no positional
-- callers and no database callers.

DROP FUNCTION IF EXISTS public.queue_email_safe(uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid);

CREATE FUNCTION public.queue_email_safe(
  p_organization_id uuid,
  p_to_email text,
  p_to_name text DEFAULT NULL::text,
  p_subject text DEFAULT NULL::text,
  p_body_html text DEFAULT NULL::text,
  p_template_id uuid DEFAULT NULL::uuid,
  p_merge_data jsonb DEFAULT '{}'::jsonb,
  p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_entity_type text DEFAULT NULL::text,
  p_entity_id uuid DEFAULT NULL::uuid,
  p_context text DEFAULT 'general'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_email_id uuid;
  v_status text;
  v_is_draft boolean;
BEGIN
  PERFORM set_config('app.rpc', '1', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Sender identity is a security boundary, not a formatting choice. This RPC is callable by any
  -- authenticated user, and context='system' is what makes process-email-queue send a message
  -- through Postmark as AccountancyOS rather than through the practice's own mailbox. Nothing a
  -- user composes is AccountancyOS's own mail, so 'system' must be unreachable from here — no
  -- matter what the caller passes.
  IF p_context = 'system' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Invalid context: user-composed email cannot be sent as AccountancyOS system mail');
  END IF;

  -- Fail with a readable message rather than a raw 23514 from the check constraint.
  IF p_context IS NULL OR p_context NOT IN ('quote','onboarding','engagement','job','invoice','general') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Invalid context: expected one of quote, onboarding, engagement, job, invoice, general');
  END IF;

  -- A draft is an unscheduled row, not a distinct status. The drainer selects on
  -- status='pending' AND scheduled_at <= now(), and that comparison never matches NULL, so
  -- leaving scheduled_at NULL is what makes a draft unsendable. This previously derived status
  -- from a two-value CASE, neither arm of which email_queue_status_check permits, so every call
  -- raised 23514 and Compose Email was entirely broken.
  v_status := 'pending';
  v_is_draft := (p_scheduled_at IS NULL);

  INSERT INTO email_queue (
    organization_id, to_email, to_name, subject, body_html, template_id,
    merge_data, scheduled_at, status, entity_type, entity_id, created_by, context
  ) VALUES (
    p_organization_id, p_to_email, p_to_name, p_subject, p_body_html, p_template_id,
    p_merge_data, p_scheduled_at, v_status, p_entity_type, p_entity_id, v_user_id, p_context
  ) RETURNING id INTO v_email_id;

  -- NOTE: the action below is an audit_log.action value, NOT an email_queue.status value. Same
  -- word, different vocabulary, different column. Do not "fix" it to match the status set.
  INSERT INTO audit_log (organization_id, user_id, entity_type, entity_id, action, after_state)
  VALUES (p_organization_id, v_user_id, 'email', v_email_id, 'queued',
    jsonb_build_object('status', v_status, 'to_email', p_to_email, 'context', p_context,
                       'is_draft', v_is_draft));

  RETURN jsonb_build_object('success', true, 'email_id', v_email_id, 'status', v_status,
                            'is_draft', v_is_draft, 'context', p_context);
END;
$function$;

ALTER FUNCTION public.queue_email_safe(uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text)
  OWNER TO postgres;

-- DROP takes the ACL with it, so grants are re-issued explicitly.
--
-- VERIFIED AFTER APPLY: the resulting ACL is
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- — byte-identical to the ACL before this migration, including EXECUTE to PUBLIC (=X) and to anon,
-- which are NOT granted below. Supabase carries ALTER DEFAULT PRIVILEGES for functions in the
-- public schema, so a newly created function is granted to PUBLIC/anon/authenticated/service_role
-- automatically. Re-issuing the two grants below is therefore belt-and-braces, not the mechanism.
--
-- The practical consequence: you CANNOT narrow a function's ACL here by simply omitting a grant.
-- Narrowing requires an explicit REVOKE. That is deliberately not done: the function's first act
-- is to return 'Not authenticated' when auth.uid() IS NULL, so no anonymous caller can achieve
-- anything, and preserving the pre-existing ACL exactly keeps this migration behaviour-neutral on
-- privileges. If the PUBLIC/anon grant is to be removed, it belongs in its own reviewed change:
--   REVOKE EXECUTE ON FUNCTION public.queue_email_safe(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_email_safe(uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_email_safe(uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text) TO service_role;

-- ============================================================================
-- 2. Small functions — replaced in full (each body is under 1.5 KB)
-- ============================================================================

-- 'ignored' is not a permitted status, so every dismissal raised 23514. 'cancelled' carries the
-- same meaning — a human decided this will not be sent — and the fact that it was a dismissal of
-- a failure rather than a cancellation of a pending send is already recorded by acknowledged_at
-- and acknowledged_by, which this same UPDATE sets.
CREATE OR REPLACE FUNCTION public.acknowledge_failed_email_safe(p_email_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_email RECORD;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;

  v_org_id := v_email.organization_id;
  IF NOT user_has_role_at_least(v_user_id, v_org_id, 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: manager+ required');
  END IF;

  IF v_email.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only acknowledge failed emails');
  END IF;

  UPDATE email_queue SET
    status = 'cancelled',
    acknowledged_at = now(),
    acknowledged_by = v_user_id,
    updated_at = now()
  WHERE id = p_email_id;

  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, user_id, metadata)
  VALUES (v_org_id, 'email', p_email_id, 'acknowledged_failure', v_user_id,
    jsonb_build_object('last_error', v_email.last_error_message));

  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$function$;

-- 'queued' can no longer exist, so the IN list is reduced to what is reachable. Behaviour is
-- unchanged; the point is that the next reader does not have to re-derive that 'queued' is dead.
-- The `scheduled_at > now()` predicate is left as is, and that is deliberate: it excludes NULL,
-- which is what keeps a flush from sweeping drafts into the outbox.
CREATE OR REPLACE FUNCTION public.flush_email_queue_now(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.user_in_organization(v_user_id, p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  UPDATE public.email_queue
     SET scheduled_at = now(),
         updated_at = now()
   WHERE organization_id = p_organization_id
     AND status = 'pending'
     AND scheduled_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'flushed', v_count);
END;
$function$;

-- Same dead-value cleanup. Note this one DOES legitimately promote a draft: setting
-- scheduled_at = now() on a row whose scheduled_at was NULL is exactly 'send this draft now',
-- which is the intended behaviour of the action.
CREATE OR REPLACE FUNCTION public.send_queued_email_now(p_email_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT organization_id INTO v_org FROM public.email_queue WHERE id = p_email_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;
  IF NOT public.user_in_organization(v_user_id, v_org) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  UPDATE public.email_queue
     SET scheduled_at = now(),
         status = CASE WHEN status IN ('pending','failed') THEN 'pending' ELSE status END,
         error_message = NULL,
         updated_at = now()
   WHERE id = p_email_id;
  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$function$;

-- 'draft' and 'queued' are dead here too. Under the new model a draft IS a pending row with a
-- NULL scheduled_at, so gating on status='pending' keeps drafts editable, which is what the
-- original three-value list was reaching for.
CREATE OR REPLACE FUNCTION public.update_queued_email_safe(p_email_id uuid, p_subject text DEFAULT NULL::text, p_body_html text DEFAULT NULL::text, p_to_email text DEFAULT NULL::text, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_email RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_email FROM email_queue WHERE id = p_email_id;
  IF v_email.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email not found');
  END IF;

  IF NOT user_in_organization(v_user_id, v_email.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  -- Blocks edits to sent, failed and cancelled email. A draft is a pending row with a NULL
  -- scheduled_at, so it is covered by this same test.
  IF v_email.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only edit unsent emails');
  END IF;

  UPDATE email_queue SET
    subject = COALESCE(p_subject, subject),
    body_html = COALESCE(p_body_html, body_html),
    to_email = COALESCE(p_to_email, to_email),
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
    updated_at = now()
  WHERE id = p_email_id;

  RETURN jsonb_build_object('success', true, 'email_id', p_email_id);
END;
$function$;

-- The recipients here are the practice's own staff — organization_users joined to auth.users,
-- addressed at their AccountancyOS login address, with a body that says 'Please review in
-- AccountancyOS'. That is the platform notifying its users about product state, which is exactly
-- what 'system' is reserved for, so it goes out through Postmark. Left as 'onboarding' it would
-- route through the practice's own mailbox and be HELD indefinitely whenever no mailbox is
-- connected — which is the state a practice is most likely to be in during onboarding.
CREATE OR REPLACE FUNCTION public.public_submit_onboarding_for_review(p_application_id uuid, p_portal_email text, p_access_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.onboarding_applications%ROWTYPE;
  v_org_name text;
  v_member record;
  v_client_name text;
BEGIN
  SELECT * INTO v_app FROM public.onboarding_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  PERFORM public.lifecycle_require_onboarding_token(p_application_id, p_access_token);
  IF v_app.status = 'for_review' THEN
    RETURN jsonb_build_object('status','for_review','already', true);
  END IF;

  UPDATE public.onboarding_applications
     SET status = 'for_review',
         portal_email = COALESCE(p_portal_email, portal_email),
         submitted_for_review_at = now(),
         updated_at = now()
   WHERE id = p_application_id;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_app.organization_id;
  v_client_name := COALESCE(v_app.company_name,
    NULLIF(trim(coalesce(v_app.first_name,'') || ' ' || coalesce(v_app.last_name,'')), ''),
    v_app.email, 'New onboarding');

  FOR v_member IN
    SELECT user_id FROM public.organization_users WHERE organization_id = v_app.organization_id
  LOOP
    INSERT INTO public.notifications (
      organization_id, user_id, type, title, message, entity_type, entity_id
    ) VALUES (
      v_app.organization_id, v_member.user_id, 'onboarding_for_review',
      'New onboarding ready for review',
      v_client_name || ' has completed onboarding and is ready for review.',
      'onboarding_application', p_application_id
    );
  END LOOP;

  INSERT INTO public.email_queue (
    organization_id, to_email, to_name, subject, body_html, status, context, entity_type, entity_id
  )
  SELECT v_app.organization_id,
         u.email,
         COALESCE(u.raw_user_meta_data->>'full_name', u.email),
         'Onboarding ready for review: ' || v_client_name,
         '<p>' || v_client_name || ' has completed the onboarding wizard.</p>' ||
         '<p>Please review in AccountancyOS.</p>',
         'pending', 'system', 'onboarding_application', p_application_id
    FROM public.organization_users om
    JOIN auth.users u ON u.id = om.user_id
   WHERE om.organization_id = v_app.organization_id
     AND om.role = 'owner'
     AND u.email IS NOT NULL;

  RETURN jsonb_build_object('status','for_review','already', false);
END;
$function$;

-- ============================================================================
-- 3. Large functions — surgical text edits
-- ============================================================================
--
-- These bodies are 2.6 KB, 3.9 KB and 17.9 KB. Re-pasting them would mean re-asserting thousands
-- of lines I have no reason to touch, and any transcription slip would be silent. Instead each
-- edit reads the live definition, asserts its anchor appears exactly once, rewrites just that
-- span, and re-executes. A body that has drifted fails loudly rather than being half-edited.

-- ---------------------------------------------------------------------------
-- 3a. send_onboarding_questionnaire — recipient is the onboarding applicant (a client), so this
--     is practice correspondence: 'onboarding'. It set no context at all, which under the routing
--     rules means NULL, which means held forever.
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  v_def text;
  v_new text;
  v_cols_from text := $a$    entity_type, entity_id, merge_data, status
  )$a$;
  v_cols_to text := $a$    entity_type, entity_id, merge_data, status, context
  )$a$;
  v_vals_from text := $a$    'pending'
  );$a$;
  v_vals_to text := $a$    'pending',
    'onboarding'
  );$a$;
  v_hits int;
BEGIN
  v_def := pg_get_functiondef('public.send_onboarding_questionnaire(uuid,uuid)'::regprocedure);

  IF position(v_cols_to in v_def) > 0 THEN
    RAISE NOTICE '001/3a: send_onboarding_questionnaire already classified; skipping';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_cols_from, ''))) / length(v_cols_from);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3a: expected exactly 1 match for the email_queue column list in send_onboarding_questionnaire, found %', v_hits;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, v_vals_from, ''))) / length(v_vals_from);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3a: expected exactly 1 match for the VALUES tail in send_onboarding_questionnaire, found %', v_hits;
  END IF;

  v_new := replace(v_def, v_cols_from, v_cols_to);
  v_new := replace(v_new, v_vals_from, v_vals_to);
  EXECUTE v_new;
END $mig$;

-- ---------------------------------------------------------------------------
-- 3b. lifecycle_approve_onboarding — the queued email is an information request tied to a job
--     (it already writes entity_type='job' and entity_id=v_job_id), addressed to the onboarding
--     applicant. Client-facing, so 'job'. It set no context.
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  v_def text;
  v_new text;
  v_cols_from text := $a$            merge_data, status
          )
          SELECT$a$;
  v_cols_to text := $a$            merge_data, status, context
          )
          SELECT$a$;
  v_vals_from text := $a$            'pending'
          FROM templates t$a$;
  v_vals_to text := $a$            'pending',
            'job'
          FROM templates t$a$;
  v_hits int;
BEGIN
  v_def := pg_get_functiondef('public.lifecycle_approve_onboarding(uuid)'::regprocedure);

  IF position(v_cols_to in v_def) > 0 THEN
    RAISE NOTICE '001/3b: lifecycle_approve_onboarding already classified; skipping';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_cols_from, ''))) / length(v_cols_from);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3b: expected exactly 1 match for the email_queue column list in lifecycle_approve_onboarding, found %', v_hits;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, v_vals_from, ''))) / length(v_vals_from);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3b: expected exactly 1 match for the SELECT tail in lifecycle_approve_onboarding, found %', v_hits;
  END IF;

  v_new := replace(v_def, v_cols_from, v_cols_to);
  v_new := replace(v_new, v_vals_from, v_vals_to);
  EXECUTE v_new;
END $mig$;

-- ---------------------------------------------------------------------------
-- 3c. trigger_records_request(uuid) — two separate violations in one INSERT.
--
--     status  'queued'          -> 'pending'         (email_queue_status_check)
--     context 'records_request' -> 'job'             (email_queue_context_check)
--
--     'records_request' appears TWICE in this body. The first is
--     job_questionnaire_instances.questionnaire_type, which is a different column on a different
--     table with its own vocabulary and MUST NOT change. Only the second — the email_queue
--     context — is rewritten, which is why the anchor carries its neighbouring lines rather than
--     matching the bare literal.
--
--     The 2-argument overload already writes 'pending' and 'job' correctly and is left alone.
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  v_def text;
  v_new text;
  v_ctx_from text := $a$    v_job.company_id,
    'records_request',$a$;
  v_ctx_to text := $a$    v_job.company_id,
    'job',$a$;
  v_status_from text := $a$    'queued',
    'questionnaire',$a$;
  v_status_to text := $a$    'pending',
    'questionnaire',$a$;
  v_keep text := $a$    'records_request',
    'awaiting_info',$a$;
  v_hits int;
BEGIN
  v_def := pg_get_functiondef('public.trigger_records_request(uuid)'::regprocedure);

  IF position(v_ctx_to in v_def) > 0 AND position(v_status_to in v_def) > 0 THEN
    RAISE NOTICE '001/3c: trigger_records_request(uuid) already corrected; skipping';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_ctx_from, ''))) / length(v_ctx_from);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3c: expected exactly 1 match for the email_queue context anchor in trigger_records_request(uuid), found % — refusing to touch the questionnaire_type literal', v_hits;
  END IF;
  v_hits := (length(v_def) - length(replace(v_def, v_status_from, ''))) / length(v_status_from);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3c: expected exactly 1 match for the status anchor in trigger_records_request(uuid), found %', v_hits;
  END IF;

  v_new := replace(v_def, v_ctx_from, v_ctx_to);
  v_new := replace(v_new, v_status_from, v_status_to);

  -- Belt and braces: the job_questionnaire_instances.questionnaire_type literal is a DIFFERENT
  -- column on a different table and must survive untouched. Assert it is still there, exactly
  -- once, and that the email_queue context literal is now gone.
  v_hits := (length(v_new) - length(replace(v_new, v_keep, ''))) / length(v_keep);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3c: the job_questionnaire_instances questionnaire_type literal was damaged (found % occurrences, expected 1)', v_hits;
  END IF;
  v_hits := (length(v_new) - length(replace(v_new, $a$'records_request'$a$, ''))) / length($a$'records_request'$a$);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION '001/3c: expected exactly 1 remaining records_request literal (the questionnaire_type), found %', v_hits;
  END IF;

  EXECUTE v_new;
END $mig$;

-- ============================================================================
-- POST-ASSERTIONS
-- ============================================================================

DO $post$
DECLARE
  v_bad text;
  v_nargs int;
  v_qes text;
BEGIN
  -- Each offender is asserted individually rather than by a blanket scan. Two functions would
  -- false-positive on a body-wide grep, both for the same reason — the same word belongs to a
  -- different vocabulary elsewhere in their bodies, which is precisely the confusion this
  -- migration exists to remove:
  --   lifecycle_send_quote  uses it for the QUOTES table's own status vocabulary
  --   queue_email_safe      writes it as an audit_log.action value
  -- Both are correct as they stand. queue_email_safe gets the precise assertion below instead.
  FOR v_bad IN
    SELECT sig FROM (VALUES
      ('public.flush_email_queue_now(uuid)'),
      ('public.send_queued_email_now(uuid)'),
      ('public.update_queued_email_safe(uuid,text,text,text,timestamptz)')
    ) AS t(sig)
  LOOP
    IF pg_get_functiondef(v_bad::regprocedure) LIKE '%''queued''%'
       OR pg_get_functiondef(v_bad::regprocedure) LIKE '%''draft''%' THEN
      RAISE EXCEPTION '001: % still carries a retired status literal', v_bad;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO v_qes
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'queue_email_safe';

  -- queue_email_safe, asserted on the status assignment itself rather than by grepping the body.
  IF v_qes NOT LIKE '%v_status := ''pending'';%' THEN
    RAISE EXCEPTION '001: queue_email_safe does not assign the canonical pending status';
  END IF;
  IF v_qes LIKE '%v_status := CASE%' THEN
    RAISE EXCEPTION '001: queue_email_safe still derives its status from the retired two-value CASE';
  END IF;

  IF pg_get_functiondef('public.acknowledge_failed_email_safe(uuid)'::regprocedure) LIKE '%''ignored''%' THEN
    RAISE EXCEPTION '001: acknowledge_failed_email_safe still writes ignored';
  END IF;

  -- trigger_records_request(uuid): the email_queue context anchor must be gone, and exactly one
  -- 'records_request' must remain — the job_questionnaire_instances.questionnaire_type value,
  -- which belongs to a different table's vocabulary and must not have been touched.
  IF pg_get_functiondef('public.trigger_records_request(uuid)'::regprocedure) LIKE '%company_id,
    ''records_request'',%' THEN
    RAISE EXCEPTION '001: trigger_records_request(uuid) still sets email_queue.context = records_request';
  END IF;
  IF (length(pg_get_functiondef('public.trigger_records_request(uuid)'::regprocedure))
      - length(replace(pg_get_functiondef('public.trigger_records_request(uuid)'::regprocedure), '''records_request''', '')))
     / length('''records_request''') <> 1 THEN
    RAISE EXCEPTION '001: trigger_records_request(uuid) should retain exactly one records_request literal (questionnaire_type)';
  END IF;

  -- Every email_queue INSERT in these senders now carries a context.
  IF pg_get_functiondef('public.send_onboarding_questionnaire(uuid,uuid)'::regprocedure) NOT LIKE '%merge_data, status, context%' THEN
    RAISE EXCEPTION '001: send_onboarding_questionnaire still sets no context';
  END IF;
  IF pg_get_functiondef('public.lifecycle_approve_onboarding(uuid)'::regprocedure) NOT LIKE '%merge_data, status, context%' THEN
    RAISE EXCEPTION '001: lifecycle_approve_onboarding still sets no context';
  END IF;

  -- The anchor guards above prove the RIGHT SPAN was rewritten, but not that it was rewritten
  -- with the right TEXT. A mistyped replacement literal ('jog' for 'job') would satisfy every
  -- check so far and then fail at 23514 the first time a real email was queued, months later.
  -- So the resulting values are asserted literally, against the context vocabulary.
  IF pg_get_functiondef('public.lifecycle_approve_onboarding(uuid)'::regprocedure) NOT LIKE '%''pending'',
            ''job''
          FROM templates t%' THEN
    RAISE EXCEPTION '001: lifecycle_approve_onboarding context value is not the expected ''job''';
  END IF;
  IF pg_get_functiondef('public.send_onboarding_questionnaire(uuid,uuid)'::regprocedure) NOT LIKE '%''pending'',
    ''onboarding''
  );%' THEN
    RAISE EXCEPTION '001: send_onboarding_questionnaire context value is not the expected ''onboarding''';
  END IF;
  IF pg_get_functiondef('public.trigger_records_request(uuid)'::regprocedure) NOT LIKE '%company_id,
    ''job'',%' THEN
    RAISE EXCEPTION '001: trigger_records_request(uuid) context value is not the expected ''job''';
  END IF;
  IF pg_get_functiondef('public.public_submit_onboarding_for_review(uuid,text,text)'::regprocedure) NOT LIKE '%''pending'', ''system''%' THEN
    RAISE EXCEPTION '001: public_submit_onboarding_for_review was not reclassified to system';
  END IF;

  -- queue_email_safe: exactly one overload, carrying the new parameter.
  SELECT count(*) INTO v_nargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'queue_email_safe';
  IF v_nargs <> 1 THEN
    RAISE EXCEPTION '001: expected exactly 1 queue_email_safe overload, found % — ambiguity risk', v_nargs;
  END IF;
  SELECT p.pronargs INTO v_nargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'queue_email_safe';
  IF v_nargs <> 11 THEN
    RAISE EXCEPTION '001: queue_email_safe has % arguments, expected 11', v_nargs;
  END IF;
  IF v_qes NOT LIKE '%user-composed email cannot be sent as AccountancyOS system mail%' THEN
    RAISE EXCEPTION '001: queue_email_safe is missing the system-context guard';
  END IF;

  -- Grants survived the DROP.
  IF NOT has_function_privilege('authenticated',
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='queue_email_safe'), 'EXECUTE') THEN
    RAISE EXCEPTION '001: authenticated lost EXECUTE on queue_email_safe';
  END IF;
  IF NOT has_function_privilege('service_role',
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='queue_email_safe'), 'EXECUTE') THEN
    RAISE EXCEPTION '001: service_role lost EXECUTE on queue_email_safe';
  END IF;
END $post$;

COMMIT;
