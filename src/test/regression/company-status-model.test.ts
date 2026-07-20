import { describe, it, expect } from "vitest";
import { deriveCompanyStatus } from "@/lib/company-status-model";

describe("deriveCompanyStatus", () => {
  it("returns active when CH reports active and the practice status is active", () => {
    expect(
      deriveCompanyStatus({ status: "active", ch_company_profile: { company_status: "active" } })
    ).toBe("active");
  });

  it("returns dormant when CH reports dormant, even if the practice relationship is active", () => {
    expect(
      deriveCompanyStatus({ status: "active", ch_company_profile: { company_status: "dormant" } })
    ).toBe("dormant");
  });

  it("returns dissolved when CH reports dissolved", () => {
    expect(
      deriveCompanyStatus({ status: "archived", ch_company_profile: { company_status: "dissolved" } })
    ).toBe("dissolved");
  });

  it("returns liquidation for liquidation and administration CH statuses", () => {
    expect(
      deriveCompanyStatus({ status: "active", ch_company_profile: { company_status: "liquidation" } })
    ).toBe("liquidation");
    expect(
      deriveCompanyStatus({ status: "active", ch_company_profile: { company_status: "administration" } })
    ).toBe("liquidation");
  });

  it("is case/whitespace insensitive on the CH status", () => {
    expect(
      deriveCompanyStatus({ status: "active", ch_company_profile: { company_status: " Dormant " } })
    ).toBe("dormant");
  });

  it("falls back to the practice lifecycle status when CH data is missing", () => {
    expect(deriveCompanyStatus({ status: "disengaged", ch_company_profile: null })).toBe("disengaged");
    expect(deriveCompanyStatus({ status: "archived", ch_company_profile: null })).toBe("archived");
    expect(deriveCompanyStatus({ status: "pending", ch_company_profile: null })).toBe("pending");
  });

  it("falls back to the practice lifecycle status when CH reports active", () => {
    expect(
      deriveCompanyStatus({ status: "disengaged", ch_company_profile: { company_status: "active" } })
    ).toBe("disengaged");
  });

  it("returns unknown when neither source gives a usable value", () => {
    expect(deriveCompanyStatus({ status: null, ch_company_profile: null })).toBe("unknown");
  });
});
