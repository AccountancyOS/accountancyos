import { describe, it, expect } from "vitest";
import {
  chOfficerToPersonDetail,
  deriveChOfficerId,
  type ChOfficerSource,
} from "@/lib/onboarding-ch-officers-model";

/**
 * G3 — pure model tests for the CH-officer -> PersonDetail mapping used by the
 * onboarding "Your details" step. Mirrors companies-house-sync's
 * mapChOfficerToPerson name-split + ch_officer_id extraction rules.
 */

describe("deriveChOfficerId", () => {
  it("uses links.self verbatim (mirrors mapChOfficerToPerson)", () => {
    expect(deriveChOfficerId("/company/12345678/appointments/abc123")).toBe(
      "/company/12345678/appointments/abc123",
    );
  });
  it("returns null for a missing / empty self link", () => {
    expect(deriveChOfficerId(undefined)).toBeNull();
    expect(deriveChOfficerId(null)).toBeNull();
    expect(deriveChOfficerId("")).toBeNull();
    expect(deriveChOfficerId("   ")).toBeNull();
  });
});

describe("chOfficerToPersonDetail", () => {
  const base: ChOfficerSource = {
    name: "STEVENS, Leon",
    officer_role: "director",
    links: { self: "/company/12345678/appointments/abc123" },
    date_of_birth_month: 4,
    date_of_birth_year: 1985,
  };

  it("splits 'SURNAME, Forename' into a natural full name", () => {
    const p = chOfficerToPersonDetail(base);
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Leon STEVENS");
  });

  it("keeps a plain (comma-less) name unchanged", () => {
    const p = chOfficerToPersonDetail({ ...base, name: "Leon Stevens" });
    expect(p!.name).toBe("Leon Stevens");
  });

  it("extracts ch_officer_id from links.self", () => {
    const p = chOfficerToPersonDetail(base);
    expect(p!.ch_officer_id).toBe("/company/12345678/appointments/abc123");
  });

  it("prefers an already-extracted ch_officer_id field (edge-return shape) over links", () => {
    const p = chOfficerToPersonDetail({
      name: "STEVENS, Leon",
      role: "Director",
      ch_officer_id: "/company/12345678/appointments/xyz789",
    });
    expect(p!.ch_officer_id).toBe("/company/12345678/appointments/xyz789");
  });

  it("carries the person_id through when supplied by the edge function", () => {
    const p = chOfficerToPersonDetail({ ...base, person_id: "11111111-1111-1111-1111-111111111111" });
    expect(p!.person_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("maps the officer role to a friendly label", () => {
    expect(chOfficerToPersonDetail({ ...base, officer_role: "director" })!.role).toBe("Director");
    expect(chOfficerToPersonDetail({ ...base, officer_role: "secretary" })!.role).toBe("Secretary");
  });

  it("never fabricates a full date_of_birth from CH month/year", () => {
    const p = chOfficerToPersonDetail(base);
    // CH gives only month/year — the full DOB must be left blank for the client.
    expect(p!.date_of_birth).toBe("");
  });

  it("skips (returns null for) an officer with no stable CH link", () => {
    expect(chOfficerToPersonDetail({ name: "NOLINK, Person", officer_role: "director" })).toBeNull();
    expect(
      chOfficerToPersonDetail({ name: "NOLINK, Person", officer_role: "director", links: {} }),
    ).toBeNull();
  });

  it("produces a stable React key derived from ch_officer_id", () => {
    const a = chOfficerToPersonDetail(base)!;
    const b = chOfficerToPersonDetail(base)!;
    expect(a._key).toBe(b._key);
  });
});
