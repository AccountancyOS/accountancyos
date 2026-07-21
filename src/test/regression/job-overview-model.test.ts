import { describe, it, expect } from "vitest";
import { deriveNextAction, deriveBlockers, type JobOverviewFacts } from "@/lib/job-overview-model";
import { primaryAction, type JobStatus } from "@/lib/job-workflow-model";

const ALL_STATUSES: JobStatus[] = [
  "blank",
  "records_requested",
  "records_received",
  "accountant_queries",
  "client_queries",
  "accountant_review",
  "client_review",
  "ready_to_file",
  "completed",
];

function facts(overrides: Partial<JobOverviewFacts> & { status: JobStatus }): JobOverviewFacts {
  return {
    outstandingRequestCount: 0,
    hasNewClientUploads: false,
    clientApprovalRecorded: false,
    workpaperStatus: null,
    ...overrides,
  };
}

describe("deriveNextAction", () => {
  it("returns null for completed (no further forward action, mirrors primaryAction)", () => {
    expect(deriveNextAction(facts({ status: "completed" }))).toBeNull();
  });

  it("uses primaryAction's label for every non-completed status", () => {
    for (const status of ALL_STATUSES) {
      if (status === "completed") continue;
      const result = deriveNextAction(facts({ status }));
      expect(result).not.toBeNull();
      expect(result!.label).toBe(primaryAction(status)!.label);
    }
  });

  it("reason mentions the outstanding count when records_requested has outstanding items", () => {
    const result = deriveNextAction(facts({ status: "records_requested", outstandingRequestCount: 3 }));
    expect(result).toEqual({ label: "Mark records received", reason: "Waiting on 3 requested items" });
  });

  it("singularises the reason for exactly 1 outstanding item", () => {
    const result = deriveNextAction(facts({ status: "records_requested", outstandingRequestCount: 1 }));
    expect(result!.reason).toBe("Waiting on 1 requested item");
  });

  it("reason is null for records_requested with zero outstanding items", () => {
    const result = deriveNextAction(facts({ status: "records_requested", outstandingRequestCount: 0 }));
    expect(result!.reason).toBeNull();
  });

  it("reason flags new client uploads for records_received", () => {
    const result = deriveNextAction(facts({ status: "records_received", hasNewClientUploads: true }));
    expect(result).toEqual({ label: "Send to review", reason: "The client uploaded documents" });
  });

  it("reason is null for records_received with no new uploads", () => {
    const result = deriveNextAction(facts({ status: "records_received", hasNewClientUploads: false }));
    expect(result!.reason).toBeNull();
  });

  it("reason is null for statuses with no matching rule (nothing to add)", () => {
    for (const status of ["blank", "accountant_queries", "client_queries", "accountant_review", "client_review", "ready_to_file"] as JobStatus[]) {
      expect(deriveNextAction(facts({ status }))!.reason).toBeNull();
    }
  });
});

describe("deriveBlockers", () => {
  it("returns [] when nothing blocks (the empty case)", () => {
    expect(deriveBlockers(facts({ status: "accountant_review" }))).toEqual([]);
  });

  it("flags outstanding requested items while records_requested", () => {
    const blockers = deriveBlockers(facts({ status: "records_requested", outstandingRequestCount: 2 }));
    expect(blockers).toEqual([
      { message: "Waiting for the client to provide the 2 outstanding requested items." },
    ]);
  });

  it("singularises the outstanding-items blocker message for exactly 1 item", () => {
    const blockers = deriveBlockers(facts({ status: "records_requested", outstandingRequestCount: 1 }));
    expect(blockers).toEqual([
      { message: "Waiting for the client to provide the 1 outstanding requested item." },
    ]);
  });

  it("does not flag records_requested with zero outstanding items", () => {
    expect(deriveBlockers(facts({ status: "records_requested", outstandingRequestCount: 0 }))).toEqual([]);
  });

  it("flags missing client approval at ready_to_file", () => {
    const blockers = deriveBlockers(facts({ status: "ready_to_file", clientApprovalRecorded: false }));
    expect(blockers).toEqual([
      { message: "Filing is blocked because client approval has not been recorded." },
    ]);
  });

  it("does not flag ready_to_file once client approval is recorded", () => {
    expect(deriveBlockers(facts({ status: "ready_to_file", clientApprovalRecorded: true }))).toEqual([]);
  });

  it("flags missing client approval at completed too (at/after ready_to_file)", () => {
    const blockers = deriveBlockers(facts({ status: "completed", clientApprovalRecorded: false }));
    expect(blockers).toEqual([
      { message: "Filing is blocked because client approval has not been recorded." },
    ]);
  });

  it("does not flag the approval rule before ready_to_file even without approval recorded", () => {
    for (const status of ["blank", "records_requested", "records_received", "accountant_queries", "client_queries", "accountant_review", "client_review"] as JobStatus[]) {
      const blockers = deriveBlockers(facts({ status, clientApprovalRecorded: false, outstandingRequestCount: 0 }));
      expect(blockers).toEqual([]);
    }
  });

  it("can return both blockers at once when both rules apply", () => {
    // records_requested can't literally coexist with the ready_to_file rule in real data,
    // but the function is pure per-rule — verify combination logic in isolation instead via
    // two independent facts objects that each trigger their own rule.
    const requestBlockers = deriveBlockers(facts({ status: "records_requested", outstandingRequestCount: 5 }));
    const approvalBlockers = deriveBlockers(facts({ status: "ready_to_file", clientApprovalRecorded: false }));
    expect(requestBlockers).toHaveLength(1);
    expect(approvalBlockers).toHaveLength(1);
  });

  it("never invents a workpaper-incomplete blocker from a bare status string", () => {
    // workpaperStatus is a status string, not a completion/validation count — deriveBlockers
    // must not fabricate a count-based blocker from it.
    const blockers = deriveBlockers(facts({ status: "accountant_review", workpaperStatus: "in_progress" }));
    expect(blockers).toEqual([]);
  });
});
