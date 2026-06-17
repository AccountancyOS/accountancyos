import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract tests for supabase/functions/auth-email-hook/index.ts.
 * We assert by static inspection — the function runs in Deno and cannot be
 * imported into the Vitest (Node + jsdom) runtime — but every assertion here
 * encodes a real production invariant that breaks if removed.
 */

const HOOK_PATH = resolve(__dirname, "../../../supabase/functions/auth-email-hook/index.ts");
const source = readFileSync(HOOK_PATH, "utf8");

describe("auth-email-hook contract", () => {
  it("enqueues into the auth_emails pgmq queue (not direct send)", () => {
    expect(source).toMatch(/enqueue_email/);
    expect(source).toMatch(/auth_emails/);
    expect(source).not.toMatch(/callback_url/); // legacy direct-send is gone
  });

  it("logs to email_send_log so smoke tests can verify delivery", () => {
    expect(source).toMatch(/email_send_log/);
    expect(source).toMatch(/status:\s*['"]pending['"]/);
  });

  it("verifies the webhook signature", () => {
    expect(source).toMatch(/verifyWebhookRequest/);
  });

  it("supports every action type declared in the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "../../../infra/supabase-manifest.json"), "utf8"),
    );
    for (const type of manifest.authEmailHook.actionTypes) {
      expect(source).toContain(type);
    }
  });

  it("uses the verified sender domain from the manifest", () => {
    expect(source).toMatch(/notify\.accountancyos\.com/);
  });
});