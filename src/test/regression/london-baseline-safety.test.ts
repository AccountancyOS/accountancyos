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

/**
 * Post-baseline increments are London-only for the same reason the baseline is: the legacy project
 * is still live and still serving users, and the Lovable executor applies whatever appears in
 * `supabase/migrations/`. Sender-identity routing exists only on London, so its schema must not be
 * pushed onto a project whose code cannot honour it.
 *
 * The divergence is deliberate and temporary — at cutover these fold into `supabase/migrations/`.
 * Until then this guard keeps "deliberate" from decaying into "drifted".
 */
describe("London increments — placement", () => {
  const incDir = resolve(root, "docs/migration/london-increments");
  const increments = existsSync(incDir)
    ? readdirSync(incDir).filter((f) => f.endsWith(".sql"))
    : [];
  const migDir = resolve(root, "supabase/migrations");
  const migrations = readdirSync(migDir).filter((f) => f.endsWith(".sql"));

  it("never copies an increment filename into supabase/migrations/", () => {
    const collisions = increments.filter((f) => migrations.includes(f));
    expect(collisions).toEqual([]);
  });

  it("never copies increment SQL into supabase/migrations/ under a different name", () => {
    // Renaming to a timestamp is exactly how an increment would slip past a name check, so the
    // real test is content: byte-identical SQL in the executor's directory is a leak.
    const incBodies = new Map(
      increments.map((f) => [readFileSync(resolve(incDir, f), "utf8").trim(), f]),
    );
    const leaked = migrations
      .map((f) => ({ f, src: incBodies.get(readFileSync(resolve(migDir, f), "utf8").trim()) }))
      .filter((x) => x.src)
      .map((x) => `${x.f} is a copy of ${x.src}`);
    expect(leaked).toEqual([]);
  });

  it("names increments so their apply order is unambiguous", () => {
    const misnamed = increments.filter((f) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(f));
    expect(misnamed).toEqual([]);
  });

  it("does not point an increment at the legacy project", () => {
    const offenders = increments.filter((f) =>
      readFileSync(resolve(incDir, f), "utf8").includes(LEGACY_REF),
    );
    expect(offenders).toEqual([]);
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

describe("London cron bootstrap", () => {
  const CRON = resolve(root, "docs/migration/london-baseline/london-cron.sql");
  const sql = existsSync(CRON) ? readFileSync(CRON, "utf8") : "";
  const code = sql.replace(/^\s*--.*$/gm, "");

  it("schedules twelve jobs", () => {
    expect((code.match(/cron\.schedule\(/g) ?? []).length).toBe(12);
  });

  it("embeds no credential — every job reads from Vault", () => {
    // Five legacy jobs carried a literal anon JWT in cron.job.command. None may here.
    const bodies = code.match(/\$cron\$[\s\S]*?\$cron\$/g) ?? [];
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
    const bodies = code.match(/\$cron\$[\s\S]*?\$cron\$/g) ?? [];
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
  const sql = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";

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
