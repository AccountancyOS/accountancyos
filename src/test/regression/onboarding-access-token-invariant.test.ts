import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Regression guard for the "Invalid or missing onboarding access token" outage:
// live onboarding_applications rows (incl. newly-created ones) had access_token = NULL
// because the column DEFAULT from 20260617114623 never took effect on the live DB, so
// public_get_quote_by_token returned a null token and clients were navigated to a
// tokenless /onboard/:id that the strict guard rejects. The remediation migration must
// restore the invariant durably: backfill existing NULLs, (re)assert the DEFAULT, AND
// install a BEFORE INSERT trigger so the invariant survives even if the default is lost
// again.
const SQL = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260722160000_fix_onboarding_access_token_default.sql",
  ),
  "utf8",
);

describe("onboarding access_token invariant remediation", () => {
  it("backfills every row still missing a token", () => {
    expect(SQL).toMatch(
      /UPDATE\s+public\.onboarding_applications[\s\S]*SET\s+access_token\s*=\s*public\.gen_onboarding_access_token\(\)[\s\S]*WHERE\s+access_token\s+IS\s+NULL/i,
    );
  });

  it("(re)asserts the column DEFAULT and NOT NULL", () => {
    expect(SQL).toMatch(
      /ALTER\s+COLUMN\s+access_token\s+SET\s+DEFAULT\s+public\.gen_onboarding_access_token\(\)/i,
    );
    expect(SQL).toMatch(/ALTER\s+COLUMN\s+access_token\s+SET\s+NOT\s+NULL/i);
  });

  it("installs a BEFORE INSERT trigger as the durable safety net", () => {
    expect(SQL).toMatch(/RETURNS\s+trigger/i);
    expect(SQL).toMatch(
      /CREATE\s+TRIGGER\s+trg_ensure_onboarding_access_token[\s\S]*BEFORE\s+INSERT\s+ON\s+public\.onboarding_applications/i,
    );
    // The trigger must fill the token when NULL.
    expect(SQL).toMatch(
      /IF\s+NEW\.access_token\s+IS\s+NULL\s+THEN[\s\S]*NEW\.access_token\s*:=\s*public\.gen_onboarding_access_token\(\)/i,
    );
  });
});
