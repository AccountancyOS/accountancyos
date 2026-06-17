import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../../../infra/supabase-manifest.json"), "utf8"),
) as {
  edgeFunctions: { name: string; critical: boolean }[];
  cronJobs: { name: string }[];
  emailInfrastructure: { tables: string[]; publicRpcs: string[]; pgmqQueues: string[] };
  rlsRequiredTables: string[];
  redirectAllowList: string[];
  authEmailHook: { function: string; senderDomain: string; actionTypes: string[] };
};

describe("Supabase manifest invariants", () => {
  it("auth email hook references the deployed function", () => {
    expect(manifest.authEmailHook.function).toBe("auth-email-hook");
    expect(manifest.authEmailHook.senderDomain).toBe("notify.accountancyos.com");
    expect(manifest.authEmailHook.actionTypes).toContain("recovery");
  });

  it("declares portal reset-password redirect on both hosts", () => {
    const required = [
      "https://app.accountancyos.com/portal/reset-password",
      "https://accountancyos.lovable.app/portal/reset-password",
    ];
    for (const r of required) expect(manifest.redirectAllowList).toContain(r);
  });

  it("declares the queue worker and the auth hook as edge functions", () => {
    const names = manifest.edgeFunctions.map((f) => f.name);
    expect(names).toContain("auth-email-hook");
    expect(names).toContain("process-email-queue");
  });

  it("requires email infrastructure tables and RPCs", () => {
    expect(manifest.emailInfrastructure.tables).toEqual(
      expect.arrayContaining(["email_send_log", "email_send_state", "suppressed_emails"]),
    );
    expect(manifest.emailInfrastructure.publicRpcs).toContain("enqueue_email");
    expect(manifest.emailInfrastructure.pgmqQueues).toEqual(
      expect.arrayContaining(["auth_emails", "transactional_emails"]),
    );
  });

  it("declares core tenant-scoped tables for RLS", () => {
    const must = [
      "organizations",
      "clients",
      "companies",
      "jobs",
      "portal_access",
      "ledger_entries",
      "filings",
      "email_send_log",
      "questionnaire_responses",
    ];
    for (const t of must) expect(manifest.rlsRequiredTables).toContain(t);
  });

  it("registers process-email-queue as a cron job", () => {
    const names = manifest.cronJobs.map((c) => c.name);
    expect(names).toContain("process-email-queue");
    expect(names).toContain("workflow-tick");
    expect(names).toContain("sla-check");
  });
});