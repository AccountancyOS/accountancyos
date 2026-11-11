import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { LEGACY_REF } from "../retired-identifiers";

/**
 * Single-project migration invariants (cutover B, 2026-11-11).
 *
 * `supabase/migrations/` rebuilds production (London, ezsvdsjdtardkxfswjvq) exactly. It starts with
 * ONE baseline — London's schema, storage, reference data and cron, dumped read-only and proven
 * locally to produce no schema diff against London (`supabase db diff --linked` empty, 628/628 ACLs,
 * 371/371 function definitions byte-identical). London's history table marks that baseline applied.
 *
 * What this guards:
 *   1. The pre-baseline history (supabase/migrations_archive/) is never applied — not by name, not by
 *      content — and the archive itself is never edited.
 *   2. The baseline is immutable: once London's history records it as applied, changing a byte of it
 *      would make git describe a database production does not have. Change the schema with a NEW
 *      migration instead.
 *   3. The baseline still has the shape that was verified against London.
 *   4. The London-only increments convention is closed: 001–006 are folded into the baseline.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");
const archiveDir = resolve(root, "supabase/migrations_archive");
const incDir = resolve(root, "docs/migration/london-increments");

const BASELINE = "20261111140000_london_baseline.sql";
// sha256 of the baseline exactly as verified against London and recorded as applied there.
const BASELINE_SHA256 = "153f2af4a79351845f37a4f2a20249f3c01bf00e26c3ec438788d7ee1146be6d";

const migrations = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const archived = readdirSync(archiveDir).filter((f) => f.endsWith(".sql"));
const baselineSql = readFileSync(resolve(migDir, BASELINE), "utf8");
const count = (re: RegExp) => (baselineSql.match(re) ?? []).length;

describe("supabase/migrations — one baseline, then forward migrations", () => {
  it("starts with exactly one London baseline, and it is the earliest migration", () => {
    expect(migrations.filter((f) => /_london_baseline\.sql$/.test(f))).toEqual([BASELINE]);
    expect(migrations[0]).toBe(BASELINE);
  });

  it("names every migration <14-digit version>_<snake_case>.sql, versions strictly increasing", () => {
    for (const f of migrations) expect(f, f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    const versions = migrations.map((f) => f.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe("supabase/migrations_archive — history, never applied", () => {
  it("still holds the 528 pre-baseline migrations and its README", () => {
    expect(archived.length).toBe(528);
    expect(readFileSync(resolve(archiveDir, "README.md"), "utf8")).toMatch(/NEVER applied/);
  });

  it("no archived migration appears in supabase/migrations by name", () => {
    expect(archived.filter((f) => migrations.includes(f))).toEqual([]);
  });

  it("no archived migration appears in supabase/migrations by content", () => {
    const archivedBodies = new Set(archived.map((f) => readFileSync(resolve(archiveDir, f), "utf8").trim()));
    const leaked = migrations.filter((f) => archivedBodies.has(readFileSync(resolve(migDir, f), "utf8").trim()));
    expect(leaked).toEqual([]);
  });

  it("no forward migration shares a version with the archive (the CLI would treat it as already known)", () => {
    const archivedVersions = new Set(archived.map((f) => f.slice(0, 14)));
    expect(migrations.filter((f) => archivedVersions.has(f.slice(0, 14)))).toEqual([]);
  });
});

describe("the baseline is London", () => {
  it("is byte-for-byte the baseline that was verified against London and marked applied there", () => {
    expect(createHash("sha256").update(baselineSql).digest("hex")).toBe(BASELINE_SHA256);
  });

  it("carries London's object counts", () => {
    expect(count(/^CREATE TABLE IF NOT EXISTS "public"\./gm)).toBe(226);
    expect(count(/^CREATE OR REPLACE FUNCTION "public"\./gm)).toBe(371);
    expect(count(/^CREATE POLICY .* ON "public"\./gm)).toBe(687);
    expect(count(/^CREATE OR REPLACE TRIGGER /gm)).toBe(155);
    expect(count(/^CREATE OR REPLACE VIEW "public"\./gm)).toBe(3);
    expect(count(/^CREATE TYPE "public"\./gm)).toBe(11);
  });

  it("carries London's storage (9 buckets, branding the only public one, 36 object policies)", () => {
    expect(count(/INSERT INTO storage\.buckets/g)).toBe(9);
    expect(count(/^CREATE POLICY .* ON storage\.objects/gm)).toBe(36);
    const publicRows = baselineSql.match(/VALUES \('([a-z0-9-]+)', '[a-z0-9-]+', true,/g) ?? [];
    expect(publicRows).toHaveLength(1);
    expect(publicRows[0]).toContain("branding");
  });

  it("carries the 14 reference-data tables and no tenant data", () => {
    const tables = new Set((baselineSql.match(/^INSERT INTO "public"\."([a-z_0-9]+)"/gm) ?? []));
    expect(tables.size).toBe(14);
    for (const t of ["organizations", "clients", "companies", "organization_users", "invoices", "email_queue"]) {
      expect(baselineSql, t).not.toMatch(new RegExp(`^INSERT INTO "public"\\."${t}"`, "m"));
    }
  });

  it("schedules London's 12 cron jobs, active only where both Vault secrets exist", () => {
    expect(count(/^SELECT cron\.schedule\(/gm)).toBe(12);
    expect(baselineSql).toMatch(/name IN \('cron_service_role_key', 'cron_shared_secret'\)/);
    expect(baselineSql).toMatch(/cron\.alter_job\(job_id := v_job\.jobid, active := v_provisioned\)/);
  });

  it("creates objects under built-in ACLs, so platform default privileges cannot widen grants", () => {
    const clear = baselineSql.indexOf("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS");
    const firstFn = baselineSql.search(/^CREATE OR REPLACE FUNCTION "public"\./m);
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(firstFn);
  });

  it("keeps increment 006's grants: no A1 function is granted to anon or PUBLIC", () => {
    for (const fn of [
      "post_to_ledger", "approve_invoice", "approve_bill", "record_invoice_payment", "record_bill_payment",
      "read_email_batch", "enqueue_email", "delete_email", "move_to_dlq", "lifecycle_send_back_onboarding",
      "public_complete_billing", "trigger_records_request", "get_trial_balance_from_ledger",
    ]) {
      expect(baselineSql, fn).not.toMatch(new RegExp(`GRANT ALL ON FUNCTION "public"\\."${fn}"\\([^;]*\\) TO "anon";`));
      expect(baselineSql, fn).not.toMatch(new RegExp(`GRANT ALL ON FUNCTION "public"\\."${fn}"\\([^;]*\\) TO PUBLIC;`));
    }
  });

  it("embeds no credential", () => {
    expect(baselineSql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(baselineSql).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/);
    expect(baselineSql).not.toMatch(/postgres:\/\/[^\s'"]{5,}/);
  });

  it("creates or alters no role, and never confers BYPASSRLS", () => {
    const code = baselineSql.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/\bCREATE\s+ROLE\b/i);
    expect(code).not.toMatch(/\bALTER\s+ROLE\b/i);
    expect(code).not.toMatch(/\bBYPASSRLS\b/i);
  });
});

describe("the London-only increments convention is closed", () => {
  it("holds exactly 001–006 (+ the read-only 006 verify) and nothing new", () => {
    const sql = existsSync(incDir) ? readdirSync(incDir).filter((f) => f.endsWith(".sql")).sort() : [];
    expect(sql).toEqual([
      "001_email_vocabulary_and_sender_classification.sql",
      "002_sender_identity_enforcement.sql",
      "003_email_send_log_rate_limited.sql",
      "004_protect_existing_system_rows.sql",
      "005_system_email_boundary_and_hold_state.sql",
      "006_security_containment.sql",
      "006_verify.sql",
    ]);
  });

  it("README declares the convention closed and folded into the baseline", () => {
    const readme = readFileSync(resolve(incDir, "README.md"), "utf8");
    expect(readme).toMatch(/CLOSED/);
    expect(readme).toContain(BASELINE);
  });
});

/* ---------------------------------------------------------------------------------------------
 * The historical London build artefacts (docs/migration/london-baseline/*, london-increments/*)
 * stay in the repo as the record of how London was built. They are no longer applied, but they
 * still must never carry a credential, data, a role grant, or the retired project — and they must
 * stay complete, because the cutover-B drift report was computed against them.
 * ------------------------------------------------------------------------------------------- */
const DOCS_BASELINE = resolve(root, "docs/migration/london-baseline/london-baseline.sql");

describe("London baseline — content safety", () => {
  const sql = existsSync(DOCS_BASELINE) ? readFileSync(DOCS_BASELINE, "utf8") : "";
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
  const sql = existsSync(DOCS_BASELINE) ? readFileSync(DOCS_BASELINE, "utf8") : "";
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

describe("London cron bootstrap", () => {
  const CRON = resolve(root, "docs/migration/london-baseline/london-cron.sql");
  const sql = existsSync(CRON) ? readFileSync(CRON, "utf8") : "";
  const code = sql.replace(/^\s*--.*$/gm, "");

  it("schedules twelve jobs", () => {
    expect((code.match(/cron\.schedule\(/g) ?? []).length).toBe(12);
  });

  it("embeds no credential — every job reads from Vault", () => {
    // Five legacy jobs carried a literal anon JWT in cron.job.command. None may here.
    const bodies: string[] = code.match(/\$cron\$[\s\S]*?\$cron\$/g) ?? [];
    expect(bodies.length).toBe(12);
    for (const b of bodies) {
      expect(b).toContain("vault.decrypted_secrets");
      expect(b).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      expect(b).not.toMatch(/app\.settings\./);
    }
  });

  it("uses the bearer mechanism for eleven jobs and x-cron-secret for exactly one", () => {
    // Established by reading every target function: 11 gate on Authorization == service-role
    // key; only truelayer-sync-scheduled gates on x-cron-secret.
    const bodies: string[] = code.match(/\$cron\$[\s\S]*?\$cron\$/g) ?? [];
    const bearer = bodies.filter((b) => b.includes("'Authorization', 'Bearer '"));
    const cronSecret = bodies.filter((b) => b.includes("'x-cron-secret'"));
    expect(bearer.length).toBe(11);
    expect(cronSecret.length).toBe(1);
    expect(cronSecret[0]).toContain("truelayer-sync-scheduled");
  });

  it("carries no legacy project reference and no live URL — placeholder only", () => {
    expect(code).not.toContain(LEGACY_REF);
    expect((code.match(/__LONDON_PROJECT_URL__/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });

  it("refuses to commit while a placeholder or a literal credential remains", () => {
    expect(sql).toMatch(/still contains the placeholder URL/);
    expect(sql).toMatch(/embeds a literal JWT/);
    expect(sql).toMatch(/app\.settings GUC pattern/);
    expect(code).toMatch(/^BEGIN;/m);
    expect(code).toMatch(/^COMMIT;/m);
  });

  it("refuses to apply unless both Vault secrets exist", () => {
    // A job that runs every minute and 401s every minute manufactures the appearance of a
    // working system — the legacy failure mode this replaces.
    expect(sql).toMatch(/vault secret "cron_service_role_key" is missing/);
    expect(sql).toMatch(/vault secret "cron_shared_secret" is missing/);
  });
});

describe("London baseline — placeholders that must be resolved before use", () => {
  const sql = existsSync(DOCS_BASELINE) ? readFileSync(DOCS_BASELINE, "utf8") : "";

  it("marks the two hard-coded project URLs as placeholders rather than carrying them over", () => {
    // email_queue_dispatch() and email_queue_wake() hard-coded the legacy function URL.
    // A silently-wrong URL would fail asynchronously and invisibly, so it is made loud.
    expect(sql).toContain("__LONDON_PROJECT_URL__");
    expect((sql.match(/__LONDON_PROJECT_URL__/g) ?? []).length).toBe(2);
  });
});

/**
 * Hygiene properties every London increment must hold.
 *
 * These were written for a parallel `forward-migrations/` directory that a subagent created
 * without noticing `london-increments/` already existed. Two competing conventions for the same
 * job is worse than either one, so the directory was deleted and the assertions folded in here.
 * The properties themselves are worth keeping — they encode what makes a migration safe to hand
 * to someone else to apply.
 */
describe("London increments — safety properties", () => {
  const incDir = resolve(root, "docs/migration/london-increments");
  const increments = existsSync(incDir)
    ? readdirSync(incDir).filter((f) => f.endsWith(".sql"))
    : [];
  const read = (f: string) => readFileSync(resolve(incDir, f), "utf8");

  it("has increments to check", () => {
    expect(increments.length).toBeGreaterThan(0);
  });

  it("declares London-only intent in every file", () => {
    for (const f of increments) {
      expect(read(f), `${f} must declare itself London-only`).toMatch(/LONDON ONLY/);
    }
  });

  it("wraps every increment in a single explicit transaction", () => {
    // A migration that half-applies is far worse than one that refuses: it leaves the database in
    // a state no file describes.
    for (const f of increments) {
      const src = read(f);
      expect(src, `${f} must open a transaction`).toMatch(/^BEGIN;$/m);
      expect(src, `${f} must commit`).toMatch(/^COMMIT;$/m);
      expect(
        (src.match(/^BEGIN;$/gm) ?? []).length,
        `${f} must use exactly one transaction`,
      ).toBe(1);
    }
  });

  it("gives every increment preconditions and post-assertions that abort", () => {
    // Preconditions stop a migration encoding a stale assumption; post-assertions stop it
    // reporting success it did not achieve. Both must RAISE, not warn.
    for (const f of increments) {
      const src = read(f);
      expect(src, `${f} needs preconditions`).toMatch(/DO \$pre\$/);
      expect(src, `${f} needs post-assertions`).toMatch(/DO \$post\$/);
      expect(src, `${f} assertions must abort`).toMatch(/RAISE EXCEPTION/);
    }
  });

  it("embeds no credential in any increment", () => {
    const secretish = [
      /\beyJ[A-Za-z0-9_-]{20,}/, // JWT
      /\bsb_secret_[A-Za-z0-9_-]{10,}/,
      /\bservice_role_key\s*=\s*['"][^'"]+['"]/i,
      /\bpassword\s*=\s*['"][^'"]+['"]/i,
    ];
    for (const f of increments) {
      const src = read(f);
      for (const pattern of secretish) {
        expect(pattern.test(src), `${f} appears to embed a credential (${pattern})`).toBe(false);
      }
    }
  });

  it("records every increment in the README's applied table", () => {
    // The README is the ledger. A migration applied but unrecorded is the untracked-state defect
    // this convention exists to prevent - it already happened once, when an increment went in via
    // execute_sql and left no schema_migrations row.
    const readme = readFileSync(resolve(incDir, "README.md"), "utf8");
    for (const f of increments) {
      expect(readme, `${f} is not recorded in the README ledger`).toContain(f);
    }
  });
});
