-- =====================================================================================
-- DEF-031 — remove RLS bypass from the automated login role `sandbox_exec`.
-- =====================================================================================
-- Owner ruling 2026-08-05: approved. Apply BEFORE any further verification, so that all
-- subsequent evidence is gathered under the intended tenant boundary.
--
-- THE DEFECT. `sandbox_exec` is a login role (`rolcanlogin = t`) with `rolbypassrls = t`,
-- established from pg_roles on 2026-08-05. RLS is the ONLY mechanism enforcing the tenant
-- boundary in this database, so a role that bypasses it defeats tenancy wholesale for every
-- session opened as that role. If those credentials leak, every client record in every
-- organisation is readable and writable and no policy in the schema intervenes. The role is
-- not superuser and owns neither the cron nor the vault relations, which bounds the blast
-- radius — but it does not need to be superuser to defeat tenancy.
--
-- WHY THIS IS NOT A GRANT PROBLEM. This was found while assessing a request to GRANT the
-- role UPDATE on `bank_transactions` and `portal_visibility_settings` so it could verify two
-- untested branches of `stamp_portal_provenance`. Checking the premise first showed the
-- missing privileges were never the obstacle: `cron.job_run_details` is not grant-denied at
-- all (`PUBLIC` already holds `r` and `d`; the denial was schema `USAGE` on `cron`), and
-- `vault.decrypted_secrets` is a view with `service_role=rd` and no RLS, where a bypass buys
-- nothing. The executor withdrew the grant request on that evidence. Granting would have
-- quietly extended a pre-existing bypass rather than caused one.
--
-- WHAT THIS INVALIDATES, AND WHAT IT DOES NOT. Behavioural cross-tenant conclusions drawn
-- through a `sandbox_exec` session prove grants and in-function RAISEs, not RLS, and must be
-- re-read that way. NOT affected: `scripts/smoke-test.ts`, which proves cross-org isolation
-- through real user JWTs via `signInWithPassword` as `authenticated` (guarded by
-- `rls-cross-org.test.ts` asserting no service role is used); the structural evidence in
-- `docs/automation/rls-isolation-evidence.md`, which is catalog reads not subject to RLS
-- filtering; and DEF-015, which concerned EXECUTE grants — `rolbypassrls` bypasses row
-- security, not privilege checks. Tenancy isolation for real users remains evidenced.
--
-- EXPECTED CONSEQUENCE, per the owner ruling. Reads or writes that previously succeeded for
-- this role only because RLS did not apply will now be filtered or denied. **That is
-- corrected evidence, not a regression.** It is the boundary working. Any such change must be
-- recorded as a correction and must NOT be remedied by adding compensating broad grants —
-- where a verification genuinely needs to see across tenants, the DEF-019 pattern (a narrow
-- SECURITY DEFINER projection in `public`) serves it without a standing bypass.
--
-- PRIVILEGE REQUIRED TO APPLY. In PostgreSQL only a superuser may change the BYPASSRLS
-- attribute of a role. On Supabase the migration runner is typically `postgres`, which is NOT
-- a true superuser — `supabase_admin` is. **This migration may therefore fail with
-- insufficient_privilege (42501), and that is an expected outcome, not a defect in this
-- file.** It fails with an explicit, actionable message naming who must run it rather than a
-- bare permission error. If it cannot be applied by the migration runner, the ALTER must be
-- executed as `supabase_admin` (or via Supabase support) and this migration re-run to record
-- and verify the end state, at which point it becomes a no-op that still asserts the result.
--
-- SCOPE. One role attribute. No schema object, grant, policy, table or function is altered.
-- =====================================================================================

BEGIN;

DO $mig$
DECLARE
  v_exists  boolean;
  v_bypass  boolean;
  v_super   boolean;
  v_login   boolean;
BEGIN
  SELECT true, rolbypassrls, rolsuper, rolcanlogin
    INTO v_exists, v_bypass, v_super, v_login
  FROM pg_roles WHERE rolname = 'sandbox_exec';

  -- The role must exist. If it does not, this database is not the one the finding was
  -- raised against and the migration must not silently succeed.
  IF NOT coalesce(v_exists, false) THEN
    RAISE EXCEPTION
      'DEF-031 precondition failed: role "sandbox_exec" does not exist in this database. Confirm the target is production (project ref moxpdejnucjjcplleefn) before proceeding.';
  END IF;

  RAISE NOTICE 'DEF-031 pre-apply state: sandbox_exec rolbypassrls=%, rolsuper=%, rolcanlogin=%.',
    v_bypass, v_super, v_login;

  IF NOT v_bypass THEN
    -- Idempotent: the attribute is already correct, either because this migration has run
    -- or because it was applied out of band as supabase_admin. Verify and finish.
    RAISE NOTICE 'DEF-031: sandbox_exec already has rolbypassrls = false; nothing to change.';
  ELSE
    BEGIN
      EXECUTE 'ALTER ROLE sandbox_exec NOBYPASSRLS';
      RAISE NOTICE 'DEF-031: ALTER ROLE sandbox_exec NOBYPASSRLS executed.';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION
          'DEF-031 could not be applied: changing BYPASSRLS requires SUPERUSER, and the migration runner (current_user = %) does not hold it. On Supabase this ordinarily means the ALTER must be executed as supabase_admin. Run: ALTER ROLE sandbox_exec NOBYPASSRLS; then re-apply this migration to record and verify the end state. This is an expected outcome of the platform privilege model, not a fault in the migration.',
          current_user;
      WHEN OTHERS THEN
        RAISE EXCEPTION
          'DEF-031 could not be applied: ALTER ROLE sandbox_exec NOBYPASSRLS failed as % with SQLSTATE % (%).',
          current_user, SQLSTATE, SQLERRM;
    END;
  END IF;
END $mig$;

-- -------------------------------------------------------------------------------------
-- POST-ASSERTIONS — the end state is the point; a silent no-op would be worthless.
-- -------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_bypass boolean;
  v_login  boolean;
  v_super  boolean;
BEGIN
  SELECT rolbypassrls, rolcanlogin, rolsuper
    INTO v_bypass, v_login, v_super
  FROM pg_roles WHERE rolname = 'sandbox_exec';

  IF v_bypass THEN
    RAISE EXCEPTION 'DEF-031 post-assert failed: sandbox_exec still has rolbypassrls = true.';
  END IF;

  -- A bypass reintroduced by another route would defeat the repair just as completely.
  IF v_super THEN
    RAISE EXCEPTION
      'DEF-031 post-assert failed: sandbox_exec is SUPERUSER, which bypasses RLS regardless of rolbypassrls. The tenant boundary is still not enforced for this role.';
  END IF;

  -- Inherited membership of a bypassing or superuser role is the third route in.
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles child  ON child.oid  = m.member
    JOIN pg_roles parent ON parent.oid = m.roleid
    WHERE child.rolname = 'sandbox_exec'
      AND (parent.rolbypassrls OR parent.rolsuper)
  ) THEN
    RAISE EXCEPTION
      'DEF-031 post-assert failed: sandbox_exec is a member of a role that is SUPERUSER or has BYPASSRLS, so RLS is still bypassed by inheritance.';
  END IF;

  RAISE NOTICE 'DEF-031 post-assertions passed: sandbox_exec rolbypassrls=false, not superuser, no bypassing parent role. Tenant boundary now applies to this role (rolcanlogin=%).', v_login;
END $mig$;

COMMIT;