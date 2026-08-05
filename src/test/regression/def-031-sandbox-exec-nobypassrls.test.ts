import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-031 — the automated login role `sandbox_exec` bypassed RLS.
 *
 * `rolbypassrls = t` on a role with `rolcanlogin = t`, established from pg_roles on
 * 2026-08-05. RLS is the only mechanism enforcing the tenant boundary here, so that role
 * defeated tenancy wholesale for every session opened as it.
 *
 * Found while assessing a request to GRANT the role UPDATE on two tables. Checking the
 * premise first showed the grant would have extended a pre-existing bypass rather than
 * caused one, and the executor withdrew the request on that evidence.
 *
 * These guards protect the shape of the repair. The end state itself is asserted inside the
 * migration and again by the receipt's post_publish_verification.
 */
const root = resolve(__dirname, "../../../");
const MIG_NAME = "20260805200000_def_031_sandbox_exec_nobypassrls.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${MIG_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

describe("DEF-031 — the repair", () => {
  it("removes the bypass", () => {
    expect(CODE).toMatch(/ALTER ROLE sandbox_exec NOBYPASSRLS/);
  });

  it("changes nothing except that one role attribute", () => {
    // Owner ruling point 3: do not add compensating broad grants.
    expect(CODE).not.toMatch(/\bGRANT\b/);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/);
    expect(CODE).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/);
    expect(CODE).not.toMatch(/CREATE OR REPLACE FUNCTION|DROP FUNCTION/);
    expect(CODE).not.toMatch(/\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE\s+\w+\s+SET\b/i);
    // Exactly one role-altering STATEMENT. Other occurrences of "ALTER ROLE" are inside
    // error-message text telling an operator what to run, which is not executable.
    const executed = CODE.match(/EXECUTE\s+'ALTER ROLE[^']*'/g) ?? [];
    expect(executed).toHaveLength(1);
    expect(executed[0]).toBe("EXECUTE 'ALTER ROLE sandbox_exec NOBYPASSRLS'");
  });

  it("never grants the role a compensating privilege elsewhere", () => {
    // Guard the executable form. The words SUPERUSER and BYPASSRLS appear legitimately in
    // the post-assertions (which REFUSE a superuser role) and in operator guidance.
    const executed = CODE.match(/EXECUTE\s+'[^']*'/g) ?? [];
    for (const stmt of executed) {
      expect(stmt).not.toMatch(/\bSUPERUSER\b|\bCREATEROLE\b|\bCREATEDB\b|\bREPLICATION\b/);
      // The one direction that would undo the repair.
      expect(stmt).not.toMatch(/\bBYPASSRLS\b(?<!NOBYPASSRLS)/);
    }
  });
});

describe("DEF-031 — it cannot silently do nothing", () => {
  it("aborts if the role does not exist rather than succeeding vacuously", () => {
    expect(CODE).toMatch(/role "sandbox_exec" does not exist/);
    expect(CODE).toMatch(/moxpdejnucjjcplleefn/);
  });

  it("is idempotent when the attribute is already correct", () => {
    expect(CODE).toMatch(/already has rolbypassrls = false/);
  });

  it("fails legibly when the runner lacks SUPERUSER, which is the likely case", () => {
    // Only a superuser may change BYPASSRLS. On Supabase the migration runner is usually
    // `postgres`, which is not a true superuser — so this is an expected outcome and must
    // name who has to run it instead of surfacing a bare permission error.
    expect(CODE).toMatch(/WHEN insufficient_privilege THEN/);
    expect(CODE).toMatch(/requires SUPERUSER/);
    expect(CODE).toMatch(/supabase_admin/);
    expect(CODE).toMatch(/not a fault in the migration/);
  });

  it("reports the pre-apply state so the change is auditable", () => {
    expect(CODE).toMatch(/DEF-031 pre-apply state/);
  });
});

describe("DEF-031 — the end state is asserted, including the other routes in", () => {
  const POST = CODE.slice(CODE.lastIndexOf("DO $mig$"));

  it("asserts the bypass is gone", () => {
    expect(POST).toMatch(/still has rolbypassrls = true/);
  });

  it("asserts the role is not superuser, which would bypass RLS regardless", () => {
    // NOBYPASSRLS on a superuser is meaningless — superusers bypass row security anyway.
    expect(POST).toMatch(/is SUPERUSER, which bypasses RLS regardless/);
  });

  it("asserts no bypassing role is inherited", () => {
    // The third route in: membership of a role that is itself superuser or BYPASSRLS.
    expect(POST).toMatch(/pg_auth_members/);
    expect(POST).toMatch(/parent\.rolbypassrls OR parent\.rolsuper/);
    expect(POST).toMatch(/bypassed by inheritance/);
  });

  it("is exactly one transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });
});

describe("DEF-031 — the evidence correction is recorded, not lost", () => {
  it("states that sandbox_exec cross-tenant results proved grants, not RLS", () => {
    expect(MIG).toMatch(/prove grants and in-function RAISEs, not RLS/);
  });

  it("records precisely which evidence survives, so sound work is not re-run", () => {
    // Overstating the blast radius would trigger unnecessary re-verification.
    expect(MIG).toMatch(/smoke-test\.ts/);
    expect(MIG).toMatch(/signInWithPassword/);
    expect(MIG).toMatch(/rls-isolation-evidence\.md/);
    expect(MIG).toMatch(/DEF-015/);
    expect(MIG).toMatch(/remains evidenced/);
  });

  it("frames newly filtered operations as corrected evidence, not regressions", () => {
    // Owner ruling point 5.
    expect(MIG).toMatch(/corrected evidence, not a regression/);
    expect(MIG).toMatch(/must NOT be remedied by adding compensating broad grants/);
  });
});
