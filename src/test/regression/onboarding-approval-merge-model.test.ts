import { describe, it, expect } from "vitest";
import {
  maskSensitiveValue,
  splitPersonName,
  SENSITIVE_MERGE_FIELDS,
} from "@/lib/onboarding-approval-merge-model";
import { isSensitive } from "@/lib/data-requirements-model";

/**
 * G2 — pure masking + identity helpers used by the onboarding-approval merge.
 * These mirror the SQL helpers `governance_mask_value` / the RPC name-split EXACTLY,
 * so a drift between the model and the migration is caught here.
 */

describe("maskSensitiveValue", () => {
  it("masks NINO/UTR identifiers with •••• + the right-2 reveal", () => {
    expect(maskSensitiveValue("person.nino", "QQ123456C")).toBe("••••6C");
    expect(maskSensitiveValue("person.utr", "1234567890")).toBe("••••90");
  });

  it("fully masks date-of-birth and home-address (no reveal)", () => {
    expect(maskSensitiveValue("person.date_of_birth", "1985-04-12")).toBe("••••");
    expect(maskSensitiveValue("person.home_address", "10 Downing Street, London")).toBe(
      "••••",
    );
  });

  it("returns non-sensitive values unchanged", () => {
    expect(maskSensitiveValue("company.utr", "9876543210")).toBe("9876543210");
    expect(maskSensitiveValue("company.vat_number", "GB123456789")).toBe("GB123456789");
    expect(maskSensitiveValue("company.paye_reference", "123/AB456")).toBe("123/AB456");
  });

  it("returns NULL in → NULL out for every field", () => {
    expect(maskSensitiveValue("person.nino", null)).toBeNull();
    expect(maskSensitiveValue("company.utr", null)).toBeNull();
  });

  it("SENSITIVE_MERGE_FIELDS are exactly the fields isSensitive() flags", () => {
    for (const key of SENSITIVE_MERGE_FIELDS) {
      expect(isSensitive(key), `${key} should be sensitive`).toBe(true);
    }
    // and non-sensitive company fields are not in the list
    expect(SENSITIVE_MERGE_FIELDS).not.toContain("company.utr");
    expect(SENSITIVE_MERGE_FIELDS).not.toContain("company.vat_number");
  });
});

describe("splitPersonName", () => {
  it("splits a two-part name into first token / remainder", () => {
    expect(splitPersonName("John Smith")).toEqual({ firstName: "John", lastName: "Smith" });
  });

  it("keeps the remainder intact for three-part names", () => {
    expect(splitPersonName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  it("uses the single token for both first and last name (last_name is NOT NULL)", () => {
    expect(splitPersonName("Cher")).toEqual({ firstName: "Cher", lastName: "Cher" });
  });

  it("collapses extra whitespace", () => {
    expect(splitPersonName("  John   Smith  ")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("handles empty / whitespace-only input without throwing", () => {
    expect(splitPersonName("")).toEqual({ firstName: "", lastName: "" });
    expect(splitPersonName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});
