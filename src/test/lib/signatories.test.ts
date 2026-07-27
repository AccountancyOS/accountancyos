import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIGNING_RULE,
  validateSignatorySnapshot,
  extractActiveDirectors,
  directorToSignatory,
  individualSignatory,
  emptySnapshot,
  type SignatorySnapshot,
  type ProposalSignatory,
} from "@/lib/proposal/signatories";

/**
 * Proposal Phase 2, Task 2e — the proposal stores its OWN signatory snapshot so
 * later CH/contact changes never silently mutate an in-flight proposal. These
 * are the pure block-rules the snapshot must satisfy before it can flow to the
 * engagement letter at acceptance (that wiring is Task 2d).
 */

function sig(overrides: Partial<ProposalSignatory> = {}): ProposalSignatory {
  return {
    name: "Ada LOVELACE",
    email: "ada@example.com",
    is_primary: true,
    required: true,
    ...overrides,
  };
}

function snap(overrides: Partial<SignatorySnapshot> = {}): SignatorySnapshot {
  return { rule: "all", signatories: [sig()], ...overrides };
}

describe("DEFAULT_SIGNING_RULE", () => {
  it("defaults to all-must-sign", () => {
    expect(DEFAULT_SIGNING_RULE).toBe("all");
    expect(emptySnapshot().rule).toBe("all");
    expect(emptySnapshot().signatories).toEqual([]);
  });
});

describe("validateSignatorySnapshot", () => {
  it("accepts a single valid primary signatory under either rule", () => {
    expect(validateSignatorySnapshot(snap({ rule: "all" }))).toEqual({ ok: true, errors: [] });
    expect(validateSignatorySnapshot(snap({ rule: "any" }))).toEqual({ ok: true, errors: [] });
  });

  it("accepts several signatories with exactly one primary", () => {
    const result = validateSignatorySnapshot(
      snap({
        signatories: [
          sig({ is_primary: true }),
          sig({ name: "Bob", email: "bob@example.com", is_primary: false }),
        ],
      })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an empty signatory list", () => {
    const result = validateSignatorySnapshot(snap({ signatories: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("no_signatories");
  });

  it("rejects a signatory with a missing/blank email (carrying its index)", () => {
    const result = validateSignatorySnapshot(
      snap({ signatories: [sig({ email: "   " })] })
    );
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "missing_email");
    expect(err).toBeTruthy();
    expect(err?.index).toBe(0);
  });

  it("rejects a malformed email", () => {
    const result = validateSignatorySnapshot(
      snap({ signatories: [sig({ email: "not-an-email" })] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("invalid_email");
  });

  it("rejects when no signatory is marked primary", () => {
    const result = validateSignatorySnapshot(
      snap({ signatories: [sig({ is_primary: false })] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("no_primary");
  });

  it("rejects when more than one signatory is marked primary", () => {
    const result = validateSignatorySnapshot(
      snap({
        signatories: [
          sig({ is_primary: true }),
          sig({ name: "Bob", email: "bob@example.com", is_primary: true }),
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("multiple_primary");
  });

  it("rejects an unknown signing rule", () => {
    const result = validateSignatorySnapshot(
      snap({ rule: "majority" as unknown as SignatorySnapshot["rule"] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("invalid_rule");
  });

  it("reports every independent block reason at once", () => {
    const result = validateSignatorySnapshot({
      rule: "bogus" as unknown as SignatorySnapshot["rule"],
      signatories: [],
    });
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("no_signatories");
    expect(codes).toContain("invalid_rule");
  });
});

describe("extractActiveDirectors", () => {
  const wrapped = {
    ch_company_profile: {
      profile: { company_name: "Acme Ltd" },
      officers: [
        { name: "LOVELACE, Ada", officer_role: "director", appointed_on: "2020-01-01", links: { self: "/co/1/appointments/a" } },
        { name: "BABBAGE, Charles", officer_role: "director", appointed_on: "2019-01-01", resigned_on: "2021-06-01", links: { self: "/co/1/appointments/b" } },
        { name: "SECRETARY, Sam", officer_role: "secretary", appointed_on: "2020-01-01", links: { self: "/co/1/appointments/s" } },
      ],
    },
  };

  it("returns only active (non-resigned) directors, never resigned ones or secretaries", () => {
    const dirs = extractActiveDirectors(wrapped);
    expect(dirs).toHaveLength(1);
    expect(dirs[0].name).toBe("Ada LOVELACE");
    expect(dirs[0].ch_officer_id).toBe("/co/1/appointments/a");
    expect(dirs[0].email).toBe("");
  });

  it("returns an empty list when there is no CH profile or no officers", () => {
    expect(extractActiveDirectors(null)).toEqual([]);
    expect(extractActiveDirectors({})).toEqual([]);
    expect(extractActiveDirectors({ ch_company_profile: { profile: {} } })).toEqual([]);
  });

  it("also reads an unwrapped profile that carries officers at the top level", () => {
    const dirs = extractActiveDirectors({
      ch_company_profile: {
        company_name: "Acme Ltd",
        officers: [
          { name: "LOVELACE, Ada", officer_role: "director", appointed_on: "2020-01-01", links: { self: "/x" } },
        ],
      },
    });
    expect(dirs.map((d) => d.name)).toEqual(["Ada LOVELACE"]);
  });
});

describe("directorToSignatory / individualSignatory", () => {
  it("maps a director candidate to a required, non-primary signatory carrying its ch_officer_id", () => {
    const dir = { ch_officer_id: "/x", name: "Ada LOVELACE", email: "" };
    expect(directorToSignatory(dir)).toEqual({
      ch_officer_id: "/x",
      name: "Ada LOVELACE",
      email: "",
      is_primary: false,
      required: true,
    });
  });

  it("maps a linked individual to the sole primary, required signatory", () => {
    expect(individualSignatory({ name: "Sam Sole", email: "sam@example.com" })).toEqual({
      name: "Sam Sole",
      email: "sam@example.com",
      is_primary: true,
      required: true,
    });
  });
});
