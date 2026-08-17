import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EMAIL_QUEUE_STATUSES } from "@/lib/db-constants/check-constraints";

/**
 * /emails crashed with "Cannot read properties of undefined (reading 'icon')": the page rendered a
 * row whose status was 'cancelled', which the page's statusConfig map did not define, so the badge
 * lookup returned undefined and .icon threw. Guards both halves of the fix:
 *  - every DB-allowed email_queue status has a statusConfig entry, and
 *  - the render path goes through the fail-safe getStatusConfig helper, never a raw index.
 */
const src = readFileSync(
  resolve(__dirname, "../../../src/pages/Emails.tsx"),
  "utf8",
);

describe("Emails page status vocabulary", () => {
  it("defines a badge config for every status the database allows", () => {
    const block = src.slice(
      src.indexOf("const statusConfig"),
      src.indexOf("function getStatusConfig"),
    );
    for (const status of EMAIL_QUEUE_STATUSES) {
      expect(block).toMatch(new RegExp(`\\b${status}:\\s*\\{`));
    }
  });

  it("renders through the fail-safe lookup, not a raw statusConfig index", () => {
    expect(src).not.toMatch(/statusConfig\[[^\]]*\]\.icon/);
    expect(src).toMatch(/const config = getStatusConfig\(email\.status\)/);
  });

  it("falls back to a neutral badge for an unknown status", () => {
    // The helper must not assume the key exists.
    expect(src).toMatch(/statusConfig\[key\]\s*\?\?/);
  });
});
