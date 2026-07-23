// G3 — pure CH-officer -> PersonDetail mapping for the onboarding "Your details" step.
//
// The onboarding-fetch-ch-officers edge function fetches a company's directors
// from Companies House, upserts them into company_persons, and returns them
// carrying a stable person_id (= company_persons.id) and ch_officer_id. This
// helper maps each returned officer into the PersonDetail shape the UI edits,
// preserving those keys so G2's approval-merge MERGES into the existing CH
// person instead of creating a duplicate.
//
// It mirrors companies-house-sync's mapChOfficerToPerson name-split and
// ch_officer_id extraction (ch_officer_id === links.self, verbatim) so the
// frontend and the edge function agree. Kept pure and dependency-light so it is
// unit-testable in Node/Vitest.

import { type PersonDetail, emptyAddress } from "@/components/onboarding/YourDetailsStep/types";

/**
 * Input shape accepted by chOfficerToPersonDetail. It tolerates BOTH:
 *  - the onboarding-fetch-ch-officers edge return
 *    ({ person_id, ch_officer_id, name, role, date_of_birth_month/year }), and
 *  - a raw CH officer item ({ name, officer_role, links.self, ... }),
 * so the same helper can be exercised directly against CH fixtures in tests.
 */
export interface ChOfficerSource {
  person_id?: string | null;
  /** Already-extracted CH officer id (edge return). Equals links.self. */
  ch_officer_id?: string | null;
  name: string;
  /** Friendly role (edge return). */
  role?: string | null;
  /** Raw CH role token, e.g. "director" (raw CH item). */
  officer_role?: string | null;
  /** Raw CH links object — ch_officer_id is derived from links.self. */
  links?: { self?: string | null } | null;
  date_of_birth_month?: number | null;
  date_of_birth_year?: number | null;
}

/**
 * Derives a stable ch_officer_id from a CH links.self value.
 * Mirrors mapChOfficerToPerson exactly: the whole links.self string IS the
 * ch_officer_id (not a parsed suffix). Returns null when absent/blank so the
 * caller can skip officers with no stable dedupe key.
 */
export function deriveChOfficerId(self: string | null | undefined): string | null {
  if (!self) return null;
  const trimmed = self.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Splits a CH officer name into first/last, mirroring companies-house-sync's
 * parseChName: "SURNAME, Forename" -> { first: "Forename", last: "SURNAME" };
 * a comma-less name is treated wholly as the last name (returned unchanged as
 * the display name by the caller).
 */
function splitChName(chName: string): { first: string; last: string } {
  const parts = chName.split(",");
  if (parts.length < 2) {
    return { first: "", last: chName.trim() };
  }
  return {
    last: parts[0].trim(),
    first: parts.slice(1).join(",").trim(),
  };
}

const ROLE_LABELS: Record<string, string> = {
  director: "Director",
  secretary: "Secretary",
  "llp-member": "LLP Member",
  "llp-designated-member": "LLP Designated Member",
  "corporate-director": "Corporate Director",
  "nominee-director": "Nominee Director",
};

function friendlyRole(source: ChOfficerSource): string {
  // Edge return already carries a friendly `role`; a raw CH item carries
  // `officer_role`. Prefer whichever is present.
  const raw = (source.role ?? source.officer_role ?? "").trim();
  if (!raw) return "";
  const mapped = ROLE_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;
  // Title-case an unknown hyphenated CH token as a reasonable fallback.
  return raw
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Maps one CH officer (edge return or raw CH item) to a PersonDetail, or null
 * when the officer has no stable CH link (no ch_officer_id / links.self) and
 * must be skipped.
 *
 * DOB is deliberately left blank: Companies House only publishes an officer's
 * month/year of birth, so a full date_of_birth must be completed by the client
 * — it is never fabricated here.
 */
export function chOfficerToPersonDetail(source: ChOfficerSource): PersonDetail | null {
  const chOfficerId = deriveChOfficerId(source.ch_officer_id) ?? deriveChOfficerId(source.links?.self);
  if (!chOfficerId) return null;

  const { first, last } = splitChName(source.name ?? "");
  const displayName = [first, last].filter(Boolean).join(" ").trim();

  return {
    // Stable, deterministic React key so a re-fetch/refresh reuses the same row.
    _key: `ch-${chOfficerId}`,
    name: displayName,
    role: friendlyRole(source),
    date_of_birth: "", // CH gives month/year only — never fabricate a full DOB.
    nino: "",
    utr: "",
    home_address: emptyAddress(),
    person_id: source.person_id ?? null,
    ch_officer_id: chOfficerId,
  };
}

/**
 * True when a person originated from Companies House (has a ch_officer_id).
 * Used by the UI to label CH-sourced people and to dedupe on refresh.
 */
export function isChSourced(p: Pick<PersonDetail, "ch_officer_id">): boolean {
  return !!p.ch_officer_id;
}

/**
 * Merges freshly-fetched CH people into the current list without duplicating:
 *  - CH people are matched by ch_officer_id; an incoming CH person replaces the
 *    existing CH row with the same ch_officer_id (preserving any client-entered
 *    fields the caller chose to carry), and new CH people are appended.
 *  - Manually-added people (no ch_officer_id) are always preserved.
 */
export function mergeChPeople(existing: PersonDetail[], incoming: PersonDetail[]): PersonDetail[] {
  const incomingByChId = new Map<string, PersonDetail>();
  for (const p of incoming) {
    if (p.ch_officer_id) incomingByChId.set(p.ch_officer_id, p);
  }

  const result: PersonDetail[] = [];
  const consumed = new Set<string>();

  for (const p of existing) {
    if (p.ch_officer_id && incomingByChId.has(p.ch_officer_id)) {
      const fresh = incomingByChId.get(p.ch_officer_id)!;
      // Preserve any details the client already filled in on the CH row.
      result.push({
        ...fresh,
        _key: p._key,
        date_of_birth: p.date_of_birth || fresh.date_of_birth,
        nino: p.nino || fresh.nino,
        utr: p.utr || fresh.utr,
        home_address: p.home_address ?? fresh.home_address,
        person_id: fresh.person_id ?? p.person_id ?? null,
      });
      consumed.add(p.ch_officer_id);
    } else {
      result.push(p);
    }
  }

  for (const p of incoming) {
    if (p.ch_officer_id && !consumed.has(p.ch_officer_id)) {
      result.push(p);
    }
  }

  return result;
}
