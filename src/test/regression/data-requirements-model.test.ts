import { describe, it, expect } from "vitest";
import {
  DATA_REQUIREMENTS,
  isSensitive,
  requirementFor,
  requirementsFor,
  authoritativeRef,
} from "@/lib/data-requirements-model";

/**
 * G1 — pins the pure requirements-catalog model that drives onboarding/portal/chasing/
 * reporting completeness (one definition, every surface). Mirrors the seed rows in
 * supabase/migrations/20260722130000_data_governance_foundation.sql.
 */
describe("data-requirements-model (G1 catalog)", () => {
  describe("catalog completeness", () => {
    it("has a unique fieldKey per entry", () => {
      const keys = DATA_REQUIREMENTS.map((r) => r.fieldKey);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("contains every known seeded field", () => {
      const keys = new Set(DATA_REQUIREMENTS.map((r) => r.fieldKey));
      expect(keys).toEqual(
        new Set([
          "person.nino",
          "person.utr",
          "person.date_of_birth",
          "person.home_address",
          "company.utr",
          "company.vat_number",
          "company.paye_reference",
          "company.registered_office",
          "company.trading_address",
        ]),
      );
    });
  });

  describe("isSensitive", () => {
    it("flags NINO/UTR/DOB/home address as sensitive", () => {
      expect(isSensitive("person.nino")).toBe(true);
      expect(isSensitive("person.utr")).toBe(true);
      expect(isSensitive("person.date_of_birth")).toBe(true);
      expect(isSensitive("person.home_address")).toBe(true);
    });

    it("does not flag normal company fields as sensitive", () => {
      expect(isSensitive("company.utr")).toBe(false);
      expect(isSensitive("company.vat_number")).toBe(false);
      expect(isSensitive("company.paye_reference")).toBe(false);
      expect(isSensitive("company.registered_office")).toBe(false);
      expect(isSensitive("company.trading_address")).toBe(false);
    });

    it("fails closed (treats as sensitive) for an unknown field key", () => {
      expect(isSensitive("company.not_a_real_field")).toBe(true);
    });
  });

  describe("authoritativeRef", () => {
    it("resolves the mapped typed column for a known field", () => {
      expect(authoritativeRef("person.nino")).toEqual({ table: "company_persons", column: "nino" });
      expect(authoritativeRef("company.vat_number")).toEqual({ table: "companies", column: "vat_number" });
      expect(authoritativeRef("company.registered_office")).toEqual({
        table: "companies",
        column: "registered_office_address",
      });
    });

    it("anchors company.paye_reference to paye_schemes, not a non-existent companies column", () => {
      // Regression: the catalog must point at a column that actually exists. PAYE
      // reference lives on paye_schemes.employer_paye_reference (companies has no
      // paye_reference column), so the anchor must reference the real child table.
      expect(authoritativeRef("company.paye_reference")).toEqual({
        table: "paye_schemes",
        column: "employer_paye_reference",
      });
    });

    it("returns undefined for an unknown field key", () => {
      expect(authoritativeRef("company.not_a_real_field")).toBeUndefined();
    });
  });

  describe("requirementFor", () => {
    it("returns the full catalog entry for a known key", () => {
      const req = requirementFor("person.utr");
      expect(req?.subjectKind).toBe("person");
      expect(req?.provider).toBe("client");
      expect(req?.requiresVerification).toBe(true);
    });

    it("returns undefined for an unknown key", () => {
      expect(requirementFor("nope")).toBeUndefined();
    });
  });

  describe("requirementsFor — subject-kind filtering", () => {
    it("returns only person-subject fields for subjectKind 'person'", () => {
      const fields = requirementsFor("person", "limited_company", []).map((r) => r.fieldKey);
      expect(fields.sort()).toEqual(
        ["person.date_of_birth", "person.home_address", "person.nino", "person.utr"].sort(),
      );
    });

    it("returns only company-subject fields for subjectKind 'company' (with no services engaged)", () => {
      const fields = requirementsFor("company", "limited_company", []).map((r) => r.fieldKey);
      expect(fields.sort()).toEqual(
        ["company.registered_office", "company.trading_address", "company.utr"].sort(),
      );
    });

    it("returns nothing for subjectKind 'client' (no client.* fields in the catalog yet)", () => {
      expect(requirementsFor("client", "sa_non_mtd", [])).toEqual([]);
    });
  });

  describe("requirementsFor — service-conditional applicability", () => {
    it("excludes company.vat_number when VAT is not engaged", () => {
      const fields = requirementsFor("company", "limited_company", []).map((r) => r.fieldKey);
      expect(fields).not.toContain("company.vat_number");
    });

    it("includes company.vat_number only when 'vat' is engaged", () => {
      const fields = requirementsFor("company", "limited_company", ["vat"]).map((r) => r.fieldKey);
      expect(fields).toContain("company.vat_number");
    });

    it("excludes company.paye_reference when payroll is not engaged", () => {
      const fields = requirementsFor("company", "limited_company", ["vat"]).map((r) => r.fieldKey);
      expect(fields).not.toContain("company.paye_reference");
    });

    it("includes company.paye_reference only when 'payroll' is engaged", () => {
      const fields = requirementsFor("company", "limited_company", ["payroll"]).map((r) => r.fieldKey);
      expect(fields).toContain("company.paye_reference");
    });

    it("engaging both services surfaces both conditional fields alongside the always-on ones", () => {
      const fields = requirementsFor("company", "limited_company", ["vat", "payroll"]).map((r) => r.fieldKey);
      expect(fields.sort()).toEqual(
        [
          "company.registered_office",
          "company.trading_address",
          "company.utr",
          "company.vat_number",
          "company.paye_reference",
        ].sort(),
      );
    });
  });

  describe("requirementsFor — entity-type filtering", () => {
    it("fields with an empty appliesEntityTypes apply regardless of entity type", () => {
      const forLtd = requirementsFor("company", "limited_company", []).map((r) => r.fieldKey);
      const forSaNonMtd = requirementsFor("company", "sa_non_mtd", []).map((r) => r.fieldKey);
      expect(forLtd.sort()).toEqual(forSaNonMtd.sort());
    });

    it("returns entity-type-agnostic fields even when entityType is not provided", () => {
      const fields = requirementsFor("company", null, []).map((r) => r.fieldKey);
      expect(fields.sort()).toEqual(
        ["company.registered_office", "company.trading_address", "company.utr"].sort(),
      );
    });
  });
});
