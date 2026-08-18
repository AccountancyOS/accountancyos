import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards on the London canonical baseline.
 *
 * The baseline is the whole application schema derived from the verified Lovable export. Two
 * things would be seriously damaging and both are cheap to prevent:
 *
 * 1. **It must never sit in `supabase/migrations/`.** The Lovable executor applies from that
 *    directory against the LEGACY project, which is still live. A 226-table baseline landing
 *    there would be run against the old database.
 * 2. **It must never carry a Lovable platform artefact onto the new project.** `sandbox_exec`
 *    carried BYPASSRLS on the legacy backend (DEF-031, reverted out of band three times); the
 *    legacy project ref would point the new project's functions at the dead backend.
 */
const root = resolve(__dirname, "../../../");
const BASELINE = resolve(root, "docs/migration/london-baseline/london-baseline.sql");
const LEGACY_REF = "moxpdejnucjjcplleefn";

describe("London baseline — placement", () => {
  it("is not in supabase/migrations/, where the executor would apply it to the legacy project", () => {
    const migDir = resolve(root, "supabase/migrations");
    const strays = readdirSync(migDir).filter((f) => /baseline/i.test(f));
    expect(strays).toEqual([]);
  });

  it("lives in the staging directory instead", () => {
    expect(existsSync(BASELINE)).toBe(true);
  });
});

describe("London baseline — content safety", () => {
  const sql = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";
  // Comments carry deliberate prose about what was excluded; only executable SQL is judged.
  const code = sql.replace(/^\s*--.*$/gm, "");

  it("creates or alters no role, and never grants to sandbox_exec", () => {
    expect(code).not.toMatch(/\bCREATE\s+ROLE\b/i);
    expect(code).not.toMatch(/\bALTER\s+ROLE\b/i);
    expect(code).not.toMatch(/sandbox_exec/);
  });

  it("never confers BYPASSRLS", () => {
    expect(code).not.toMatch(/BYPASSRLS/i);
  });

  it("carries no reference to the legacy project", () => {
    expect(code).not.toContain(LEGACY_REF);
  });

  it("contains no data — schema only", () => {
    expect(code).not.toMatch(/^COPY\s+/m);
    expect(code).not.toMatch(/^INSERT\s+INTO\s+/m);
  });

  it("declares no platform-schema object — Supabase provisions those", () => {
    expect(code).not.toMatch(
      /^(CREATE|ALTER)\s+(TABLE|FUNCTION|POLICY|INDEX|TYPE|VIEW|TRIGGER)\s+(auth|storage|realtime|pgmq|vault|extensions|graphql|graphql_public|pgbouncer|supabase_migrations)\./m,
    );
  });

  it("embeds no credential value", () => {
    expect(code).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // a real JWT, not a redaction pattern
    expect(code).not.toMatch(/\b(sk_live|sk_test|whsec_)[A-Za-z0-9]{10,}/);
    expect(code).not.toMatch(/postgres:\/\/[^\s'"]{5,}/);
  });
});

describe("London baseline — completeness against the independent live capture", () => {
  const sql = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";
  const count = (re: RegExp) => (sql.match(re) ?? []).length;

  // These figures were captured from the live legacy backend through a read-only connector
  // BEFORE the export existed, and agreed with the export exactly. They are the reconciliation
  // gate: if the baseline stops matching them, something was lost in derivation.
  it("carries all 226 tables with RLS enabled on every one", () => {
    expect(count(/^CREATE TABLE public\./gm)).toBe(226);
    expect(count(/ENABLE ROW LEVEL SECURITY/g)).toBe(226);
  });

  it("carries all 370 functions, 688 policies and 155 triggers", () => {
    expect(count(/^CREATE FUNCTION public\./gm)).toBe(370);
    expect(count(/^CREATE POLICY /gm)).toBe(688);
    expect(count(/^CREATE TRIGGER /gm)).toBe(155);
  });

  it("carries the 11 enum types and 3 views the connector could not read", () => {
    expect(count(/^CREATE TYPE public\./gm)).toBe(11);
    expect(count(/^CREATE VIEW public\./gm)).toBe(3);
  });
});

describe("London storage bootstrap", () => {
  const STORAGE = resolve(root, "docs/migration/london-baseline/london-storage.sql");
  const sql = existsSync(STORAGE) ? readFileSync(STORAGE, "utf8") : "";
  const code = sql.replace(/^\s*--.*$/gm, "");

  it("declares the nine real application buckets", () => {
    // Resolved from storage.buckets in the verified export on 2026-08-18. This contradicts
    // infra/supabase-manifest.json, which names four buckets that exist nowhere.
    for (const b of [
      "onboarding-documents", "questionnaire-files", "receipts", "filing-documents",
      "job-documents", "branding", "workpaper-files", "invoice-branding", "invoice-pdfs",
    ]) {
      expect(code).toContain(`'${b}'`);
    }
    expect((code.match(/INSERT INTO storage\.buckets/g) ?? []).length).toBe(9);
  });

  it("marks exactly one bucket public, and it is branding", () => {
    const publicRows = code.match(/VALUES \('([a-z0-9-]+)', '[a-z0-9-]+', true,/g) ?? [];
    expect(publicRows.length).toBe(1);
    expect(publicRows[0]).toContain("branding");
  });

  it("carries all 36 storage policies", () => {
    expect((code.match(/^CREATE POLICY /gm) ?? []).length).toBe(36);
  });

  it("excludes the export staging bucket, which is not an application bucket", () => {
    expect(code).not.toMatch(/INSERT INTO storage\.buckets[\s\S]{0,120}database_export_17_08_26/);
  });

  it("creates no storage object and reads no file metadata", () => {
    expect(code).not.toMatch(/INSERT INTO storage\.objects/i);
    expect(code).not.toMatch(/COPY storage\.objects/i);
  });

  it("is self-verifying and transactional", () => {
    expect(code).toMatch(/^BEGIN;/m);
    expect(code).toMatch(/^COMMIT;/m);
    expect(sql).toMatch(/RAISE EXCEPTION 'storage bootstrap failed/);
  });
});

describe("London baseline — placeholders that must be resolved before use", () => {
  const sql = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";

  it("marks the two hard-coded project URLs as placeholders rather than carrying them over", () => {
    // email_queue_dispatch() and email_queue_wake() hard-coded the legacy function URL.
    // A silently-wrong URL would fail asynchronously and invisibly, so it is made loud.
    expect(sql).toContain("__LONDON_PROJECT_URL__");
    expect((sql.match(/__LONDON_PROJECT_URL__/g) ?? []).length).toBe(2);
  });
});
