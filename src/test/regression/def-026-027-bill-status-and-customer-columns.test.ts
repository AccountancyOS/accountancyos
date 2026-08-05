import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BILL_STATUSES, CHECK_CONSTRAINT_REGISTRY } from "@/lib/db-constants/check-constraints";

/**
 * DEF-026 — bill approval violated bills_status_check (23514).
 * DEF-027 — customer creation inserted four columns that do not exist (42703).
 *
 * Both are pre-existing defects surfaced by the DEF-001/DEF-002 verification, not caused
 * by it. DEF-026 is a half-applied design change: 20251217171128 deliberately moved
 * approve_bill_safe to write APPROVED "(not AWAITING_PAYMENT)" and never widened the
 * constraint, so every approval since has failed.
 *
 * Static guards over the migration and the app-side vocabulary. The behavioural half —
 * that an approval and a customer create now succeed on LIVE — is delegated to the
 * executor in the receipt.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const MIG_NAME = "20260805110000_def_026_027_bill_status_and_customer_columns.sql";
const MIG = read(`supabase/migrations/${MIG_NAME}`);
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const CANONICAL = ["DRAFT", "APPROVED", "AWAITING_PAYMENT", "PART_PAID", "PAID", "OVERDUE", "VOIDED"];

describe("DEF-026 — bill status vocabulary", () => {
  it("widens the constraint to permit APPROVED", () => {
    const added = /ADD CONSTRAINT bills_status_check\s*\n?\s*CHECK \(status IN \(([^)]*)\)\)/.exec(CODE);
    expect(added, "the migration must add bills_status_check").not.toBeNull();
    for (const s of CANONICAL) {
      expect(added![1], `${s} must be permitted`).toContain(`'${s}'`);
    }
  });

  it("does not silently drop AWAITING_PAYMENT", () => {
    // Existing rows may hold it and every payment path treats it as equivalent to APPROVED.
    // Removing it would be an unannounced data migration.
    expect(CODE).toContain("'AWAITING_PAYMENT'");
  });

  it("keeps VOIDED and never reintroduces the retired VOID spelling", () => {
    const added = /ADD CONSTRAINT bills_status_check[\s\S]*?\)\);/.exec(CODE)![0];
    expect(added).toContain("'VOIDED'");
    expect(added).not.toMatch(/'VOID'/);
  });

  it("repairs the constraint rather than making approve_bill_safe write AWAITING_PAYMENT", () => {
    // The opposite fix would strand record_bill_payment_safe's APPROVED branch as dead code.
    expect(CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.approve_bill_safe/);
  });

  it("refuses to re-apply if APPROVED is already permitted", () => {
    expect(CODE).toMatch(/already permits APPROVED/);
  });

  it("proves no existing row falls outside the widened set before swapping the constraint", () => {
    const pre = CODE.slice(0, CODE.indexOf("DROP CONSTRAINT bills_status_check"));
    expect(pre).toMatch(/status NOT IN \('DRAFT','APPROVED','AWAITING_PAYMENT'/);
    expect(pre).toMatch(/RAISE EXCEPTION/);
  });
});

describe("DEF-026 — the app-side vocabulary is now covered", () => {
  it("registers bills_status_check in the drift registry", () => {
    const entry = CHECK_CONSTRAINT_REGISTRY.find((e) => e.constraint === "bills_status_check");
    expect(entry, "bills was absent from the registry, which is why this drifted unseen").toBeDefined();
    expect(entry!.table).toBe("bills");
    expect(entry!.column).toBe("status");
    expect([...entry!.values]).toEqual(CANONICAL);
  });

  it("exports a canonical BILL_STATUSES matching the migration exactly", () => {
    expect([...BILL_STATUSES]).toEqual(CANONICAL);
  });

  it("no longer compares the bills UI against the retired VOID spelling", () => {
    // Comments name the retired value deliberately; guard the executable code.
    const ui = read("src/components/bookkeeping/BillsTab.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(ui).not.toMatch(/["']VOID["']/);
    expect(ui).toMatch(/BILL_STATUSES/);
    // A voided or draft bill must not be offered a payment action.
    expect(ui).toMatch(/\["DRAFT", "PAID", "VOIDED"\]\.includes\(bill\.status\)/);
  });

  it("derives the bills UI status options from the registry rather than literals", () => {
    const ui = read("src/components/bookkeeping/BillsTab.tsx");
    expect(ui).toMatch(/BILL_STATUSES\.map/);
    // Every canonical status must be renderable — a missing label would crash the option.
    for (const s of CANONICAL) {
      expect(ui, `${s} needs a label`).toContain(`${s}:`);
    }
  });
});

describe("DEF-027 — customer columns", () => {
  it("adds only the two columns with no canonical home", () => {
    expect(CODE).toMatch(/ADD COLUMN IF NOT EXISTS company_name text/);
    expect(CODE).toMatch(/ADD COLUMN IF NOT EXISTS default_currency text/);
  });

  it("does NOT add a rival address column", () => {
    // customers already has address_line_1/2, city, postcode, country. A jsonb billing_address
    // beside them would give one customer's address two roots.
    expect(CODE).not.toMatch(/ADD COLUMN[^\n]*billing_address/);
    expect(CODE).not.toMatch(/ADD COLUMN[^\n]*internal_notes/);
  });

  it("decomposes the billing address onto the canonical columns", () => {
    for (const col of ["address_line_1", "address_line_2", "city", "postcode", "country"]) {
      expect(CODE, `${col} must be written`).toContain(col);
    }
    for (const key of ["line1", "line2", "city", "postcode", "country"]) {
      expect(CODE, `${key} must be read from the jsonb`).toContain(`'${key}'`);
    }
  });

  it("maps internal_notes onto the existing notes column", () => {
    expect(CODE).toMatch(/p_internal_notes/);
    // The INSERT column list must name `notes`, not `internal_notes`.
    const insert = /INSERT INTO public\.customers \(([\s\S]*?)\) VALUES/.exec(CODE);
    expect(insert).not.toBeNull();
    expect(insert![1]).toContain("notes");
    expect(insert![1]).not.toContain("internal_notes");
    expect(insert![1]).not.toContain("billing_address");
  });

  it("keeps the signature identical so the existing caller is unaffected", () => {
    const svc = read("src/lib/customer-safe-service.ts");
    for (const p of [
      "p_organization_id", "p_entity_type", "p_entity_id", "p_name", "p_email", "p_phone",
      "p_billing_address", "p_company_name", "p_vat_number", "p_payment_terms_days",
      "p_default_currency", "p_internal_notes",
    ]) {
      expect(CODE, `${p} must remain in the signature`).toContain(p);
      expect(svc, `${p} is sent by the caller`).toContain(p);
    }
    expect(CODE.match(/CREATE OR REPLACE FUNCTION public\.create_customer_safe/g)).toHaveLength(1);
  });

  it("preserves the DEF-001 context repair it inherits", () => {
    // This migration takes over create_customer_safe from 20260731210000. That family's
    // whole purpose was replacing the deleted set_rpc_context() helper with an inline
    // set_config. Re-authoring the body must not quietly undo it.
    const body = /CREATE OR REPLACE FUNCTION public\.create_customer_safe[\s\S]*?\$function\$;/.exec(CODE)![0];
    expect(body).toMatch(/PERFORM set_config\('app\.rpc', '1', true\)/);
    expect(body).not.toMatch(/set_rpc_context/);
  });

  it("validates entity_type, which the original never did", () => {
    expect(CODE).toMatch(/p_entity_type NOT IN \('client', 'company'\)/);
    expect(CODE).toMatch(/Invalid entity_type[\s\S]{0,120}22023/);
  });

  it("closes the cross-tenant write by checking the entity belongs to the organization", () => {
    expect(CODE).toMatch(/Entity does not belong to organization/);
    expect(CODE).toMatch(/FROM public\.clients[\s\S]{0,200}organization_id = p_organization_id/);
    expect(CODE).toMatch(/FROM public\.companies[\s\S]{0,200}organization_id = p_organization_id/);
  });

  it("restates privileges explicitly and grants nothing to anon", () => {
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.create_customer_safe[\s\S]*?FROM PUBLIC/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.create_customer_safe[\s\S]*?FROM anon/);
    expect(CODE).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_customer_safe[\s\S]*?TO authenticated, service_role/);
  });
});

describe("DEF-026/027 — transaction and self-verification", () => {
  it("is exactly one top-level transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("asserts its own end state before committing", () => {
    const post = CODE.slice(CODE.lastIndexOf("GRANT EXECUTE"));
    expect(post).toMatch(/post-assert failed/);
    expect(post).toMatch(/bills_status_check does not permit/);
    expect(post).toMatch(/customers\.company_name is absent/);
    expect(post).toMatch(/customers\.default_currency is absent/);
    expect(post).toMatch(/cross-tenant entity check is missing/);
    expect(post).toMatch(/entity_type validation is missing/);
  });

  it("asserts exactly one create_customer_safe signature survives", () => {
    expect(CODE).toMatch(/expected exactly one create_customer_safe signature/);
  });

  it("modifies no existing data and touches no policy, trigger or index", () => {
    // The INSERTs inside create_customer_safe are the function's own runtime behaviour, not
    // a data change made by the migration. Guard only migration-level statements — i.e.
    // everything outside the function body.
    const fnStart = CODE.indexOf("CREATE OR REPLACE FUNCTION public.create_customer_safe");
    const fnEnd = CODE.indexOf("$function$;") + "$function$;".length;
    const migrationLevel = CODE.slice(0, fnStart) + CODE.slice(fnEnd);

    expect(migrationLevel).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\s+/gm);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY/);
    expect(CODE).not.toMatch(/CREATE TRIGGER|DROP TRIGGER/);
    expect(CODE).not.toMatch(/CREATE INDEX|DROP INDEX/);
    // The only DDL on an existing table is the constraint swap and the two added columns.
    expect(CODE).not.toMatch(/DROP COLUMN|ALTER COLUMN/);
  });
});
