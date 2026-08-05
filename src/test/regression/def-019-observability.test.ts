import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-019 (foundation) — make cron health and HTTP delivery queryable.
 *
 * The executor reported on 2026-08-05 that `cron.job_run_details` and
 * `vault.decrypted_secrets` are permission-denied to its psql role. The reviewing party's
 * connector exposes only `public` and cannot reach them either. So the DEF-018 evidence gate
 * — which queried those relations directly — could never have passed for anyone.
 *
 * That same inaccessibility is why DEF-018 survived: 26,208 consecutive failures over a week,
 * in a table no party in this toolchain can read.
 *
 * These guards exist to stop the projections becoming a leak. They are read-only by
 * construction, and the two things that would make them dangerous are returning response
 * bodies and being anon-executable — the second being the exact defect DEF-015 closed across
 * 90 functions.
 */
const root = resolve(__dirname, "../../../");
const MIG_NAME = "20260805160000_def_019_cron_and_delivery_observability.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${MIG_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const FUNCTIONS = [
  "redact_secrets",
  "mcp_cron_job_health",
  "mcp_http_delivery_health",
  "mcp_vault_secret_present",
];

describe("DEF-019 — the projections are read-only", () => {
  it("creates exactly the four intended functions and nothing else", () => {
    const created = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([...FUNCTIONS].sort());
  });

  it("writes nothing, anywhere", () => {
    expect(CODE).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(CODE).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(CODE).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("alters no existing object", () => {
    expect(CODE).not.toMatch(/ALTER TABLE|DROP TABLE|DROP FUNCTION/i);
    expect(CODE).not.toMatch(/CREATE TRIGGER|DROP TRIGGER/i);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY/i);
    expect(CODE).not.toMatch(/cron\.schedule|cron\.unschedule/i);
  });
});

describe("DEF-019 — nothing leaks", () => {
  it("never returns HTTP response bodies or headers", () => {
    // These carry response payloads and echoed Authorization headers. Status codes answer
    // "was the call accepted" completely; bodies answer far more than that.
    expect(CODE).not.toMatch(/\bcontent_type\b/);
    expect(CODE).not.toMatch(/'content'/);
    expect(CODE).not.toMatch(/'headers'/);
    expect(CODE).not.toMatch(/\bheaders\b\s*,/);
  });

  it("passes every free-text field through redaction", () => {
    // return_message and error_msg are the two free-text fields exposed. A failing
    // net.http_post can echo its own bearer token into either.
    expect(CODE).toMatch(/redact_secrets\(\s*\n?\s*\(ARRAY_AGG\(d\.return_message/);
    expect(CODE).toMatch(/public\.redact_secrets\(s\.error_msg\)/);
  });

  it("redacts JWT-shaped strings and credential assignments", () => {
    expect(CODE).toMatch(/eyJ\[A-Za-z0-9_-\]/);
    expect(CODE).toMatch(/bearer\|apikey/i);
    expect(CODE).toContain("[REDACTED-JWT]");
  });

  it("proves the redaction works before committing, rather than merely defining it", () => {
    // A redaction that silently stops matching is worse than none, because the output still
    // looks sanitised. The migration runs a real JWT shape through it and aborts if it survives.
    const post = CODE.slice(CODE.lastIndexOf("DO $mig$"));
    expect(post).toMatch(/redact_secrets\('Bearer eyJ/);
    expect(post).toMatch(/did not strip a JWT/);
  });

  it("never returns a vault secret value", () => {
    const fn = /CREATE OR REPLACE FUNCTION public\.mcp_vault_secret_present[\s\S]*?\$\$;/.exec(CODE)![0];
    expect(fn).toMatch(/RETURNS boolean/);
    expect(fn).toMatch(/RETURN v_secret IS NOT NULL AND length\(btrim\(v_secret\)\) > 0/);
    // The value must never reach the caller by any path.
    expect(fn).not.toMatch(/RETURN v_secret;/);
    expect(fn).not.toMatch(/RETURNS text/);
  });

  it("distinguishes an unreadable vault from a missing secret", () => {
    const fn = /CREATE OR REPLACE FUNCTION public\.mcp_vault_secret_present[\s\S]*?\$\$;/.exec(CODE)![0];
    // Returning false when the vault itself is unreadable would read as "secret absent"
    // and could send someone to create a duplicate.
    expect(fn).toMatch(/is not readable even as the function owner/);
  });
});

describe("DEF-019 — DEF-015 and DEF-005 are not reintroduced", () => {
  for (const fn of FUNCTIONS) {
    it(`${fn} revokes PUBLIC and anon and grants only the intended roles`, () => {
      expect(CODE).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC`));
      expect(CODE).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(CODE).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated, service_role`),
      );
    });
  }

  it("pins search_path on every function", () => {
    const defs = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.\w+[\s\S]*?AS \$\$/g)].map((m) => m[0]);
    expect(defs).toHaveLength(FUNCTIONS.length);
    for (const d of defs) expect(d).toMatch(/SET search_path =/);
  });

  it("asserts the grant posture live before committing", () => {
    const post = CODE.slice(CODE.lastIndexOf("DO $mig$"));
    expect(post).toMatch(/has_function_privilege\('anon'/);
    expect(post).toMatch(/anon holds EXECUTE/);
    expect(post).toMatch(/SECURITY DEFINER without a pinned search_path/);
  });
});

describe("DEF-019 — the projection answers the question it exists for", () => {
  it("shows a job that never fires, rather than omitting it", () => {
    // An INNER JOIN would hide the single most important failure mode by absence:
    // a scheduled job producing no runs at all.
    expect(CODE).toMatch(/LEFT JOIN cron\.job_run_details/);
    expect(CODE).toMatch(/count\(d\.runid\)\s+AS runs/);
  });

  it("surfaces the DEF-018 signature as a first-class count", () => {
    expect(CODE).toMatch(/unrecognized configuration parameter/);
    expect(CODE).toMatch(/AS unrecognized_parameter_failures/);
  });

  it("separates HTTP acceptance from cron success", () => {
    // The whole point: pg_cron reports success when the SQL completes, but net.http_post is
    // asynchronous. A job is "succeeded" whether the call returned 200 or 401.
    expect(CODE).toMatch(/'succeeded_2xx'/);
    expect(CODE).toMatch(/'unauthorized'/);
    expect(CODE).toMatch(/status_code IN \(401, 403\)/);
  });

  it("degrades legibly when net._http_response is absent", () => {
    expect(CODE).toMatch(/to_regclass\('net\._http_response'\) IS NULL/);
    expect(CODE).toMatch(/'available', false/);
  });

  it("is exactly one transaction", () => {
    expect(MIG.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(MIG.match(/^COMMIT;$/gm)).toHaveLength(1);
  });
});

describe("DEF-019 — the DEF-018 gate now depends on this", () => {
  const receipt = JSON.parse(
    readFileSync(resolve(root, "docs/releases/pending/2026-08-05-def-018-003-cron-guc-repair.json"), "utf8"),
  );

  it("DEF-018's checks route through the projections rather than the raw catalogs", () => {
    const sql = receipt.post_publish_verification.checks.map((c: { sql: string }) => c.sql).join("\n");

    // The reason the original checks could never pass: these three relations are
    // permission-denied to the executor's role and absent from the connector's schema.
    // Guarded on the FROM clause specifically — `cron.job.command LIKE '%vault…%'` is a
    // string match against the job's own text, not a read of the vault, and is legitimate.
    expect(sql).not.toMatch(/FROM\s+cron\.job_run_details/i);
    expect(sql).not.toMatch(/JOIN\s+cron\.job_run_details/i);
    expect(sql).not.toMatch(/FROM\s+net\._http_response/i);
    expect(sql).not.toMatch(/FROM\s+vault\.decrypted_secrets/i);

    expect(sql).toMatch(/mcp_cron_job_health/);
    expect(sql).toMatch(/mcp_http_delivery_health/);
    expect(sql).toMatch(/mcp_vault_secret_present/);
  });

  it("DEF-018 records the apply-order dependency on this release", () => {
    expect(receipt.post_publish_verification.depends_on).toMatch(/20260805160000/);
    expect(receipt.post_publish_verification.depends_on).toMatch(/BEFORE these checks are run/);
  });

  it("DEF-018 still gates on authorisation, not just on cron reporting success", () => {
    const ids = receipt.post_publish_verification.checks.map((c: { id: string }) => c.id);
    expect(ids).toContain("http-calls-are-authorised");
    expect(ids).toContain("http-calls-succeeded");
    expect(ids).toContain("vault-secret-present");
  });
});
