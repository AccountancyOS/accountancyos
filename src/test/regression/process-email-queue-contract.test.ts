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
    // Every response must carry CORS headers, or the browser preflight/actual
    // request fails ("Failed to send a request to the Edge Function"). The
    // regression to catch is a new branch that returns a bare Content-Type
    // header object WITHOUT corsHeaders. (A previous version of this test tried
    // to slice each `new Response(...)` with a regex, but the lazy match
    // truncated at the inner JSON.stringify brace and never reached the headers
    // argument — a false red against correct code. Assert the intent directly.)
    const bareContentType =
      SRC.match(/headers:\s*\{(?![^}]*corsHeaders)[^}]*[Cc]ontent-[Tt]ype[^}]*\}/g) ?? [];
    expect(bareContentType).toEqual([]);
    // And the OPTIONS preflight returns corsHeaders directly.
    expect(SRC).toMatch(/OPTIONS[\s\S]*?headers:\s*corsHeaders/);
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