import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../../supabase/functions/seed-portal-test-users/index.ts"),
  "utf8",
);

describe("Portal fixture seed contract", () => {
  it("resets existing seeded users to the documented portal fixture password", () => {
    expect(source).toMatch(/updateUserById/);
    expect(source).toMatch(/password:\s*PW/);
    expect(source).toMatch(/email_confirm:\s*true/);
  });

  it("keeps the seed secret gate available for fixture reseeding", () => {
    expect(source).toMatch(/PORTAL_SEED_SECRET/);
    expect(source).toMatch(/x-seed-secret/);
  });

  it("restores missing fixture client and company records before linking portal access", () => {
    expect(source).toMatch(/ensureClient/);
    expect(source).toMatch(/ensureCompany/);
    expect(source.indexOf("await ensureClient")).toBeLessThan(source.indexOf("await upsertPortalAccess"));
  });

  it("uses live uppercase invoice statuses for portal invoice fixtures", () => {
    expect(source).toContain('status: "AWAITING_PAYMENT"');
    expect(source).toContain('status: "PAID"');
    expect(source).not.toContain('status: "sent"');
    expect(source).not.toContain('status: "paid"');
  });
});