import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * DEF-030 — the invoice-creation capability check cannot currently refuse anyone, and must
 * be kept anyway.
 *
 * `public.can_create_invoices(_user_id, _org_id)` is `user_has_role_at_least(..., 'staff')`.
 * `organization_users_role_check` admits only owner/admin/staff, and all three are "at least
 * staff", so the branch inside the invoice-draft RPCs can never refuse a member. The DEF-001/002
 * verification logged that as an open question: is the role vocabulary too narrow, or is the
 * branch dead code?
 *
 * Owner ruling 2026-08-05: NEITHER — keep the branch as defence in depth.
 *
 * src/lib/permissions.ts is advisory. It decides what the UI offers; it cannot stop anyone
 * calling the RPC directly with a valid session. The database check is the only enforcement that
 * survives that, and it starts refusing the moment the capability is narrowed for any role.
 *
 * This file exists so a later "remove unreachable code" pass cannot quietly delete it. If you
 * are here because this test failed, read the ruling above before changing anything.
 */
const root = resolve(__dirname, "../../../");
const MIG_DIR = resolve(root, "supabase/migrations");

/** Every migration that defines one of the invoice-draft RPCs, oldest first. */
function definersOf(fn: string): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`).test(
        readFileSync(resolve(MIG_DIR, f), "utf8"),
      ),
    );
}

/** The body of `fn` as most recently defined in git — i.e. what LIVE should hold. */
function currentBody(fn: string): string {
  const owner = definersOf(fn).pop();
  expect(owner, `no migration defines ${fn}`).toBeDefined();
  const src = readFileSync(resolve(MIG_DIR, owner!), "utf8");
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  // Bodies in this repo are delimited by $function$ … $function$ or $$ … $$.
  const rest = src.slice(start);
  const end = rest.indexOf("$function$;");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("DEF-030 — the server-side capability check is retained", () => {
  for (const fn of ["create_invoice_draft_safe", "update_invoice_draft_safe"]) {
    it(`${fn} still calls can_create_invoices`, () => {
      const body = currentBody(fn);
      expect(
        body,
        `${fn} no longer calls public.can_create_invoices. Owner ruling 2026-08-05 requires this ` +
          `branch to stay: permissions.ts is advisory and cannot stop a direct RPC call, so this ` +
          `is the only enforcement that survives one. See the note above can_create_invoices in ` +
          `src/lib/permissions.ts.`,
      ).toMatch(/public\.can_create_invoices\(/);
    });

    it(`${fn} refuses with 42501 when the capability is absent`, () => {
      const body = currentBody(fn);
      expect(body).toMatch(/Permission denied: cannot (create|edit) invoices/);
      expect(body).toMatch(/42501/);
    });

    it(`${fn} checks organisation membership as well as capability`, () => {
      // The two are different questions. Membership is the tenancy boundary; capability is
      // what that member may do. Collapsing them would be the regression DEF-030 risks.
      const body = currentBody(fn);
      expect(body).toMatch(/user_in_organization|Access denied to organization/);
    });
  }

  it("the branch is bypassed only for an authorised portal caller", () => {
    // Both bodies skip the staff checks when portal_has_perm grants the portal capability.
    // That is deliberate (owner ruling 2026-07-30) and is not the branch DEF-030 is about.
    const body = currentBody("create_invoice_draft_safe");
    expect(body).toMatch(/portal_has_perm\(/);
    expect(body).toMatch(/IF NOT v_is_portal THEN/);
  });
});

describe("DEF-030 — why the check cannot currently refuse", () => {
  it("every role in the matrix holds can_create_invoices, which is why the branch is inert", () => {
    // This is the whole explanation. If this expectation ever fails, the capability has been
    // narrowed — and the server-side branch retained above immediately becomes load-bearing.
    expect([...PERMISSIONS.can_create_invoices].sort()).toEqual(["admin", "owner", "staff"]);
  });

  it("records that a narrower capability already exists, so narrowing is realistic", () => {
    // can_issue_invoices is owner+admin. The 3-role model does discriminate; can_create_invoices
    // simply is not one of the places it does. That is why the branch is defence in depth rather
    // than dead code.
    expect([...PERMISSIONS.can_issue_invoices].sort()).toEqual(["admin", "owner"]);
    expect(PERMISSIONS.can_issue_invoices.length).toBeLessThan(PERMISSIONS.can_create_invoices.length);
  });

  it("keeps the ruling discoverable from the permission definition itself", () => {
    const src = readFileSync(resolve(root, "src/lib/permissions.ts"), "utf8");
    expect(src).toMatch(/DEF-030/);
    expect(src).toMatch(/defence in depth/i);
  });
});
