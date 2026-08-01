import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-015 — anonymous EXECUTE on privileged functions with no internal check.
 *
 * A SECURITY DEFINER function runs as its owner and bypasses RLS, so where `anon` may
 * call it AND its body checks nothing, there is no gate at all. The anon key ships in the
 * frontend bundle, so "reachable by anon" means reachable by anyone with developer tools.
 *
 * These are static guards over the migration. The behavioural proof — calling each with
 * the anon key and getting a permission error — is post-apply verification in the receipt.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const MIG_NAME = "20260801120000_def_015_revoke_anon_execute.sql";
const MIG = read(`supabase/migrations/${MIG_NAME}`);
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const names = (() => {
  const i = CODE.indexOf("v_names text[] := ARRAY[");
  const j = CODE.indexOf("];", i);
  return [...CODE.slice(i, j).matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
})();

describe("DEF-015 — the revoke set", () => {
  it("covers the enumerated functions", () => {
    expect(names.length).toBe(90);
    expect(new Set(names).size).toBe(90); // no duplicates
  });

  it("includes the functions the audit proved exposed", () => {
    // find_entities_by_email returned a real client record to the anon key with no session.
    expect(names).toContain("find_entities_by_email");
    expect(names).toContain("enqueue_email");
    // Included deliberately despite having a real internal check — see the migration header.
    expect(names).toContain("grant_person_portal_access");
  });

  /**
   * The invariant is not "no public_/portal_ prefix" — it is "nothing an anonymous page
   * calls". portal_user_has_entity_access carries the portal_ prefix but is a predicate
   * helper (it answers a question about a supplied user id, like can_manage_team) invoked
   * only by truelayer-auth and truelayer-sync with the SERVICE-ROLE key. Prefix is naming;
   * reachability is what breaks a journey.
   */
  it("touches nothing an anonymous page calls", () => {
    // Every RPC reachable from PublicQuoteView, PublicOnboarding, EngagementLetterPreview
    // and the portal. Each authorises on a token or portal permission and must stay
    // anon-callable, or the client-facing quote, onboarding and signing journeys break.
    const ANON_PAGE_RPCS = [
      "public_get_quote_by_token",
      "public_accept_quote_by_token",
      "public_reject_quote_by_token",
      "public_get_onboarding",
      "public_save_onboarding_details",
      "public_submit_onboarding_for_review",
      "public_preview_engagement_letter",
      "public_sign_engagement_letter",
      "public_sign_engagement_letter_by_token",
      "public_sign_engagement_letter_as_signatory",
      "public_get_engagement_letter_for_signing",
      "public_record_aml_upload",
      "public_skip_billing",
      "portal_approve_vat_return",
      "portal_categorise_transaction",
      "portal_explain_transaction",
      "portal_has_bookkeeping",
      "portal_list_ledger_accounts",
      "portal_send_message",
    ];
    for (const rpc of ANON_PAGE_RPCS) {
      expect(names, `${rpc} must keep its anon grant`).not.toContain(rpc);
    }
  });
});

describe("DEF-015 — how the revoke is applied", () => {
  it("revokes PUBLIC and anon while keeping authenticated and service_role", () => {
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION %s FROM anon/);
    expect(CODE).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role/);
    // Portal users are `authenticated`; edge functions use the service-role key.
  });

  it("resolves signatures from the catalog rather than transcribing them", () => {
    // oid::regprocedure covers every overload and cannot drift from the real signature.
    expect(CODE).toMatch(/p\.oid::regprocedure AS sig/);
    expect(CODE).toMatch(/p\.proname = ANY\(v_names\)/);
  });

  it("only ever touches SECURITY DEFINER, non-trigger functions", () => {
    expect(CODE).toMatch(/AND p\.prosecdef/);
    expect(CODE).toMatch(/p\.prorettype <> 'pg_catalog\.trigger'::regtype/);
  });

  it("leaves independent grantees such as sandbox_exec alone", () => {
    expect(CODE).not.toMatch(/FROM sandbox_exec/);
  });
});

describe("DEF-015 — the migration cannot half-apply or falsely succeed", () => {
  it("runs in one transaction", () => {
    expect(CODE).toMatch(/^BEGIN;/m);
    expect(CODE).toMatch(/^COMMIT;/m);
  });

  it("refuses to report success if it matched nothing", () => {
    expect(CODE).toMatch(/refusing to report success/);
  });

  it("verifies its own end state before COMMIT", () => {
    const verifyAt = CODE.indexOf("DEF-015 incomplete");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(CODE.lastIndexOf("COMMIT;"));
    // Both directions: anon must lose it, authenticated must keep it.
    expect(CODE).toMatch(/anon still holds EXECUTE on/);
    expect(CODE).toMatch(/broke staff access: authenticated lacks EXECUTE on/);
  });
});
