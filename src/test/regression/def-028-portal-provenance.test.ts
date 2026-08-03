import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-028 — every portal bookkeeping write fails with 42703.
 *
 * stamp_portal_provenance() read a contact id off portal_access, a column that
 * has never existed. The function returns early for non-portal callers, so only
 * portal users ever reached the broken statement — which is why it survived from
 * 20260608112113 until the DEF-001/002 verification tripped over it.
 *
 * Static guards over the migration. The behavioural half needs a portal session
 * and is listed in the receipt as the post-apply verification.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const MIG_NAME = "20260803140000_def_028_portal_provenance_contact_link.sql";
const MIG = read(`supabase/migrations/${MIG_NAME}`);
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const SPLIT = CODE.indexOf("DO $def028$");
const FN_CODE = CODE.slice(0, SPLIT);
const ASSERTION = CODE.slice(SPLIT);

describe("DEF-028 — the repair", () => {
  it("reissues only stamp_portal_provenance", () => {
    expect(CODE).toMatch(/CREATE OR REPLACE FUNCTION public\.stamp_portal_provenance\(\)/);
    expect(CODE.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
  });

  it("removes the impossible lookup — the defect itself", () => {
    // Matched on the executable statement: the table is still named in comments.
    expect(FN_CODE).not.toMatch(/INTO v_contact FROM/);
    expect(FN_CODE).not.toMatch(/SELECT\s+contact_id\s+INTO/);
  });

  it("leaves v_contact explicitly NULL rather than deleting the concept", () => {
    expect(FN_CODE).toMatch(/v_contact := NULL;/);
    // The COALESCE must survive so an explicitly supplied value still wins.
    expect(FN_CODE.match(/COALESCE\(NEW\.created_by_contact_id, v_contact\)/g)).toHaveLength(2);
  });

  it("never guesses identity by email or name", () => {
    expect(FN_CODE).not.toMatch(/FROM public\.contacts/);
    expect(FN_CODE).not.toMatch(/email\s*=\s*|ILIKE|lower\(\s*name/i);
  });

  it("marks unresolved attribution in the audit trail instead of a silent NULL", () => {
    expect(FN_CODE).toMatch(/contact_attribution/);
    expect(FN_CODE).toMatch(/unresolved_no_portal_contact_link/);
  });

  it("keeps every other responsibility of the trigger", () => {
    for (const kept of [
      "is_portal_user",
      "portal_visibility_settings",
      "bookkeeping_audit_log",
      "created_by_portal",
      "updated_by_portal",
      "pending_review",
      "created_by_contact_id",
    ]) {
      expect(FN_CODE).toContain(kept);
    }
    // The early return for accountant writes must stay — it is why staff writes work.
    expect(FN_CODE).toMatch(/IF NOT v_is_portal THEN[\s\S]{0,80}RETURN NEW;/);
  });
});

describe("DEF-028 — transaction and self-verification", () => {
  it("is exactly one top-level transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("asserts the lookup is gone, on the statement rather than the table name", () => {
    expect(ASSERTION).toMatch(/INTO v_contact FROM/);
    expect(ASSERTION).toMatch(/the impossible contact lookup survived/);
  });

  it("asserts the body was repaired, not truncated", () => {
    expect(ASSERTION).toMatch(/lost functionality it must keep/);
    for (const kept of ["bookkeeping_audit_log", "portal_visibility_settings", "created_by_contact_id"]) {
      expect(ASSERTION).toContain(kept);
    }
  });

  it("asserts all four trigger attachments survive and stay enabled", () => {
    expect(ASSERTION).toMatch(/tgenabled <> 'D'/);
    expect(ASSERTION).toMatch(/v_triggers <> 4/);
    expect(ASSERTION).toMatch(/NOT t\.tgisinternal/);
  });

  it("does not touch the triggers themselves", () => {
    expect(CODE).not.toMatch(/CREATE TRIGGER|DROP TRIGGER|ALTER TABLE/);
  });
});
