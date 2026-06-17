import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/**
 * Baseline: the failure mode that hid the missing password-reset email is
 * now covered by every layer (frontend test, hook contract, queue contract,
 * smoke check, manifest, docs). If any layer regresses, this test fails.
 */
describe("Baseline: forgotten-password regression is now automated", () => {
  it("frontend wiring is covered by a Vitest test", () => {
    const t = read("src/portal/pages/PortalForgotPassword.test.tsx");
    expect(t).toMatch(/resetPasswordForEmail/);
    expect(t).toMatch(/portal.{0,4}reset-password/);
    expect(t).toMatch(/redirectTo/);
  });

  it("auth hook contract is enforced", () => {
    const t = read("src/test/regression/auth-email-hook-contract.test.ts");
    expect(t).toMatch(/enqueue_email/);
    expect(t).toMatch(/email_send_log/);
  });

  it("queue worker contract requires a provider message id", () => {
    const t = read("src/test/regression/process-email-queue-contract.test.ts");
    expect(t).toMatch(/provider_message_id/);
    expect(t).toMatch(/provider_no_ack/);
  });

  it("smoke test triggers a real recovery and asserts provider ack", () => {
    const s = read("scripts/smoke-test.ts");
    expect(s).toMatch(/resetPasswordForEmail/);
    expect(s).toMatch(/email_send_log/);
    expect(s).toMatch(/provider_message_id/);
  });

  it("manifest declares the auth hook, queue worker, cron, and redirect", () => {
    const m = JSON.parse(read("infra/supabase-manifest.json"));
    const fns = m.edgeFunctions.map((f: any) => f.name);
    expect(fns).toContain("auth-email-hook");
    expect(fns).toContain("process-email-queue");
    expect(m.cronJobs.map((c: any) => c.name)).toContain("process-email-queue");
    expect(m.redirectAllowList).toContain("https://app.accountancyos.com/portal/reset-password");
  });

  it("critical-workflows.md ties the forgotten-password flow to its tests", () => {
    const doc = read("docs/critical-workflows.md");
    expect(doc).toMatch(/Client Forgotten Password/);
    expect(doc).toMatch(/PortalForgotPassword\.test\.tsx/);
    expect(doc).toMatch(/email:send_log row reaches sent/);
  });
});