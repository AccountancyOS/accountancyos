import { describe, it, expect } from "vitest";
import { vatFilingState, vatSubmissionGateBlocked } from "@/lib/vat-filing-approval-model";

/**
 * Filing Stage B (VAT) — the submittability gate. Consumed by the approve UI (B), the submit
 * action (C) and the enforcement gate (D): a VAT return is submittable only with an accountant
 * approval of a snapshot, client approval (if required), and not already submitted.
 */
describe("vatFilingState (Stage B)", () => {
  it("unapproved return is not submittable", () => {
    const s = vatFilingState({});
    expect(s.approved).toBe(false);
    expect(s.submittable).toBe(false);
    expect(s.reason).toBe("Not approved for filing");
  });

  it("approved (snapshot + approval), no client approval required => submittable", () => {
    const s = vatFilingState({ filing_approved_at: "2026-04-01", model_snapshot_id: "snap-1" });
    expect(s.approved).toBe(true);
    expect(s.submittable).toBe(true);
    expect(s.reason).toBeUndefined();
  });

  it("approval without a snapshot id does not count as approved", () => {
    const s = vatFilingState({ filing_approved_at: "2026-04-01", model_snapshot_id: null });
    expect(s.approved).toBe(false);
    expect(s.submittable).toBe(false);
  });

  it("client approval required but not yet given blocks submission", () => {
    const s = vatFilingState({
      filing_approved_at: "2026-04-01",
      model_snapshot_id: "snap-1",
      client_approval_required: true,
      client_approved_at: null,
    });
    expect(s.approved).toBe(true);
    expect(s.clientApprovalPending).toBe(true);
    expect(s.submittable).toBe(false);
    expect(s.reason).toBe("Awaiting client approval");
  });

  it("client approval given => submittable", () => {
    const s = vatFilingState({
      filing_approved_at: "2026-04-01",
      model_snapshot_id: "snap-1",
      client_approval_required: true,
      client_approved_at: "2026-04-02",
    });
    expect(s.submittable).toBe(true);
  });

  it("already submitted is never submittable again", () => {
    const s = vatFilingState({
      filing_approved_at: "2026-04-01",
      model_snapshot_id: "snap-1",
      submitted_at: "2026-04-03",
    });
    expect(s.submitted).toBe(true);
    expect(s.submittable).toBe(false);
    expect(s.reason).toBe("Already submitted");
  });
});

describe("vatSubmissionGateBlocked (Stage D — DB trigger contract)", () => {
  it("blocks a status flip to submitted with no approved snapshot", () => {
    expect(
      vatSubmissionGateBlocked({ status: "draft" }, { status: "submitted" }),
    ).toBe(true);
  });

  it("blocks setting submitted_at with no approved snapshot", () => {
    expect(
      vatSubmissionGateBlocked({ submitted_at: null }, { submitted_at: "2026-04-03" }),
    ).toBe(true);
  });

  it("allows submitting with an approved snapshot (the Stage-C path)", () => {
    expect(
      vatSubmissionGateBlocked(
        { status: "draft" },
        { status: "submitted", model_snapshot_id: "snap-1", filing_approved_at: "2026-04-01" },
      ),
    ).toBe(false);
  });

  it("does not fire on non-submit edits or already-submitted rows", () => {
    expect(vatSubmissionGateBlocked({ status: "draft" }, { status: "draft" })).toBe(false);
    expect(
      vatSubmissionGateBlocked(
        { status: "submitted", submitted_at: "2026-04-03" },
        { status: "submitted", submitted_at: "2026-04-03" },
      ),
    ).toBe(false);
  });
});
