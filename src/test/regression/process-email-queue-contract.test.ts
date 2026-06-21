import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Non-negotiable #2: `sent` rows must include a provider message id.
 * Guards the exact regression that caused the missing password reset.
 */
const SRC = readFileSync(
  resolve(__dirname, "../../../supabase/functions/process-email-queue/index.ts"),
  "utf8",
);

describe("process-email-queue contract", () => {
  it("captures the provider response from sendLovableEmail", () => {
    expect(SRC).toMatch(/const\s+providerResponse\s*=\s*await\s+sendLovableEmail/);
  });

  it("refuses to mark a row `sent` without a provider message id", () => {
    expect(SRC).toMatch(/provider_no_ack/);
    expect(SRC).toMatch(/provider_message_id/);
  });

  it("records the full provider response in metadata for audit", () => {
    expect(SRC).toMatch(/provider_response/);
  });

  it("still moves exhausted messages to DLQ", () => {
    expect(SRC).toMatch(/move_to_dlq/);
    expect(SRC).toMatch(/MAX_RETRIES/);
  });

  it("responds to CORS preflight so browser invocations work", () => {
    expect(SRC).toMatch(/req\.method\s*===\s*['"]OPTIONS['"]/);
    expect(SRC).toMatch(/Access-Control-Allow-Origin/);
    expect(SRC).toMatch(/Access-Control-Allow-Headers[\s\S]*authorization/);
  });

  it("includes CORS headers on every response", () => {
    // Catch the regression where new branches return bare Content-Type only.
    const responses = SRC.match(/new Response\([\s\S]*?\}\s*\)/g) ?? [];
    expect(responses.length).toBeGreaterThan(0);
    for (const r of responses) {
      // OK to skip the bare OPTIONS 'ok' response which already spreads corsHeaders directly.
      if (/headers:\s*corsHeaders/.test(r)) continue;
      expect(r).toMatch(/\.\.\.corsHeaders/);
    }
  });

  it("also drains public.email_queue rows that the Emails UI shows", () => {
    expect(SRC).toMatch(/from\(['"]email_queue['"]\)/);
    expect(SRC).toMatch(/\.eq\(['"]status['"],\s*['"]pending['"]\)/);
  });

  it("refuses to mark an email_queue row `sent` without a provider message id", () => {
    // The drain loop must apply the same non-negotiable as the pgmq loop.
    expect(SRC).toMatch(/email_queue[\s\S]*provider_no_ack/);
  });
});