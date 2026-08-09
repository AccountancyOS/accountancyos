import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-033 — bank reconciliation has never worked.
 *
 * start_bank_reconciliation, complete_bank_reconciliation, reopen_bank_reconciliation and
 * revalue_bank_account_fx all close with an INSERT into bookkeeping_audit_log naming
 * client_id, company_id and performed_by (plus payload in the fourth). The table has none of
 * them, so every call raises 42703 and the whole statement rolls back. No reconciliation has
 * ever been started, completed or reopened; no FX revaluation has ever posted.
 *
 * Confirmed against LIVE, not inferred: `SELECT performed_by FROM bookkeeping_audit_log` and
 * `SELECT client_id FROM bookkeeping_audit_log` both return "column does not exist".
 *
 * Found statically by scripts/audit-phantom-columns.py, not by execution — same class as
 * DEF-027 and DEF-028, and like them invisible to runtime probing because an earlier error
 * masked it. Bank reconciliation appears nowhere in the launch-readiness defect register.
 */
const root = resolve(__dirname, "../../../");
const MIG_NAME = "20260806100000_def_033_bank_reconciliation_audit_columns.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${MIG_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const FUNCS = [
  "start_bank_reconciliation",
  "complete_bank_reconciliation",
  "reopen_bank_reconciliation",
  "revalue_bank_account_fx",
];

/** Just the audit-log INSERT column lists — the only thing this migration changes in a body. */
const auditInsertLists = [...CODE.matchAll(/INSERT INTO public\.bookkeeping_audit_log\s*\(([^)]*)\)/g)]
  .map((m) => m[1].replace(/\s+/g, " ").trim());

describe("DEF-033 — the repair", () => {
  it("re-issues exactly the four affected functions", () => {
    const created = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([...FUNCS].sort());
  });

  it("writes an audit row from every one of them", () => {
    expect(auditInsertLists).toHaveLength(4);
  });

  it("maps performed_by onto the existing actor_id rather than adding a rival column", () => {
    for (const list of auditInsertLists) {
      expect(list).toContain("actor_id");
      expect(list).not.toContain("performed_by");
    }
    // The shortcut this migration exists to avoid.
    expect(CODE).not.toMatch(/ADD COLUMN[^\n]*performed_by/i);
  });

  it("maps payload onto the existing metadata rather than adding a rival column", () => {
    for (const list of auditInsertLists) {
      expect(list).toContain("metadata");
      expect(list).not.toContain("payload");
    }
    expect(CODE).not.toMatch(/ADD COLUMN[^\n]*payload/i);
  });

  it("adds only the two columns that have no canonical home, nullable", () => {
    expect(CODE).toMatch(/ADD COLUMN IF NOT EXISTS client_id\s+uuid REFERENCES public\.clients\(id\)/);
    expect(CODE).toMatch(/ADD COLUMN IF NOT EXISTS company_id\s+uuid REFERENCES public\.companies\(id\)/);
    // Nullable: NOT NULL would fail on every existing row.
    expect(CODE).not.toMatch(/ADD COLUMN IF NOT EXISTS (client|company)_id[^,;]*NOT NULL/);
  });

  it("does not backfill — inventing a client dimension would fabricate audit history", () => {
    expect(CODE).not.toMatch(/UPDATE public\.bookkeeping_audit_log/i);
  });

  it("indexes the dimension it adds, since filtering by client is the whole point", () => {
    expect(CODE).toMatch(/CREATE INDEX IF NOT EXISTS bookkeeping_audit_log_client_idx/);
    expect(CODE).toMatch(/CREATE INDEX IF NOT EXISTS bookkeeping_audit_log_company_idx/);
  });

  it("changes nothing in the bodies beyond the audit INSERT", () => {
    // Each body must retain its own substance. A truncated re-issue would still satisfy the
    // column checks above, so assert the work each function actually does.
    expect(CODE).toMatch(/reconciliations/);
    expect(CODE).toMatch(/statement_start_date|p_statement_start_date/);
    expect(CODE).toMatch(/fx_revaluation/);
  });
});

describe("DEF-033 — reproduces before repairing, and asserts after", () => {
  const PRE = CODE.slice(0, CODE.indexOf("ALTER TABLE public.bookkeeping_audit_log"));
  const POST = CODE.slice(CODE.lastIndexOf("DO $mig$"));

  it("aborts if the columns it maps onto are missing", () => {
    expect(PRE).toMatch(/'organization_id','entity_type','entity_id','action','actor_id','metadata'/);
    expect(PRE).toMatch(/would not land/);
  });

  it("refuses to re-apply if the phantom columns already exist", () => {
    expect(PRE).toMatch(/already has performed_by and\/or payload/);
    expect(PRE).toMatch(/client_id already exists/);
  });

  it("aborts if any of the four functions has gone missing", () => {
    expect(PRE).toMatch(/does not exist/);
    for (const f of FUNCS) expect(PRE).toContain(f);
  });

  it("asserts every body was repaired, not merely that the columns exist", () => {
    expect(POST).toMatch(/still writes performed_by/);
    expect(POST).toMatch(/still writes payload/);
    expect(POST).toMatch(/does not write actor_id/);
    expect(POST).toMatch(/lost its audit-log write entirely/);
  });

  it("asserts the mapping was not bypassed by adding the phantom columns", () => {
    expect(POST).toMatch(/the mapping was bypassed/);
  });

  it("asserts exactly one signature each — no overload (the DEF-002 failure mode)", () => {
    expect(POST).toMatch(/signatures, expected exactly 1/);
  });

  it("is exactly one transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("alters no constraint, policy, trigger or grant", () => {
    expect(CODE).not.toMatch(/ADD CONSTRAINT|DROP CONSTRAINT/);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY/);
    expect(CODE).not.toMatch(/CREATE TRIGGER|DROP TRIGGER/);
    expect(CODE).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
  });
});

describe("DEF-033 — the detector that found it still catches it", () => {
  it("keeps the static sweep that made this findable", () => {
    // The defect was invisible to two execution harnesses and trivial to see statically.
    // If this script is deleted, the class becomes undetectable again.
    const sweep = readFileSync(resolve(root, "scripts/audit-phantom-columns.py"), "utf8");
    expect(sweep).toMatch(/insert_phantom_column/);
    expect(sweep).toMatch(/update_phantom_column/);
    // It must still replay the schema and check INSERT column lists against it — that pairing
    // is the whole detector. Matched on the source patterns, which are regexes, not literals.
    expect(sweep).toMatch(/INSERT\\s\+INTO/);
    expect(sweep).toMatch(/ADD\\s\+COLUMN/);
  });
});
