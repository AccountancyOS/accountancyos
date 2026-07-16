import { describe, it, expect } from "vitest";
import { ct600FilingState, ct600SubmissionGateBlocked, ct600MaterialFigureDrift } from "@/lib/ct600-filing-model";

describe("ct600FilingState (Stage B/C CT600)", () => {
  it("no approval => not submittable", () => {
    const s = ct600FilingState({ status: "in_progress", hasActiveApproval: false, modelSnapshotId: null });
    expect(s.approved).toBe(false);
    expect(s.submittable).toBe(false);
    expect(s.reason).toBe("Not approved for filing");
  });

  it("active approval + linked snapshot => submittable", () => {
    const s = ct600FilingState({ status: "in_progress", hasActiveApproval: true, modelSnapshotId: "snap-1" });
    expect(s.approved).toBe(true);
    expect(s.submittable).toBe(true);
  });

  it("approval without a linked snapshot does not count", () => {
    const s = ct600FilingState({ status: "in_progress", hasActiveApproval: true, modelSnapshotId: null });
    expect(s.approved).toBe(false);
    expect(s.submittable).toBe(false);
  });

  it("already submitted/filed is never submittable", () => {
    for (const status of ["submitted", "filed", "accepted"]) {
      const s = ct600FilingState({ status, hasActiveApproval: true, modelSnapshotId: "snap-1" });
      expect(s.submitted).toBe(true);
      expect(s.submittable).toBe(false);
      expect(s.reason).toBe("Already submitted");
    }
  });
});

describe("ct600SubmissionGateBlocked (Stage D — DB trigger contract)", () => {
  it("blocks transition into filed with no snapshot", () => {
    expect(ct600SubmissionGateBlocked({ status: "in_progress" }, { status: "filed" })).toBe(true);
  });

  it("allows transition into filed with a linked snapshot", () => {
    expect(
      ct600SubmissionGateBlocked({ status: "in_progress" }, { status: "filed", model_snapshot_id: "snap-1" }),
    ).toBe(false);
  });

  it("ignores non-terminal edits and already-terminal rows", () => {
    expect(ct600SubmissionGateBlocked({ status: "in_progress" }, { status: "in_progress" })).toBe(false);
    expect(ct600SubmissionGateBlocked({ status: "filed" }, { status: "filed" })).toBe(false);
  });
});

describe("ct600MaterialFigureDrift (T1-3 — submit-time figures-of-record guard)", () => {
  const approved = { taxableTotalProfits: 100000, corporationTaxDue: 19000 };

  it("no drift when current matches the approved snapshot", () => {
    expect(
      ct600MaterialFigureDrift(approved, { taxable_total_profits: 100000, corporation_tax_due: 19000 }),
    ).toEqual([]);
  });

  it("tolerates sub-penny rounding differences", () => {
    expect(
      ct600MaterialFigureDrift(approved, { taxable_total_profits: 100000.004, corporation_tax_due: 18999.996 }),
    ).toEqual([]);
  });

  it("flags a changed tax due", () => {
    expect(
      ct600MaterialFigureDrift(approved, { taxable_total_profits: 100000, corporation_tax_due: 12000 }),
    ).toEqual(["corporation tax due"]);
  });

  it("flags both figures when the whole computation changed", () => {
    expect(
      ct600MaterialFigureDrift(approved, { taxable_total_profits: 250000, corporation_tax_due: 62500 }),
    ).toEqual(["taxable total profits", "corporation tax due"]);
  });

  it("no approved snapshot => nothing to compare (guard skipped)", () => {
    expect(ct600MaterialFigureDrift(null, { taxable_total_profits: 1, corporation_tax_due: 2 })).toEqual([]);
  });
});
