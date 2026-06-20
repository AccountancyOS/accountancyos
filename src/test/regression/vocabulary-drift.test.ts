/**
 * Regression: schema-vs-app vocabulary drift across ALL constrained columns.
 *
 * `src/lib/db-constants/check-constraints.ts` is the single source of truth for
 * every CHECK-constrained status/enum-like column. This test freezes the
 * expected value set for each constraint (transcribed from the migrations) and
 * asserts the registry still matches — so an accidental edit to the registry,
 * or a constant that quietly diverges from the schema, fails CI.
 *
 * The complementary LIVE check (registry vs the real DB constraint via
 * `get_check_constraint_values`) runs in `scripts/smoke-test.ts`.
 */
import { describe, expect, it } from "vitest";
import { CHECK_CONSTRAINT_REGISTRY } from "@/lib/db-constants/check-constraints";

/**
 * Frozen expected values, keyed by exact constraint name, transcribed from the
 * latest migration that defines each constraint. Updating a constraint means
 * updating BOTH this map and the registry — that double-entry is the guard.
 */
const EXPECTED_CONSTRAINT_VALUES: Record<string, string[]> = {
  chk_jobs_status: [
    "blank", "records_requested", "records_received", "accountant_queries",
    "client_queries", "accountant_review", "client_review", "ready_to_file", "completed",
  ],
  job_tasks_status_check: ["todo", "doing", "done", "blocked"],
  client_tasks_status_check: ["not_started", "in_progress", "complete"],
  client_tasks_visibility_check: ["client_visible", "internal_only"],
  engagements_status_check: ["draft", "active", "suspended", "terminated"],
  clients_status_check: ["pending", "active", "disengaged", "archived"],
  companies_status_check: ["pending", "active", "disengaged", "archived"],
  portal_access_status_check: ["invited", "active", "revoked"],
  engagement_letters_status_check: ["draft", "sent", "signed"],
  chk_filing_status: [
    "not_started", "draft", "in_progress", "ready_for_review", "sent_to_client",
    "client_changes_requested", "awaiting_approval", "approved", "ready_to_file",
    "submitted", "accepted", "rejected", "filed",
  ],
  onboarding_applications_status_check: [
    "draft", "in_progress", "engagement_pending", "aml_pending", "billing_pending",
    "portal_pending", "for_review", "needs_client_action", "approved", "rejected", "cancelled",
  ],
  onboarding_applications_aml_status_check: ["pending", "verified", "failed", "manual_review"],
  billing_status_check: ["pending", "skipped", "completed", "not_required"],
  quotes_status_check: ["draft", "sent", "accepted", "rejected", "expired", "superseded"],
  deadlines_status_check: ["pending", "in_progress", "completed", "filed", "overdue", "cancelled"],
  leads_pipeline_stage_check: ["new", "qualified", "proposal_sent", "chasing", "won", "lost"],
};

/** Legacy/retired values that must never reappear in a canonical set. */
const FORBIDDEN: Record<string, string[]> = {
  chk_jobs_status: ["not_started", "in_progress", "waiting_on_client", "with_reviewer"],
  job_tasks_status_check: ["not_started", "pending"],
  client_tasks_status_check: ["pending"],
  client_tasks_visibility_check: ["internal", "client"],
  chk_filing_status: ["ready_for_approval", "queued", "submitting", "submission_failed"],
};

describe("vocabulary drift registry (SSOT)", () => {
  it("covers every registered constraint with a frozen expectation", () => {
    const registered = CHECK_CONSTRAINT_REGISTRY.map((e) => e.constraint).sort();
    const expected = Object.keys(EXPECTED_CONSTRAINT_VALUES).sort();
    expect(registered).toEqual(expected);
  });

  for (const entry of CHECK_CONSTRAINT_REGISTRY) {
    describe(`${entry.table}.${entry.column} (${entry.constraint})`, () => {
      const expected = EXPECTED_CONSTRAINT_VALUES[entry.constraint];

      it("registry values match the frozen DB expectation (order-independent)", () => {
        expect(expected, `no frozen expectation for ${entry.constraint}`).toBeDefined();
        expect([...entry.values].sort()).toEqual([...expected].sort());
      });

      it("has no duplicate values", () => {
        expect(new Set(entry.values).size).toBe(entry.values.length);
      });

      it("contains no forbidden/legacy values", () => {
        for (const bad of FORBIDDEN[entry.constraint] ?? []) {
          expect(entry.values as readonly string[]).not.toContain(bad);
        }
      });

      it("values are lowercase snake_case tokens", () => {
        for (const v of entry.values) expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
      });
    });
  }
});
