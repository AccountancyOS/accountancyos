import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-001 + DEF-002 — the atomic repair family.
 *
 * These are static guards over the migration and its callers. The behavioural half
 * (executing each RPC as staff, as portal, as anon, as a member lacking the capability)
 * requires the live fixtures approved in Phase 0 §4 of the audit and is listed in the
 * receipt as the post-apply verification — it is deliberately not faked here.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const readCode = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");

const MIG_NAME = "20260731210000_def_001_002_rpc_context_and_invoice_draft.sql";
const MIG = read(`supabase/migrations/${MIG_NAME}`);
const CODE = readCode(`supabase/migrations/${MIG_NAME}`);

/** The eight functions the LIVE sweep and pg_proc both evidenced as broken. */
const REPAIRED = [
  "create_automation_rule_safe",
  "update_automation_rule_safe",
  "toggle_automation_rule_safe",
  "delete_automation_rule_safe",
  "approve_bill_safe",
  "void_bill_safe",
  "record_bill_payment_safe",
  "create_customer_safe",
];

describe("DEF-001 — the eight repairs", () => {
  it("repairs exactly the eight evidenced functions, no padding to ten", () => {
    for (const fn of REPAIRED) {
      expect(CODE).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    }
    // Functions the live bodies proved healthy must NOT be reissued here.
    for (const healthy of [
      "queue_email_safe",
      "issue_invoice_safe",
      "void_invoice_safe",
      "create_bill_draft_safe",
      "record_invoice_payment_safe",
      "update_bill_draft_safe",
    ]) {
      expect(CODE).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${healthy}\\(`));
    }
  });

  it("removes every call to the deleted helper", () => {
    expect(CODE).not.toMatch(/PERFORM\s+public\.set_rpc_context\s*\(/);
  });

  it("uses the same inline context call as the already-healthy functions", () => {
    const inlined = CODE.match(/PERFORM set_config\('app\.rpc', '1', true\);/g) ?? [];
    // Eight repairs plus the two canonical invoice-draft functions.
    expect(inlined.length).toBe(10);
  });

  it("introduces no replacement shared helper", () => {
    expect(CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(set|is)_rpc_context/);
  });
});

describe("DEF-002 — canonical signatures", () => {
  it("creates the canonical 9-argument update", () => {
    expect(CODE).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_invoice_draft_safe\([\s\S]*?p_invoice_id uuid[\s\S]*?p_contact_email text[\s\S]*?p_notes text[\s\S]*?p_lines jsonb/,
    );
  });

  it("drops superseded overloads by complete signature, never by name", () => {
    expect(CODE).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_invoice_draft_safe\(\s*uuid, text, uuid, text, uuid, text, text, text, date, date, text, text, jsonb\)/,
    );
    expect(CODE).toMatch(
      /DROP FUNCTION IF EXISTS public\.update_invoice_draft_safe\(\s*uuid, uuid, text, text, date, date, text, jsonb\)/,
    );
    expect(CODE).toMatch(
      /DROP FUNCTION IF EXISTS public\.update_invoice_draft_safe\(\s*uuid, uuid, text, text, text, text, text, jsonb\)/,
    );
    // A bare name drop would take the canonical with it.
    expect(CODE).not.toMatch(/DROP FUNCTION IF EXISTS public\.\w+;/);
  });

  it("drops only AFTER both canonical functions are created", () => {
    const firstDrop = CODE.indexOf("DROP FUNCTION");
    expect(CODE.indexOf("CREATE OR REPLACE FUNCTION public.create_invoice_draft_safe(")).toBeLessThan(firstDrop);
    expect(CODE.indexOf("CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(")).toBeLessThan(firstDrop);
  });

  it("adds no compatibility wrapper", () => {
    // Resolution works through parameter defaults; a wrapper would be a second home for
    // authorisation logic to drift, which is how DEF-002 arose.
    expect(CODE).not.toMatch(/_legacy|_compat|_v1\b/);
  });

  it("keeps the portal capability on both canonical functions", () => {
    const portal = CODE.match(/portal_has_perm\(/g) ?? [];
    expect(portal.length).toBeGreaterThanOrEqual(2);
    expect(CODE).toMatch(/allow_invoice_create/);
  });

  it("enforces the cross-tenant relationship checks", () => {
    expect(CODE).toMatch(/Entity does not belong to organization/);
    const customerCheck = CODE.match(/Customer does not belong to organization/g) ?? [];
    expect(customerCheck.length).toBe(2); // create and update
  });

  it("validates every line before deleting any", () => {
    const del = CODE.indexOf("DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id");
    const validate = CODE.indexOf("v_validated_lines := array_append");
    expect(validate).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(del);
  });

  it("raises rather than returning success:false on the canonical update", () => {
    const upd = CODE.slice(CODE.indexOf("CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe("));
    expect(upd).toMatch(/RAISE EXCEPTION 'Invoice not found'/);
    expect(upd).not.toMatch(/'success', false, 'error', 'Invoice not found'/);
  });

  it("maintains remaining_balance", () => {
    expect(CODE).toMatch(/remaining_balance = v_total_gross - COALESCE\(amount_paid, 0\)/);
  });

  it("documents the intentional capability tightening", () => {
    expect(MIG).toMatch(/INTENTIONAL TIGHTENING/);
    expect(CODE).toMatch(/can_create_invoices\(v_user_id, v_invoice\.organization_id\)/);
  });
});

describe("ownership and privileges are explicit", () => {
  it("revokes PUBLIC and anon and grants only the intended roles", () => {
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION %s FROM anon/);
    expect(CODE).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role/);
    expect(CODE).toMatch(/ALTER FUNCTION %s OWNER TO postgres/);
  });

  it("covers every created or replaced signature, in full", () => {
    const block = CODE.slice(CODE.indexOf("v_sigs text[] := ARRAY["));
    for (const fn of REPAIRED) expect(block).toContain(`public.${fn}(`);
    expect(block).toContain("public.create_invoice_draft_safe(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb)");
    expect(block).toContain("public.update_invoice_draft_safe(uuid,uuid,text,text,text,text,text,text,jsonb)");
  });

  it("never revokes sandbox_exec", () => {
    // Executor infrastructure — this repair tightens PUBLIC and anon only.
    expect(CODE).not.toMatch(/REVOKE[\s\S]{0,60}sandbox_exec/);
  });

  /**
   * The 9-argument update is a NEW signature: it has no historical ACL, so "untouched"
   * would leave executor infrastructure able to create an invoice draft but not update
   * one. Both canonical signatures must state the grant.
   */
  it("grants sandbox_exec EXECUTE on both canonical invoice-draft signatures", () => {
    expect(CODE).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_invoice_draft_safe\(\s*uuid, text, uuid, text, uuid, text, text, text, text, text, text, text, text, jsonb\s*\) TO sandbox_exec;/,
    );
    expect(CODE).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.update_invoice_draft_safe\(\s*uuid, uuid, text, text, text, text, text, text, jsonb\s*\) TO sandbox_exec;/,
    );
  });

  /**
   * Atomicity cannot rest on the executor: its wrapping behaviour is not introspectable
   * and DEF-020/023 record that it departs from convention. The file wraps itself.
   */
  it("wraps the whole forward migration in exactly one transaction", () => {
    const begins = (CODE.match(/^BEGIN;$/gm) ?? []).length;
    const commits = (CODE.match(/^COMMIT;$/gm) ?? []).length;
    expect(begins).toBe(1);
    expect(commits).toBe(1);
    expect(CODE.indexOf("BEGIN;")).toBeLessThan(CODE.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(CODE.lastIndexOf("COMMIT;")).toBeGreaterThan(CODE.lastIndexOf("GRANT EXECUTE"));
    // Nothing that is forbidden inside a transaction block.
    expect(CODE).not.toMatch(/CREATE INDEX CONCURRENTLY|\bVACUUM\b|ALTER TYPE[\s\S]{0,40}ADD VALUE|ALTER SYSTEM/);
  });
});

describe("release hygiene", () => {
  /**
   * The two invoice-draft bodies were handed on to DEF-029 (20260803120000), which
   * repaired the missing ::uuid casts this family introduced. Ownership is asserted
   * against whichever migration is the last definer — never pinned to this file —
   * because the executor re-timestamps migrations and filename ownership was never
   * a stable identity.
   */
  const HANDED_ON: Record<string, string> = {
    create_invoice_draft_safe: "20260803120000_def_029_invoice_line_uuid_casts.sql",
    update_invoice_draft_safe: "20260803120000_def_029_invoice_line_uuid_casts.sql",
  };

  /**
   * Ownership is content-addressed, not filename-addressed.
   *
   * The executor re-applies our migrations under its own timestamp, so the last file
   * to define a function is routinely an executor duplicate that sorts after the
   * migration we authored — e.g. DEF-029's 20260803120000 was re-applied as
   * 20260803203957_844d5cc7…, which is byte-identical bar a trailing newline.
   * Pinning this assertion to a filename therefore fails on every faithful re-apply,
   * which is noise, and it would equally pass a *renamed* file whose contents drifted,
   * which is the actual risk (DEF-023).
   *
   * So: the last definer is accepted when it is the declared owner, OR when it is a
   * verbatim copy of the declared owner. A later definer whose contents differ is a
   * genuine unrecorded takeover and still fails.
   */
  const normalise = (s: string) => s.replace(/[ \t]+$/gm, "").trimEnd();

  it("owns the live body of every function it reissues, or records who took it over", () => {
    const migDir = resolve(root, "supabase/migrations");
    const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    for (const fn of [...REPAIRED, "create_invoice_draft_safe", "update_invoice_draft_safe"]) {
      const definers = files.filter((f) =>
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`).test(readFileSync(resolve(migDir, f), "utf8")),
      );
      const owner = definers.pop();
      const declared = HANDED_ON[fn] ?? MIG_NAME;
      if (owner === declared) continue;

      const ownerSrc = normalise(readFileSync(resolve(migDir, owner!), "utf8"));
      const declaredSrc = normalise(readFileSync(resolve(migDir, declared), "utf8"));
      expect(
        ownerSrc,
        `${fn} has an unrecorded later definer: ${owner} sorts after the declared owner ${declared} and its contents DIFFER. ` +
          `If the executor re-applied it, the copy must be verbatim; if this is a real handover, record it in HANDED_ON.`,
      ).toBe(declaredSrc);
    }
  });

  it("ships a rollback that warns what reverting restores", () => {
    const rb = read("docs/releases/rollback/2026-07-31-def-001-002-rollback.sql");
    expect(rb).toMatch(/ROLLING BACK RESTORES BROKEN AND WEAKER BEHAVIOUR/);
    expect(rb).toMatch(/42883/);
    expect(rb).toMatch(/Cross-tenant relationship checks are lost/);
    // Rollback must not live where it could be applied as a migration.
    expect(() => read("supabase/migrations/2026-07-31-def-001-002-rollback.sql")).toThrow();
  });

  /**
   * A rollback that tells an operator to paste historical bodies is not a rollback. It
   * must run as-is: every superseded definition embedded verbatim, the whole thing atomic.
   */
  it("ships a rollback that is self-contained and executable", () => {
    const rb = read("docs/releases/rollback/2026-07-31-def-001-002-rollback.sql");
    const code = rb.replace(/^\s*--.*$/gm, "");

    // 8 reverted bodies + 3 recreated superseded signatures + 1 restored 14-arg create.
    expect((code.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(12);
    // Every one of the eight goes back to calling the deleted helper.
    expect((code.match(/PERFORM public\.set_rpc_context\(\);/g) ?? []).length).toBe(8);
    // The new canonical update is removed, by complete signature.
    expect(code).toMatch(
      /DROP FUNCTION IF EXISTS public\.update_invoice_draft_safe\(\s*uuid, uuid, text, text, text, text, text, text, jsonb\)/,
    );
    // All-or-nothing.
    expect(code).toMatch(/^BEGIN;/m);
    expect(code).toMatch(/^COMMIT;/m);
    // No human in the loop.
    expect(rb).not.toMatch(/OPERATOR STEP/);
    expect(rb).toMatch(/SELF-CONTAINED AND EXECUTABLE/);
    // Recreates BEFORE the drop, so update is never unresolvable.
    expect(code.indexOf("CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe(p_invoice_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_reference text"))
      .toBeLessThan(code.indexOf("DROP FUNCTION"));
  });

  /**
   * A partial rollback must abort itself. Verification AFTER commit cannot do that — it
   * would leave a half-reverted database, which is worse than either the pre- or the
   * post-migration state.
   */
  it("verifies its own end state before committing", () => {
    const rb = read("docs/releases/rollback/2026-07-31-def-001-002-rollback.sql");
    const code = rb.replace(/^\s*--.*$/gm, "");

    const verifyAt = code.indexOf("Rollback incomplete");
    const commitAt = code.lastIndexOf("COMMIT;");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(commitAt);

    // Each assertion aborts rather than merely reporting.
    expect((code.match(/RAISE EXCEPTION 'Rollback incomplete/g) ?? []).length).toBeGreaterThanOrEqual(5);
    // The four things that define a complete revert.
    expect(code).toMatch(/reference set_rpc_context, expected 8/);
    expect(code).toMatch(/invoice-draft overload\(s\) present, expected 4/);
    expect(code).toMatch(/9-argument update_invoice_draft_safe still exists/);
    expect(code).toMatch(/PUBLIC EXECUTE not restored/);
    expect(code).toMatch(/anon EXECUTE not restored/);
  });
});
