import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the portal messaging bug (both sides were broken):
 *  - Accountant: ConversationsTab wrote sender_type 'accountant' into client_messages,
 *    whose CHECK only allows ('staff','client','system') — every send failed. ('accountant'
 *    is job_conversations' vocabulary, a different table.)
 *  - Portal: sendPortalMessage calls the portal_send_message RPC, which didn't exist.
 */
const root = resolve(__dirname, "../../../");
const conversationsTab = readFileSync(resolve(root, "src/components/client-portal/ConversationsTab.tsx"), "utf8");
const migAll = readdirSync(resolve(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(root, "supabase/migrations", f), "utf8"))
  .join("\n");

describe("client portal messaging", () => {
  it("accountant sends use client_messages' valid sender_type ('staff', not 'accountant')", () => {
    expect(conversationsTab).not.toMatch(/sender_type:\s*["']accountant["']/);
    expect(conversationsTab).toMatch(/sender_type:\s*["']staff["']/);
  });

  it("portal_send_message RPC exists (portal client sends depend on it)", () => {
    expect(migAll).toMatch(/FUNCTION public\.portal_send_message/);
  });
});
