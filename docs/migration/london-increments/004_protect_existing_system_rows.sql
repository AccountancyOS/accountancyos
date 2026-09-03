-- 004 — protect system rows that already exist, and remove two standing over-grants
--
-- LONDON ONLY. Do not place this file in supabase/migrations/ — see ./README.md.
-- Apply with: apply_migration, name `london_inc_004_protect_existing_system_rows`.
--
-- ============================================================================
-- WHY
-- ============================================================================
--
-- Increment 002 stopped an authenticated user CREATING a context='system' row, by adding
-- `AND context IS DISTINCT FROM 'system'` to the WITH CHECK of the insert and update policies.
-- That closed the send-as-AccountancyOS path — WITH CHECK governs the row as it will exist, so a
-- user can no longer produce one.
--
-- It did not close the other half. Both USING clauses are still organisation-only:
--     email_queue_update_org  USING user_has_organization_access(organization_id)
--     email_queue_delete_org  USING user_has_organization_access(organization_id)
-- USING decides which existing rows a statement may TOUCH. So an authenticated org member can
-- still DELETE a pending system email outright, or UPDATE one — rewriting it to context='general'
-- passes the new WITH CHECK, because the post-update row is no longer 'system'.
--
-- The concrete attack this enables is not a forged send; it is SUPPRESSION OF THE WARNING. The
-- held-email escalation (design items 5-6) alerts practice administrators when a mailbox is
-- disconnected and client correspondence is piling up unsent. Those alerts are system mail. An
-- attacker who disconnects a practice's mailbox could then delete or neutralise the very
-- notification telling the practice it had happened, and the queue would fill silently — which is
-- precisely the failure mode the escalation design exists to prevent.
--
-- Also removes two over-grants that predate this work:
--
--   * queue_email_safe still grants EXECUTE to PUBLIC and anon. Increment 001 observed this but
--     deliberately left it, on the grounds that changing a privilege as a side effect of a
--     vocabulary fix was the wrong place for it, and that it belonged in its own reviewed change.
--     This is that change. The grant is inert — the function's first act is to return
--     'Not authenticated' when auth.uid() is null — so the only behavioural difference is that an
--     anonymous caller now gets a permission error instead of a JSON error object.
--
--   * email_queue.retry_count is nullable. The drainer does arithmetic on it for the hold
--     back-off, and increment 002 had to COALESCE it in claim_email_queue_row to stop NULL
--     propagating to NaN. Defending against a NULL that should never exist is worse than
--     forbidding it: make the column say what is actually true.
--
-- SAFETY
-- ------
-- Verified before authoring: service_role and postgres carry rolbypassrls, so none of the policy
-- changes below constrain the drainer or the SECURITY DEFINER senders. In particular
-- retry_failed_email_safe and acknowledge_failed_email_safe are SECURITY DEFINER owned by
-- postgres, so the staff actions that legitimately update a failed email keep working.
--
-- SELECT is deliberately NOT restricted. Visibility of a system row is not the threat —
-- modification is — and hiding them would break the Emails page's list for staff.
--
-- ROLLBACK
--   BEGIN;
--   DROP POLICY email_queue_update_org ON public.email_queue;
--   CREATE POLICY email_queue_update_org ON public.email_queue FOR UPDATE TO authenticated
--     USING (user_has_organization_access(organization_id))
--     WITH CHECK (user_has_organization_access(organization_id)
--                 AND context IS DISTINCT FROM 'system');
--   DROP POLICY email_queue_delete_org ON public.email_queue;
--   CREATE POLICY email_queue_delete_org ON public.email_queue FOR DELETE TO authenticated
--     USING (user_has_organization_access(organization_id));
--   ALTER TABLE public.email_queue ALTER COLUMN retry_count DROP NOT NULL;
--   GRANT EXECUTE ON FUNCTION public.queue_email_safe(
--     uuid,text,text,text,text,uuid,jsonb,timestamptz,text,uuid,text) TO PUBLIC;
--   COMMIT;

BEGIN;

-- ============================================================================
-- PRECONDITIONS
-- ============================================================================

DO $pre$
DECLARE
  v_bypass boolean;
  v_using text;
BEGIN
  SELECT rolbypassrls INTO v_bypass FROM pg_roles WHERE rolname = 'service_role';
  IF v_bypass IS DISTINCT FROM true THEN
    RAISE EXCEPTION '004: service_role does not bypass RLS; these policy changes would break the drainer';
  END IF;

  -- 002 must already be in place. If the WITH CHECK guard is absent, the create path is still
  -- open and closing only the modify path would give a false sense of completeness.
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_using
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_insert_org';
  IF v_using IS NULL OR v_using NOT LIKE '%context%' THEN
    RAISE EXCEPTION '004: increment 002 is not applied — the insert policy does not constrain context. Apply 002 first.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
                  AND polname = 'email_queue_delete_org') THEN
    RAISE EXCEPTION '004: email_queue_delete_org is missing; refusing to guess the intended policy set';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'queue_email_safe' AND p.pronargs = 11) THEN
    RAISE EXCEPTION '004: the 11-argument queue_email_safe from increment 001 is not present';
  END IF;
END $pre$;

-- ============================================================================
-- 1. An existing system row may not be modified or destroyed by a user
-- ============================================================================

DROP POLICY IF EXISTS email_queue_update_org ON public.email_queue;
CREATE POLICY email_queue_update_org ON public.email_queue
  FOR UPDATE TO authenticated
  -- USING decides which existing rows may be touched at all. Without the guard here, a user could
  -- UPDATE a system row and rewrite it to 'general' — which passes WITH CHECK, because the
  -- post-update row is no longer 'system'.
  USING (
    user_has_organization_access(organization_id)
    AND context IS DISTINCT FROM 'system'
  )
  WITH CHECK (
    user_has_organization_access(organization_id)
    AND context IS DISTINCT FROM 'system'
  );

DROP POLICY IF EXISTS email_queue_delete_org ON public.email_queue;
CREATE POLICY email_queue_delete_org ON public.email_queue
  FOR DELETE TO authenticated
  -- DELETE has no WITH CHECK — there is no resulting row to check — so USING is the only control.
  -- Without it, an attacker who disconnects a practice mailbox can delete the escalation alert
  -- warning the practice that it happened.
  USING (
    user_has_organization_access(organization_id)
    AND context IS DISTINCT FROM 'system'
  );

-- ============================================================================
-- 2. retry_count means a number, so let the column say so
-- ============================================================================

UPDATE public.email_queue SET retry_count = 0 WHERE retry_count IS NULL;

ALTER TABLE public.email_queue ALTER COLUMN retry_count SET DEFAULT 0;
ALTER TABLE public.email_queue ALTER COLUMN retry_count SET NOT NULL;

-- ============================================================================
-- 3. Remove the standing PUBLIC/anon EXECUTE on queue_email_safe
-- ============================================================================
--
-- Explicit REVOKE, not narrowing by omission: increment 001 established that Supabase's default
-- privileges re-grant PUBLIC/anon/authenticated on CREATE, so dropping a GRANT achieves nothing.

REVOKE EXECUTE ON FUNCTION public.queue_email_safe(
  uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_email_safe(
  uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text) FROM anon;

-- ============================================================================
-- POST-ASSERTIONS
-- ============================================================================

DO $post$
DECLARE
  v_expr text;
BEGIN
  -- UPDATE guarded in BOTH directions.
  SELECT pg_get_expr(polqual, polrelid) INTO v_expr
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_update_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context%' THEN
    RAISE EXCEPTION '004: update policy USING does not constrain context: %', v_expr;
  END IF;
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_expr
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_update_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context%' THEN
    RAISE EXCEPTION '004: update policy WITH CHECK lost its context guard: %', v_expr;
  END IF;

  -- DELETE guarded.
  SELECT pg_get_expr(polqual, polrelid) INTO v_expr
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_delete_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context%' THEN
    RAISE EXCEPTION '004: delete policy USING does not constrain context: %', v_expr;
  END IF;

  -- INSERT guard from 002 must have survived the policy churn.
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_expr
    FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass
     AND polname = 'email_queue_insert_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context%' THEN
    RAISE EXCEPTION '004: insert policy from 002 lost its context guard: %', v_expr;
  END IF;

  -- retry_count.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_queue'
                AND column_name='retry_count' AND is_nullable='YES') THEN
    RAISE EXCEPTION '004: email_queue.retry_count is still nullable';
  END IF;

  -- The over-grants are gone, and the legitimate one survives.
  IF has_function_privilege('anon',
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='queue_email_safe'), 'EXECUTE') THEN
    RAISE EXCEPTION '004: anon still holds EXECUTE on queue_email_safe';
  END IF;
  IF NOT has_function_privilege('authenticated',
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='queue_email_safe'), 'EXECUTE') THEN
    RAISE EXCEPTION '004: authenticated lost EXECUTE on queue_email_safe';
  END IF;
  IF NOT has_function_privilege('service_role',
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='queue_email_safe'), 'EXECUTE') THEN
    RAISE EXCEPTION '004: service_role lost EXECUTE on queue_email_safe';
  END IF;
END $post$;

COMMIT;
