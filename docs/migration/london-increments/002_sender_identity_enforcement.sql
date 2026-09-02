-- 002 — make the sender-identity boundary real at the database layer
--
-- LONDON ONLY. Do not place this file in supabase/migrations/ — see ./README.md.
-- Apply with: apply_migration, name `london_inc_002_sender_identity_enforcement`.
--
-- ============================================================================
-- WHY — this is a hard prerequisite for deploying the rewritten drainer
-- ============================================================================
--
-- The deployed London `process-email-queue` is still the pre-Postmark version. The rewrite that
-- implements sender identity exists in git but has never been deployed. Before it can be, two
-- database-layer defects have to be closed, because deploying the worker without them would turn
-- one of them into a live security hole and make the other fail silently.
--
-- 1. RLS DOES NOT CONSTRAIN `context`, SO THE RPC GUARD IS BYPASSABLE.
--
--    Increment 001 added a guard to queue_email_safe refusing context='system', on the grounds
--    that nothing a user composes is AccountancyOS's own mail. That guard is necessary but NOT
--    sufficient: `authenticated` holds a direct INSERT grant on public.email_queue, and the
--    policy is
--        email_queue_insert_org  INSERT  WITH CHECK user_has_organization_access(organization_id)
--    which says nothing about `context` at all. So any authenticated member of any organisation
--    can PostgREST-insert a row with context='system' and skip the RPC entirely. The same is true
--    of UPDATE — insert 'general', then update it to 'system' — so both policies must be fixed or
--    the gap simply moves.
--
--    Today this is inert, because the deployed worker has no Postmark path to exploit. The moment
--    the rewrite deploys it becomes a live send-as-AccountancyOS hole: attacker-authored content,
--    delivered from AccountancyOS's own DKIM-signed domain, to a recipient of their choosing.
--    That is why this lands BEFORE the worker, not after.
--
--    Verified unexploited at authoring time: count(*) where context='system' is 0.
--
-- 2. THE CLAIM RPC DOES NOT RETURN `context`, SO ROUTING WOULD SILENTLY FAIL OPEN.
--
--    claim_email_queue_row returns 11 columns and `context` is not among them. The rewritten
--    drainer selects a row, claims it, and then routes on the CLAIMED row:
--        const queueRow = claimed as typeof row
--        if (isSystemEmail(queueRow.context)) ...
--    With `context` absent, queueRow.context is undefined for every message, isSystemEmail() is
--    false universally, and every system email routes to the practice-mailbox path and is HELD
--    forever. No error, no failed row, nothing in the logs — auth mail would simply stop, and the
--    deploy would look healthy. Exactly the silent-failure class this programme keeps hitting.
--
--    `retry_count`, `entity_type` and `entity_id` are added at the same time: the drainer's hold
--    back-off reads retry_count, and arithmetic on undefined yields NaN, which would corrupt the
--    scheduled_at back-off rather than failing loudly.
--
-- ============================================================================
-- SAFETY
-- ============================================================================
--
-- Verified live before authoring:
--   service_role  rolbypassrls = true
--   postgres      rolbypassrls = true
--   authenticated rolbypassrls = false
--   anon          rolbypassrls = false
--   public.email_queue relrowsecurity = true
--
-- So RLS policies constrain `authenticated` only. The drainer runs as service_role and is
-- unaffected. SECURITY DEFINER functions owned by postgres — including
-- public_submit_onboarding_for_review, which legitimately writes context='system' — bypass RLS
-- and are unaffected. This migration therefore removes an attacker's path to 'system' without
-- removing any legitimate one.
--
-- `context IS DISTINCT FROM 'system'` (not `<> 'system'`) is deliberate: NULL context is the
-- ordinary client-mail default and must keep being insertable by users.

BEGIN;

-- ============================================================================
-- PRECONDITIONS
-- ============================================================================

DO $pre$
DECLARE
  v_bypass boolean;
  v_rls boolean;
  v_system_rows bigint;
BEGIN
  SELECT rolbypassrls INTO v_bypass FROM pg_roles WHERE rolname = 'service_role';
  IF v_bypass IS DISTINCT FROM true THEN
    RAISE EXCEPTION '002: service_role does not bypass RLS; tightening these policies would break the drainer';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.email_queue'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION '002: RLS is not enabled on email_queue; a policy change would be decorative';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
                  AND polname = 'email_queue_insert_org') THEN
    RAISE EXCEPTION '002: email_queue_insert_org is missing; refusing to guess the intended policy set';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
                  AND polname = 'email_queue_update_org') THEN
    RAISE EXCEPTION '002: email_queue_update_org is missing; refusing to guess the intended policy set';
  END IF;

  -- Not a blocker, but the operator should know if the gap was used before it was closed.
  SELECT count(*) INTO v_system_rows FROM public.email_queue WHERE context = 'system';
  IF v_system_rows > 0 THEN
    RAISE NOTICE '002: % existing row(s) carry context=system — review their provenance; they predate this guard', v_system_rows;
  END IF;
END $pre$;

-- ============================================================================
-- 1. Constrain `context` in the authenticated RLS policies
-- ============================================================================

DROP POLICY IF EXISTS email_queue_insert_org ON public.email_queue;
CREATE POLICY email_queue_insert_org ON public.email_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_organization_access(organization_id)
    -- context='system' makes process-email-queue send through Postmark AS AccountancyOS rather
    -- than through the practice's own mailbox. It is a sender-identity decision, and it is not a
    -- user's to make. Only service_role and SECURITY DEFINER functions (both of which bypass RLS)
    -- may set it.
    AND context IS DISTINCT FROM 'system'
  );

DROP POLICY IF EXISTS email_queue_update_org ON public.email_queue;
CREATE POLICY email_queue_update_org ON public.email_queue
  FOR UPDATE TO authenticated
  USING (user_has_organization_access(organization_id))
  WITH CHECK (
    user_has_organization_access(organization_id)
    -- Without this the guard above is trivially defeated: insert 'general', then update to
    -- 'system'. WITH CHECK governs the post-update row, which is what has to be constrained.
    AND context IS DISTINCT FROM 'system'
  );

-- ============================================================================
-- 2. Return `context` (and the back-off inputs) from the claim RPC
-- ============================================================================
--
-- CREATE OR REPLACE cannot change a function's return type, so this is a DROP + CREATE inside the
-- transaction. The only caller is process-email-queue, which destructures by name.

DROP FUNCTION IF EXISTS public.claim_email_queue_row(uuid, timestamptz);

CREATE FUNCTION public.claim_email_queue_row(p_email_id uuid, p_stale_before timestamp with time zone)
 RETURNS TABLE(
   id uuid,
   organization_id uuid,
   to_email text,
   to_name text,
   subject text,
   body_html text,
   body_text text,
   mailbox_id uuid,
   provider text,
   created_by uuid,
   attachments jsonb,
   context text,
   retry_count integer,
   entity_type text,
   entity_id uuid
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.email_queue q
     SET claimed_at = now(),
         updated_at = now()
   WHERE q.id = p_email_id
     AND q.status = 'pending'
     AND (q.claimed_at IS NULL OR q.claimed_at < p_stale_before)
  RETURNING
     q.id,
     q.organization_id,
     q.to_email,
     q.to_name,
     q.subject,
     q.body_html,
     q.body_text,
     q.mailbox_id,
     q.provider,
     q.created_by,
     q.attachments,
     -- The routing decision. Absent from the previous return shape, which would have made the
     -- rewritten drainer treat every message as non-system and hold all auth mail, silently.
     q.context,
     -- COALESCEd because the column is nullable with default 0: the drainer does arithmetic on
     -- this for the hold back-off, and NULL would propagate to NaN rather than failing loudly.
     COALESCE(q.retry_count, 0),
     q.entity_type,
     q.entity_id;
END;
$function$;

ALTER FUNCTION public.claim_email_queue_row(uuid, timestamptz) OWNER TO postgres;

-- Claiming a queue row is a worker operation. An authenticated user able to claim rows could
-- stall or steal sends, and no user-facing path needs it. Note the ACL is re-granted rather than
-- narrowed by omission: Supabase's default privileges re-grant PUBLIC/anon/authenticated on
-- CREATE, so narrowing requires an explicit REVOKE (learned in increment 001).
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) TO service_role;

-- ============================================================================
-- POST-ASSERTIONS
-- ============================================================================

DO $post$
DECLARE
  v_check text;
  v_cols text;
BEGIN
  -- Both policies must now constrain context.
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_check
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_insert_org';
  IF v_check IS NULL OR v_check NOT LIKE '%context%' THEN
    RAISE EXCEPTION '002: insert policy does not constrain context: %', v_check;
  END IF;

  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_check
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_update_org';
  IF v_check IS NULL OR v_check NOT LIKE '%context%' THEN
    RAISE EXCEPTION '002: update policy WITH CHECK does not constrain context: %', v_check;
  END IF;

  -- The claim RPC must hand back the routing input.
  SELECT pg_get_function_result('public.claim_email_queue_row(uuid,timestamptz)'::regprocedure)
    INTO v_cols;
  IF v_cols NOT LIKE '%context text%' THEN
    RAISE EXCEPTION '002: claim_email_queue_row does not return context — the drainer would hold all system mail silently. Got: %', v_cols;
  END IF;
  IF v_cols NOT LIKE '%retry_count integer%' THEN
    RAISE EXCEPTION '002: claim_email_queue_row does not return retry_count: %', v_cols;
  END IF;

  -- Exactly one overload, or a named-argument call could resolve to the old shape.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'claim_email_queue_row') <> 1 THEN
    RAISE EXCEPTION '002: expected exactly 1 claim_email_queue_row overload — ambiguity risk';
  END IF;

  -- The worker must still be able to call it; users must not.
  IF NOT has_function_privilege('service_role',
       'public.claim_email_queue_row(uuid,timestamptz)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '002: service_role lost EXECUTE on claim_email_queue_row';
  END IF;
  IF has_function_privilege('authenticated',
       'public.claim_email_queue_row(uuid,timestamptz)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '002: authenticated still holds EXECUTE on claim_email_queue_row';
  END IF;
END $post$;

COMMIT;
