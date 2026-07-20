/**
 * Pure Companies House helpers (no network, no I/O).
 * Provides data mapping and Basic auth header builders for CH officer data.
 */

/**
 * Companies House officer from the public API.
 * Maps fields from https://api.company-information.service.gov.uk/company/{number}/officers
 */
export interface ChOfficer {
  name: string;
  officer_role: string;
  appointed_on: string;
  resigned_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  occupation?: string;
  links?: { self?: string };
}

/**
 * Person upsert record for the company_persons table.
 */
export interface PersonUpsert {
  organization_id: string;
  first_name: string;
  last_name: string;
  nationality?: string;
  occupation?: string;
  ch_officer_id?: string;
}

/**
 * Officer row for the company_officers table.
 */
export interface OfficerRow {
  company_id: string;
  person_id: string;
  role: "director" | "secretary" | "llp_member" | "llp_designated_member";
  appointed_at: string;
  resigned_at: string | null;
  ch_appointment_id?: string;
}

/**
 * Builds a Basic auth header for Companies House API calls.
 * Format: "Basic " + base64(key + ":")
 * The password is left empty (just the colon).
 */
export function chBasicAuthHeader(key: string): string {
  return "Basic " + btoa(key + ":");
}

/**
 * Parses Companies House officer name format "SURNAME, Forename" into parts.
 * If no comma is found, treats the whole string as last_name and leaves first_name empty.
 */
export function parseChName(
  chName: string
): { first_name: string; last_name: string } {
  const parts = chName.split(",");
  if (parts.length < 2) {
    return { first_name: "", last_name: chName };
  }
  return {
    last_name: parts[0].trim(),
    first_name: parts.slice(1).join(",").trim(),
  };
}

/**
 * Maps a Companies House officer to a PersonUpsert record.
 * Extracts name, nationality, occupation, and the CH officer ID from links.self.
 */
export function mapChOfficerToPerson(
  o: ChOfficer,
  orgId: string
): PersonUpsert {
  const { first_name, last_name } = parseChName(o.name);

  const result: PersonUpsert = {
    organization_id: orgId,
    first_name,
    last_name,
  };

  if (o.nationality) {
    result.nationality = o.nationality;
  }

  if (o.occupation) {
    result.occupation = o.occupation;
  }

  if (o.links?.self) {
    result.ch_officer_id = o.links.self;
  }

  return result;
}

/**
 * Maps a Companies House officer to an OfficerRow record.
 * Handles role mapping and converts resigned_on to resigned_at (null if absent).
 *
 * Role mapping:
 * - "director" → "director"
 * - "secretary" → "secretary"
 * - "llp-member" → "llp_member"
 * - "llp-designated-member" → "llp_designated_member"
 * - anything else → "director" (default)
 */
export function mapChOfficerToOfficerRow(
  o: ChOfficer,
  companyId: string,
  personId: string
): OfficerRow {
  // Map officer role to our canonical role types
  let role: "director" | "secretary" | "llp_member" | "llp_designated_member";
  switch (o.officer_role.toLowerCase()) {
    case "secretary":
      role = "secretary";
      break;
    case "llp-member":
      role = "llp_member";
      break;
    case "llp-designated-member":
      role = "llp_designated_member";
      break;
    case "director":
    default:
      role = "director";
      break;
  }

  const result: OfficerRow = {
    company_id: companyId,
    person_id: personId,
    role,
    appointed_at: o.appointed_on,
    resigned_at: o.resigned_on ?? null,
  };

  if (o.links?.self) {
    result.ch_appointment_id = o.links.self;
  }

  return result;
}
