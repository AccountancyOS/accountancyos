import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-019 follow-up — the evidence gate must be runnable by the party required to run it.
 *
 * 20260805160000 granted EXECUTE to `authenticated` and `service_role` only. The executor
 * connects as `sandbox_exec`, so every behavioural check in the DEF-019 gate failed with
 * 42501 — the same class of defect DEF-019 exists to fix, with the reason moved from schema
 * USAGE on `cron` to EXECUTE on the projections.
 *
 * These guards keep the remedy narrow: four EXECUTE grants, nothing granted to anon or
 * PUBLIC, no existing object altered, and the applied DEF-019 migration left untouched.
 */
const root = resolve(__dirname, "../../../");
const FOLLOWUP_NAME = "20260805220000_def_019_grant_exec_sandbox_exec.sql";
const MIG = readFileSync(resolve(root, `supabase/migrations/${FOLLOWUP_NAME}`), "utf8");
const CODE = MIG.replace(/^\s*--.*$/gm, "");

const RECEIPT = JSON.parse(
  readFileSync(
    resolve(root, "docs/releases/pending/2026-08-05-def-019-cron-and-delivery-observability.json"),
    "utf8",
  ),
);

const GRANTS = [
  "public.mcp_cron_job_health(integer)",
  "public.mcp_http_delivery_health(integer)",
  "public.mcp_vault_secret_present(text)",
  "public.redact_secrets(text)",
];

describe("DEF-019 follow-up — grants EXECUTE to sandbox_exec, and only that", () => {
  it("grants EXECUTE on all four projections to sandbox_exec", () => {
    for (const sig of GRANTS) {
      const re = new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${sig.replace(/[().]/g, "\\$&")}\\s+TO\\s+sandbox_exec`,
        "i",
      );
      expect(CODE, `missing grant for ${sig}`).toMatch(re);
    }
  });

  it("grants nothing to anon or PUBLIC", () => {
    expect(CODE).not.toMatch(/GRANT[\s\S]*?\bTO\b[^;]*\banon\b/i);
    expect(CODE).not.toMatch(/GRANT[\s\S]*?\bTO\b[^;]*\bPUBLIC\b/i);
  });

  it("creates, alters or drops no object", () => {
    expect(CODE).not.toMatch(/\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TABLE|VIEW|INDEX|TRIGGER|POLICY)\b/i);
    expect(CODE).not.toMatch(/\bDROP\b/i);
    expect(CODE).not.toMatch(/\bALTER\s+(TABLE|FUNCTION|ROLE|VIEW)\b/i);
    expect(CODE).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it("is a single transaction", () => {
    expect(CODE).toMatch(/^\s*BEGIN;/m);
    expect(CODE.trimEnd()).toMatch(/COMMIT;\s*$/);
  });

  it("leaves the already-applied DEF-019 migration untouched", () => {
    const applied = readFileSync(
      resolve(root, "supabase/migrations/20260805160000_def_019_cron_and_delivery_observability.sql"),
      "utf8",
    );
    expect(applied).toContain("GRANT EXECUTE ON FUNCTION public.redact_secrets(text) TO authenticated, service_role;");
    expect(applied).not.toMatch(/sandbox_exec/i);
  });
});

describe("DEF-019 follow-up — post-assertions prove the end state", () => {
  it("asserts sandbox_exec can execute all four", () => {
    expect(CODE).toMatch(/has_function_privilege\('sandbox_exec'/);
    expect(CODE).toMatch(/sandbox_exec still lacks EXECUTE/i);
  });

  it("asserts anon can execute none of them", () => {
    expect(CODE).toMatch(/has_function_privilege\('anon'/);
    expect(CODE).toMatch(/anon holds EXECUTE on/i);
  });

  it("asserts authenticated and service_role did not lose EXECUTE", () => {
    expect(CODE).toMatch(/has_function_privilege\('authenticated'/);
    expect(CODE).toMatch(/has_function_privilege\('service_role'/);
  });

  it("exercises the DEF-018 vault pre-check and treats a permission error as fatal", () => {
    expect(CODE).toMatch(/mcp_vault_secret_present\('email_queue_service_role_key'\)/);
    expect(CODE).toMatch(/WHEN\s+insufficient_privilege\s+THEN/i);
  });

  it("exercises both health projections and the redaction", () => {
    expect(CODE).toMatch(/PERFORM public\.mcp_cron_job_health\(/);
    expect(CODE).toMatch(/PERFORM public\.mcp_http_delivery_health\(/);
    expect(CODE).toMatch(/redact_secrets\('Bearer eyJhbGci/);
  });
});

describe("DEF-019 receipt — the gate is runnable by sandbox_exec", () => {
  const checks = RECEIPT.post_publish_verification.checks as Array<{ id: string; sql: string; expected: unknown }>;

  it("no check queries an object inaccessible to sandbox_exec", () => {
    for (const c of checks) {
      expect(c.sql, `check ${c.id} reaches into a denied schema`).not.toMatch(
        /\b(cron|vault|net)\s*\./i,
      );
    }
  });

  it("cron-health-covers-every-job uses only the public projection", () => {
    const c = checks.find((x) => x.id === "cron-health-covers-every-job");
    expect(c).toBeTruthy();
    expect(c!.sql).toContain("public.mcp_cron_job_health(20)");
    expect(c!.sql).not.toMatch(/cron\.job\b/);
  });

  it("carries the three new privilege and pre-check gates", () => {
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("sandbox-exec-can-execute");
    expect(ids).toContain("anon-cannot-execute-any");
    expect(ids).toContain("vault-precheck-answers");
  });

  it("records the follow-up migration and stays in pending/", () => {
    const paths = (RECEIPT.migrations as Array<{ path: string }>).map((m) => m.path);
    expect(paths).toContain(`supabase/migrations/${FOLLOWUP_NAME}`);
    expect(RECEIPT.status).not.toBe("live_verified");
  });

  it("records that DEF-018 stays held until the vault pre-check succeeds", () => {
    expect(String(RECEIPT.def_018_status)).toMatch(/HELD/);
  });
});
