import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * T0-2/F1: hmrc-vat-submit must obtain the HMRC VAT access token through the canonical
 * getValidHmrcAccessToken() helper (encrypted MTD VAT columns + refresh), never the non-existent
 * plaintext columns. There is no Deno test harness in this repo, so these are source-structure
 * assertions against the actual edge function — they prove the control-flow guarantees the owner
 * required.
 */
const src = readFileSync(
  resolve(process.cwd(), "supabase/functions/hmrc-vat-submit/index.ts"),
  "utf8",
);

// Anchor indices used across the ordering assertions.
const tokenIdx = src.indexOf("getValidHmrcAccessToken");
const postIdx = src.indexOf("organisations/vat/");
const pendingInsertIdx = src.indexOf("status: 'pending'");

describe("hmrc-vat-submit token handling (T0-2/F1)", () => {
  it("1. no longer references the non-existent plaintext token columns", () => {
    expect(src).not.toMatch(/\baccess_token\b/);
    expect(src).not.toMatch(/\brefresh_token\b/);
    expect(src).not.toMatch(/\btoken_expires_at\b/);
  });

  it("2. obtains the token through the canonical helper", () => {
    expect(src).toMatch(/from ["']\.\.\/_shared\/hmrc-auth\.ts["']/);
    expect(src).toMatch(/getValidHmrcAccessToken\s*\(/);
  });

  it("2b. derives sandbox/production from the integration config (test_mode), not the request", () => {
    expect(src).toMatch(/test_mode\s*\?\s*'sandbox'\s*:\s*'production'/);
    // the caller-supplied environment is downgraded to advisory only
    expect(src).toMatch(/requestedEnvironment/);
  });

  it("3. a missing HMRC connection fails cleanly before the HMRC submission POST", () => {
    const connIdx = src.indexOf("mtd_vat_connected");
    const notConnectedIdx = src.indexOf("HMRC_NOT_CONNECTED");
    expect(connIdx).toBeGreaterThan(-1);
    expect(notConnectedIdx).toBeGreaterThan(connIdx);
    expect(postIdx).toBeGreaterThan(notConnectedIdx);
  });

  it("4. the token obtained from the helper is the one passed to the HMRC request", () => {
    expect(src).toMatch(/hmrcAccessToken\s*=\s*tokenResult\.accessToken/);
    expect(src).toMatch(/'Authorization':\s*`Bearer \$\{hmrcAccessToken\}`/);
    expect(tokenIdx).toBeGreaterThan(-1);
    expect(tokenIdx).toBeLessThan(postIdx);
  });

  it("5. a token-helper failure returns non-success before any submission record or POST", () => {
    const catchIdx = src.indexOf("HMRC token acquisition failed");
    expect(catchIdx).toBeGreaterThan(tokenIdx);
    const catchBlock = src.slice(catchIdx, catchIdx + 400);
    expect(catchBlock).toMatch(/success:\s*false/);
    // token acquisition (and its early return) precede creating a submission row or POSTing...
    expect(pendingInsertIdx).toBeGreaterThan(-1);
    expect(tokenIdx).toBeLessThan(pendingInsertIdx);
    expect(tokenIdx).toBeLessThan(postIdx);
    // ...and nothing marks the filing submitted/accepted before the token is even obtained.
    const beforeToken = src.slice(0, tokenIdx);
    expect(beforeToken).not.toMatch(/status:\s*'submitted'/);
    expect(beforeToken).not.toMatch(/status:\s*'accepted'/);
  });

  it("does not log token material, refresh tokens, or encrypted values", () => {
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*hmrcAccessToken/);
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*accessToken/);
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*refreshToken/);
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*_encrypted/);
  });
});
