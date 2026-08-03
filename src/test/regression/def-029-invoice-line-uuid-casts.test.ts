import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-029 — invoice draft lines cannot be saved (42804).
 *
 * A regression introduced by the DEF-001/DEF-002 family: the canonical bodies
 * insert NULLIF(v_line->>'vat_code_id','') and NULLIF(v_line->>'account_id','')
 * into uuid columns with no cast, so any draft carrying lines fails. Both
 * verification harnesses probed with an EMPTY lines array, on both sides, which
 * is why neither caught it — so the guard that matters most here is the one that
 * keeps a populated-lines payload in the picture.
 *
 * Static guards over the migration and its callers. The behavioural half needs
 * live fixtures and is listed in the receipt as the post-apply verification.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

const MIG_NAME = "20260803120000_def_029_invoice_line_uuid_casts.sql";
const MIG = read(`supabase/migrations/${MIG_NAME}`);
const CODE = stripComments(MIG);

const BODIES = ["create_invoice_draft_safe", "update_invoice_draft_safe"];

/**
 * The self-verifying DO block quotes the very strings the bodies are checked for
 * ('set_rpc_context', 'account_id is required'), so body assertions must look at
 * the function definitions alone or they count the assertion twice.
 */
const SPLIT = CODE.indexOf("DO $def029$");
const FN_CODE = CODE.slice(0, SPLIT);
const ASSERTION = CODE.slice(SPLIT);

describe("DEF-029 — the cast repair", () => {
  it("reissues both canonical invoice-draft bodies and nothing else", () => {
    for (const fn of BODIES) {
      expect(CODE).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    }
    const created = CODE.match(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g) ?? [];
    expect(created).toHaveLength(2);
  });

  it("casts both uuid columns in both bodies", () => {
    expect(CODE.match(/NULLIF\(v_line->>'vat_code_id', ''\)::uuid/g)).toHaveLength(2);
    expect(CODE.match(/NULLIF\(v_line->>'account_id', ''\)::uuid/g)).toHaveLength(2);
  });

  it("leaves no uncast NULLIF flowing into a uuid column — the defect itself", () => {
    for (const col of ["vat_code_id", "account_id"]) {
      // An occurrence not followed by ::uuid is the bug.
      const uncast = new RegExp(`NULLIF\\(v_line->>'${col}', ''\\)(?!::uuid)\\s*,`, "g");
      expect(FN_CODE.match(uncast)).toBeNull();
    }
  });

  it("validates the NOT NULL account_id rather than letting 42804 become 23502", () => {
    // invoice_lines.account_id is NOT NULL with no default; restoring the cast
    // alone would only move the failure, not fix it.
    expect(FN_CODE.match(/account_id is required/g)).toHaveLength(2);
    expect(FN_CODE.match(/account_id is not a valid identifier/g)).toHaveLength(2);
    expect(FN_CODE.match(/vat_code_id is not a valid identifier/g)).toHaveLength(2);
  });

  it("raises 22023 in the same shape as the sibling line validations", () => {
    const raises = FN_CODE.match(/account_id is required[\s\S]{0,80}?ERRCODE = '22023'/g) ?? [];
    expect(raises).toHaveLength(2);
  });

  it("invents no default nominal account — that is an accounting decision", () => {
    expect(CODE).not.toMatch(/COALESCE\([^)]*account_id[^)]*,\s*'[0-9a-f-]{36}'/i);
    expect(CODE).not.toMatch(/default_account|fallback_account/i);
  });

  it("validates before mutating in the update path, so a bad line destroys nothing", () => {
    const upd = CODE.slice(CODE.indexOf("CREATE OR REPLACE FUNCTION public.update_invoice_draft_safe("));
    const validation = upd.indexOf("account_id is required");
    const destruction = upd.indexOf("DELETE FROM invoice_lines");
    expect(validation).toBeGreaterThan(-1);
    expect(destruction).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(destruction);
  });
});

describe("DEF-029 — what the repair must not disturb", () => {
  it("keeps DEF-001 closed: no body reintroduces the deleted helper", () => {
    expect(FN_CODE).not.toMatch(/set_rpc_context/);
    expect(FN_CODE.match(/set_config\('app\.rpc'/g)).toHaveLength(2);
    // ...while the assertion deliberately checks the live catalogue for it.
    expect(ASSERTION).toMatch(/set_rpc_context/);
  });

  it("keeps DEF-002 closed: exactly two signatures, 14-arg create and 9-arg update", () => {
    expect(CODE).not.toMatch(/DROP FUNCTION/);
    expect(CODE).toMatch(/proname = 'create_invoice_draft_safe' AND p\.pronargs = 14/);
    expect(CODE).toMatch(/proname = 'update_invoice_draft_safe' AND p\.pronargs = 9/);
  });

  it("keeps DEF-015 closed: asserts anon did not regain EXECUTE", () => {
    expect(CODE).toMatch(/has_function_privilege\('anon'/);
    expect(CODE).toMatch(/anon regained EXECUTE/);
    // CREATE OR REPLACE preserves ACL, so the migration must not re-grant blindly.
    expect(CODE).not.toMatch(/GRANT[\s\S]{0,60}TO anon/i);
  });

  it("preserves EXECUTE for the roles that need it, sandbox_exec included", () => {
    for (const role of ["authenticated", "service_role", "sandbox_exec"]) {
      expect(CODE).toMatch(new RegExp(`has_function_privilege\\('${role}'`));
    }
  });
});

describe("DEF-029 — transaction and self-verification", () => {
  it("is exactly one top-level transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("asserts its end state in-transaction so a partial apply aborts", () => {
    expect(ASSERTION).toMatch(/an uncast NULLIF into a uuid column survived/);
    expect(ASSERTION).toMatch(/the account_id validation is missing from a body/);
    // The whole assertion must sit inside the transaction, ahead of COMMIT.
    expect(ASSERTION.indexOf("RAISE EXCEPTION")).toBeGreaterThan(-1);
    expect(ASSERTION.indexOf("RAISE EXCEPTION")).toBeLessThan(ASSERTION.indexOf("COMMIT;"));
  });
});

describe("DEF-029 — the app-side half", () => {
  const DIALOG = read("src/components/bookkeeping/InvoiceEditorDialog.tsx");
  const SERVICE = read("src/lib/invoice-draft-service.ts");

  it("blocks a save when a line has no account, naming the line", () => {
    expect(DIALOG).toMatch(/findIndex\(\(line\) => !line\.account_id\)/);
    expect(DIALOG).toMatch(/choose an account before saving/);
  });

  it("still sends '' rather than omitting the key, which is what the RPC validates", () => {
    // If this stops being true the migration's NULLIF(...,'') guard needs revisiting.
    expect(SERVICE).toMatch(/account_id: line\.account_id \|\| ''/);
    expect(SERVICE).toMatch(/vat_code_id: line\.vat_code_id \|\| ''/);
  });
});
