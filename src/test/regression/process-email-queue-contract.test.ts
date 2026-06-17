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
});