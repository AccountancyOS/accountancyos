import { describe, it, expect } from "vitest";
import {
  JOB_STATUS_TRANSITIONS,
  getAllowedNextStatuses,
  isValidTransition,
  STAGE_SEQUENCE,
  STAGE_LABEL,
  stepperState,
  primaryAction,
  capabilityTabVisible,
  type JobStatus,
} from "@/lib/job-workflow-model";

// Byte-faithful copy of `valid_transitions` inside validate_job_status_transition()
// (supabase/migrations/20260408203205_2c7ea4c6-d4d7-4a98-904d-7e85a69e88df.sql).
// If that migration's map changes, update the model AND this expectation together —
// this test exists specifically to catch drift between the two.
const DB_TRIGGER_TRANSITIONS: Record<string, string[]> = {
  blank: ["records_requested"],
  records_requested: ["records_received", "client_queries", "blank"],
  records_received: ["accountant_queries", "client_queries", "accountant_review", "blank"],
  accountant_queries: ["records_received", "client_queries", "accountant_review", "blank"],
  client_queries: ["records_received", "accountant_queries", "accountant_review", "blank"],
  accountant_review: ["client_review", "ready_to_file", "accountant_queries", "client_queries", "blank"],
  client_review: ["accountant_review", "ready_to_file", "client_queries", "blank"],
  ready_to_file: ["completed", "accountant_review", "client_review", "blank"],
  completed: ["blank"],
};

const ALL_STATUSES = Object.keys(DB_TRIGGER_TRANSITIONS) as JobStatus[];

describe("JOB_STATUS_TRANSITIONS mirrors the DB trigger exactly", () => {
  it("has the same set of statuses as the trigger", () => {
    expect(Object.keys(JOB_STATUS_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  for (const status of ALL_STATUSES) {
    it(`matches the trigger's allowed transitions for "${status}"`, () => {
      expect(JOB_STATUS_TRANSITIONS[status]).toEqual(DB_TRIGGER_TRANSITIONS[status]);
    });
  }
});

describe("getAllowedNextStatuses / isValidTransition", () => {
  it("returns the transition array for a known status", () => {
    expect(getAllowedNextStatuses("records_requested")).toEqual([
      "records_received",
      "client_queries",
      "blank",
    ]);
  });

  it("flags an allowed transition as valid", () => {
    expect(isValidTransition("ready_to_file", "completed")).toBe(true);
  });

  it("flags a disallowed transition as invalid", () => {
    // blank can only go to records_requested per the trigger
    expect(isValidTransition("blank", "completed")).toBe(false);
  });
});

describe("STAGE_SEQUENCE / STAGE_LABEL", () => {
  it("includes every JobStatus exactly once", () => {
    expect([...STAGE_SEQUENCE].sort()).toEqual([...ALL_STATUSES].sort());
    expect(new Set(STAGE_SEQUENCE).size).toBe(STAGE_SEQUENCE.length);
  });

  it("has a human label for every status with no raw enum leaking through", () => {
    for (const status of STAGE_SEQUENCE) {
      const label = STAGE_LABEL[status];
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/_/); // no raw snake_case status text shown to users
    }
  });
});

describe("stepperState", () => {
  it("marks earlier stages done, the current stage current, and later stages future", () => {
    const steps = stepperState("accountant_review");
    const byStatus = Object.fromEntries(steps.map((s) => [s.status, s.state]));
    expect(byStatus.blank).toBe("done");
    expect(byStatus.records_requested).toBe("done");
    expect(byStatus.records_received).toBe("done");
    expect(byStatus.accountant_review).toBe("current");
    expect(byStatus.client_review).toBe("future");
    expect(byStatus.completed).toBe("future");
  });

  it("marks blank as current with everything else future", () => {
    const steps = stepperState("blank");
    expect(steps[0]).toEqual({ status: "blank", label: STAGE_LABEL.blank, state: "current" });
    expect(steps.slice(1).every((s) => s.state === "future")).toBe(true);
  });

  it("marks completed as current with everything before it done", () => {
    const steps = stepperState("completed");
    expect(steps[steps.length - 1]).toEqual({
      status: "completed",
      label: STAGE_LABEL.completed,
      state: "current",
    });
    expect(steps.slice(0, -1).every((s) => s.state === "done")).toBe(true);
  });
});

describe("primaryAction", () => {
  it("returns null for completed (no further forward action)", () => {
    expect(primaryAction("completed")).toBeNull();
  });

  it("returns 'Mark records received' -> records_received for records_requested", () => {
    expect(primaryAction("records_requested")).toEqual({
      label: "Mark records received",
      targetStatus: "records_received",
    });
  });

  it("returns 'Mark complete' -> completed for ready_to_file", () => {
    expect(primaryAction("ready_to_file")).toEqual({
      label: "Mark complete",
      targetStatus: "completed",
    });
  });

  it("has a non-null action for every status except completed", () => {
    for (const status of ALL_STATUSES) {
      const action = primaryAction(status);
      if (status === "completed") {
        expect(action).toBeNull();
      } else {
        expect(action).not.toBeNull();
      }
    }
  });

  it("every primaryAction targetStatus is an allowed transition per the DB trigger map", () => {
    for (const status of ALL_STATUSES) {
      const action = primaryAction(status);
      if (!action) continue;
      expect(JOB_STATUS_TRANSITIONS[status]).toContain(action.targetStatus);
    }
  });
});

describe("capabilityTabVisible (fail-open)", () => {
  it("is visible when the flag is true", () => {
    expect(capabilityTabVisible(true)).toBe(true);
  });

  it("is visible when the flag/template data is missing — fail open", () => {
    expect(capabilityTabVisible(null)).toBe(true);
    expect(capabilityTabVisible(undefined)).toBe(true);
  });

  it("is hidden only when the flag is explicitly false", () => {
    expect(capabilityTabVisible(false)).toBe(false);
  });
});
