import { describe, it, expect } from "vitest";
import { evaluateMarkFiled } from "@/lib/filing-mark-filed-gate";

/**
 * FIL-2 / Fix 6 — the "mark as filed" gate.
 *
 * Closes the silent bypass where any filing could be flipped to `filed` with an empty /
 * fabricated reference. A filing may be marked filed only if it was really submitted through a
 * transport (status submitted/accepted) OR an explicit reference is supplied.
 */
describe("evaluateMarkFiled (Fix 6)", () => {
  it("blocks a draft filing with no reference (the silent bypass)", () => {
    const r = evaluateMarkFiled("draft");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.error).toMatch(/reference is required/i);
  });

  it("blocks a draft filing with a whitespace-only reference", () => {
    const r = evaluateMarkFiled("ready_to_file", "   ");
    expect(r.allowed).toBe(false);
  });

  it("allows a draft/manual filing WITH an explicit reference, flagged manual", () => {
    const r = evaluateMarkFiled("ready_to_file", "  HMRC-REF-123  ");
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.reference).toBe("HMRC-REF-123"); // trimmed
      expect(r.isManual).toBe(true);
    }
  });

  it("allows an already-submitted filing with no reference, not flagged manual", () => {
    const r = evaluateMarkFiled("submitted");
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.isManual).toBe(false);
  });

  it("allows an accepted filing with no reference", () => {
    const r = evaluateMarkFiled("accepted");
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.isManual).toBe(false);
  });
});
