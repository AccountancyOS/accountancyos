-- DEF-031 RE-APPLY (recurring drift, 2026-08-06).
-- sandbox_exec was set NOBYPASSRLS on 2026-08-05 and verified. On 2026-08-06 it was observed
-- with rolbypassrls = true again (oid 161547). The repo contains no CREATE/ALTER ROLE source
-- for this role, so the reprovisioning source is platform automation outside Git.
-- This migration is identical in effect to 20260805200000 and is idempotent.

BEGIN;

DO $mig$
DECLARE
  v_exists boolean;
  v_bypass boolean;
  v_super  boolean;
  v_login  boolean;
  v_oid    oid;
BEGIN
  SELECT true, rolbypassrls, rolsuper, rolcanlogin, oid
    INTO v_exists, v_bypass, v_super, v_login, v_oid
  FROM pg_roles WHERE rolname = 'sandbox_exec';

  IF NOT coalesce(v_exists, false) THEN
    RAISE EXCEPTION
      'DEF-031 precondition failed: role "sandbox_exec" does not exist in this database. Confirm the target is production (project ref moxpdejnucjjcplleefn) before proceeding.';
  END IF;

  RAISE NOTICE 'DEF-031 re-apply pre-state: oid=%, rolbypassrls=%, rolsuper=%, rolcanlogin=%.',
    v_oid, v_bypass, v_super, v_login;

  IF NOT v_bypass THEN
    RAISE NOTICE 'DEF-031: sandbox_exec already has rolbypassrls = false; nothing to change.';
  ELSE
    BEGIN
      EXECUTE 'ALTER ROLE sandbox_exec NOBYPASSRLS';
      RAISE NOTICE 'DEF-031: ALTER ROLE sandbox_exec NOBYPASSRLS executed.';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION
          'DEF-031 could not be applied: changing BYPASSRLS requires SUPERUSER, and the migration runner (current_user = %) does not hold it. Run ALTER ROLE sandbox_exec NOBYPASSRLS as supabase_admin, then re-apply. Expected outcome of the platform privilege model, not a fault in the migration.',
          current_user;
    END;
  END IF;
END $mig$;

DO $mig$
DECLARE
  v_bypass boolean;
  v_super  boolean;
  v_oid    oid;
BEGIN
  SELECT rolbypassrls, rolsuper, oid INTO v_bypass, v_super, v_oid
  FROM pg_roles WHERE rolname = 'sandbox_exec';

  IF v_bypass THEN
    RAISE EXCEPTION 'DEF-031 post-assert failed: sandbox_exec still has rolbypassrls = true.';
  END IF;

  IF v_super THEN
    RAISE EXCEPTION
      'DEF-031 post-assert failed: sandbox_exec is SUPERUSER, which bypasses RLS regardless of rolbypassrls.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles child  ON child.oid  = m.member
    JOIN pg_roles parent ON parent.oid = m.roleid
    WHERE child.rolname = 'sandbox_exec'
      AND (parent.rolbypassrls OR parent.rolsuper)
  ) THEN
    RAISE EXCEPTION
      'DEF-031 post-assert failed: sandbox_exec inherits a SUPERUSER or BYPASSRLS role, so RLS is still bypassed by inheritance.';
  END IF;

  RAISE NOTICE 'DEF-031 re-apply post-assertions passed: oid=%, rolbypassrls=false, not superuser, no bypassing parent.', v_oid;
END $mig$;

COMMIT;