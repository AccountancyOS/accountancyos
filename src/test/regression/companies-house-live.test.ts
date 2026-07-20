import { describe, it, expect } from "vitest";
import {
  chBasicAuthHeader,
  parseChName,
  mapChOfficerToPerson,
  mapChOfficerToOfficerRow,
} from "@/lib/companies-house-live";

describe("chBasicAuthHeader", () => {
  it("returns Basic auth header with key as username, empty password", () => {
    expect(chBasicAuthHeader("ABC123")).toBe("Basic " + btoa("ABC123:"));
  });

  it("handles special characters in key", () => {
    const key = "test-key_123!";
    expect(chBasicAuthHeader(key)).toBe("Basic " + btoa(key + ":"));
  });
});

describe("parseChName", () => {
  it("splits 'SMITH, John' into last/first", () => {
    expect(parseChName("SMITH, John")).toEqual({
      first_name: "John",
      last_name: "SMITH",
    });
  });

  it("handles name with no comma (fallback to whole string as last_name)", () => {
    expect(parseChName("SINGLENAME")).toEqual({
      first_name: "",
      last_name: "SINGLENAME",
    });
  });

  it("handles multiple spaces in name", () => {
    expect(parseChName("DOE, Jane Mary")).toEqual({
      first_name: "Jane Mary",
      last_name: "DOE",
    });
  });
});

describe("mapChOfficerToPerson", () => {
  it("maps basic officer to person with first and last name", () => {
    const officer: any = {
      name: "SMITH, John",
      officer_role: "director",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToPerson(officer, "org-123");
    expect(result.organization_id).toBe("org-123");
    expect(result.first_name).toBe("John");
    expect(result.last_name).toBe("SMITH");
  });

  it("includes optional fields when present", () => {
    const officer: any = {
      name: "JONES, Sarah",
      officer_role: "secretary",
      appointed_on: "2020-06-01",
      nationality: "British",
      occupation: "Company Director",
      links: { self: "/company/123456/appointments/abc123" },
    };
    const result = mapChOfficerToPerson(officer, "org-456");
    expect(result.nationality).toBe("British");
    expect(result.occupation).toBe("Company Director");
    expect(result.ch_officer_id).toBe("/company/123456/appointments/abc123");
  });

  it("omits optional fields when absent", () => {
    const officer: any = {
      name: "BROWN, Bob",
      officer_role: "director",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToPerson(officer, "org-789");
    expect(result.nationality).toBeUndefined();
    expect(result.occupation).toBeUndefined();
    expect(result.ch_officer_id).toBeUndefined();
  });
});

describe("mapChOfficerToOfficerRow", () => {
  it("maps director role correctly", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "director",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "company-123", "person-456");
    expect(result.role).toBe("director");
    expect(result.company_id).toBe("company-123");
    expect(result.person_id).toBe("person-456");
    expect(result.appointed_at).toBe("2020-01-01");
    expect(result.resigned_at).toBeNull();
  });

  it("maps secretary role correctly", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "secretary",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.role).toBe("secretary");
  });

  it("maps unknown role to director (default)", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "nominee-director",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.role).toBe("director");
  });

  it("maps llp-member role to llp_member", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "llp-member",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.role).toBe("llp_member");
  });

  it("maps llp_designated_member role", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "llp-designated-member",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.role).toBe("llp_designated_member");
  });

  it("sets resigned_at to null when resigned_on is absent", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "director",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.resigned_at).toBeNull();
  });

  it("sets resigned_at from resigned_on when present", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "director",
      appointed_on: "2020-01-01",
      resigned_on: "2023-06-15",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.resigned_at).toBe("2023-06-15");
  });

  it("includes ch_appointment_id from links.self", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "director",
      appointed_on: "2020-01-01",
      links: { self: "/company/123456/appointments/abc123" },
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.ch_appointment_id).toBe("/company/123456/appointments/abc123");
  });

  it("omits ch_appointment_id when links is absent", () => {
    const officer: any = {
      name: "X, Y",
      officer_role: "director",
      appointed_on: "2020-01-01",
    };
    const result = mapChOfficerToOfficerRow(officer, "c", "p");
    expect(result.ch_appointment_id).toBeUndefined();
  });
});
