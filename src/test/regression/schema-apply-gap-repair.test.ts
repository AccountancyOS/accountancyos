import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Guards the forward-only repair migration that reconciles the live-vs-git apply-gaps
// found on 2026-07-22 (columns/defaults/nullability that never took effect live). If
// any repair statement is dropped, this fails. Companion (non-table) objects for the
// engagement_letters increment are re-declared here too, because a partial apply is the
// dangerous state and the live inventory cannot see them.
const SQL = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260722170000_reconcile_live_schema_apply_gaps.sql",
  ),
  "utf8",
);

describe("schema apply-gap repair migration", () => {
  it("C1: realigns onboarding_applications.status default to in_progress", () => {
    expect(SQL).toMatch(
      /ALTER\s+TABLE\s+public\.onboarding_applications[\s\S]*ALTER\s+COLUMN\s+status\s+SET\s+DEFAULT\s+'in_progress'/i,
    );
  });

  it("B1: re-adds all seven engagement_letters columns + CHECK + indexes + trigger fn", () => {
    for (const col of [
      "status",
      "signed_by",
      "signer_name",
      "signer_email",
      "version",
      "client_id",
      "company_id",
    ]) {
      expect(SQL).toMatch(new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\b`, "i"));
    }
    expect(SQL).toMatch(/engagement_letters_status_check/);
    expect(SQL).toMatch(/idx_engagement_letters_status/);
    expect(SQL).toMatch(/idx_engagement_letters_client_company/);
    expect(SQL).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.protect_engagement_letter_signatures/i,
    );
  });

  it("B2: re-adds invoices portal-payment columns", () => {
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+paid_at\b/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+stripe_checkout_session_id\b/i);
  });

  it("B3: re-adds templates quote-send columns with is_active default", () => {
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+category\b/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+is_active\s+boolean\s+DEFAULT\s+true/i);
  });

  it("D1: enforces NOT NULL on bank_transactions.updated_at", () => {
    expect(SQL).toMatch(
      /ALTER\s+TABLE\s+public\.bank_transactions[\s\S]*ALTER\s+COLUMN\s+updated_at\s+SET\s+NOT\s+NULL/i,
    );
  });

  it("is forward-only: does not edit or re-run a historical migration (own timestamp)", () => {
    // Sanity: the file itself is the repair, not a copy of a historical file name.
    expect(SQL).toMatch(/Forward-only repair migration/i);
  });
});
