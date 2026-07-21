import { describe, it, expect } from "vitest";
import {
  buildRecordsChecklist,
  resolveRecordState,
  type RecordDefinitionItem,
  type RecordRequestTaskLite,
} from "@/lib/job-records-model";

function def(overrides: Partial<RecordDefinitionItem> = {}): RecordDefinitionItem {
  return { id: "def-1", name: "Bank statements", isRequired: true, ...overrides };
}

function task(overrides: Partial<RecordRequestTaskLite> = {}): RecordRequestTaskLite {
  return {
    id: "task-1",
    title: "Bank statements",
    status: "not_started",
    is_verified: false,
    source_template_task_id: null,
    ...overrides,
  };
}

describe("resolveRecordState", () => {
  it("returns not_requested when a required item has no matching client_task", () => {
    expect(resolveRecordState(def(), [])).toBe("not_requested");
  });

  it("returns not_applicable when an optional item has no matching client_task", () => {
    expect(resolveRecordState(def({ isRequired: false }), [])).toBe("not_applicable");
  });

  it("matches by title (case/whitespace-insensitive) when no source_template_task_id link exists", () => {
    const t = task({ title: "  BANK Statements  " });
    expect(resolveRecordState(def(), [t])).toBe("requested");
  });

  it("prefers matching by source_template_task_id over title when both are present", () => {
    const wrongTitle = task({ id: "t-a", title: "Something else entirely", source_template_task_id: "def-1" });
    const rightTitleWrongId = task({ id: "t-b", title: "Bank statements", source_template_task_id: "other-def" });
    expect(resolveRecordState(def(), [rightTitleWrongId, wrongTitle])).toBe("requested");
  });

  it("returns requested for a matched client_task that is not_started or in_progress", () => {
    expect(resolveRecordState(def(), [task({ status: "not_started" })])).toBe("requested");
    expect(resolveRecordState(def(), [task({ status: "in_progress" })])).toBe("requested");
  });

  it("returns received for a matched client_task that is complete but not verified", () => {
    expect(resolveRecordState(def(), [task({ status: "complete", is_verified: false })])).toBe("received");
  });

  it("returns reviewed for a matched client_task that is verified, regardless of status", () => {
    expect(resolveRecordState(def(), [task({ status: "complete", is_verified: true })])).toBe("reviewed");
    expect(resolveRecordState(def(), [task({ status: "not_started", is_verified: true })])).toBe("reviewed");
  });
});

describe("buildRecordsChecklist", () => {
  it("enumerates every definition item, preserving order, when a template definition exists", () => {
    const definitions = [
      def({ id: "d1", name: "Bank statements" }),
      def({ id: "d2", name: "Payroll records", isRequired: false }),
      def({ id: "d3", name: "VAT returns" }),
    ];
    const tasks = [
      task({ id: "t1", title: "Bank statements", status: "complete", is_verified: true }),
      task({ id: "t3", title: "VAT returns", status: "not_started" }),
    ];

    const checklist = buildRecordsChecklist(definitions, tasks);

    expect(checklist.map((c) => c.name)).toEqual(["Bank statements", "Payroll records", "VAT returns"]);
    expect(checklist[0].state).toBe("reviewed");
    expect(checklist[0].matchedTaskId).toBe("t1");
    expect(checklist[1].state).toBe("not_applicable"); // optional, never requested
    expect(checklist[1].matchedTaskId).toBeNull();
    expect(checklist[2].state).toBe("requested");
    expect(checklist[2].matchedTaskId).toBe("t3");
  });

  it("falls back to a passthrough of client_tasks when there is no template definition", () => {
    const tasks = [
      task({ id: "t1", title: "Bank statements", status: "not_started", is_verified: false }),
      task({ id: "t2", title: "Payroll records", status: "complete", is_verified: false }),
      task({ id: "t3", title: "VAT returns", status: "complete", is_verified: true }),
    ];

    const checklist = buildRecordsChecklist([], tasks);

    expect(checklist).toHaveLength(3);
    expect(checklist.map((c) => c.state)).toEqual(["requested", "received", "reviewed"]);
    // Passthrough items are always resolved from an existing request, so these
    // two states — which only make sense against a definition the job doesn't
    // have here — can never appear in the fallback.
    expect(checklist.some((c) => c.state === "not_requested")).toBe(false);
    expect(checklist.some((c) => c.state === "not_applicable")).toBe(false);
    expect(checklist.every((c, i) => c.matchedTaskId === tasks[i].id)).toBe(true);
  });

  it("returns an empty checklist when there is neither a definition nor any requests", () => {
    expect(buildRecordsChecklist([], [])).toEqual([]);
  });
});
