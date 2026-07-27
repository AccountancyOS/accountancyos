/**
 * Proposal Phase 2, Task 2e — the proposal's OWN signatory snapshot.
 *
 * Pure logic (no React/DB import), unit-tested. A proposal (quote) stores an
 * immutable `signatory_snapshot` so that later Companies-House / contact changes
 * never silently mutate an in-flight proposal. At acceptance the snapshot flows
 * to `engagement_letters` / `engagement_letter_signatories` and drives the
 * all-must-sign (default) / any-one-may-sign rule — but that wiring is Task 2d;
 * NOTHING here signs, gates, or creates signatory rows.
 *
 * CH directors are read from data already loaded on the lead/company row
 * (`ch_company_profile`, whose sync shape is `{ profile, officers, pscs }`) —
 * this module never fetches from Companies House itself. It reuses the officer
 * shape + name parser from `companies-house-live.ts`.
 */

import { parseChName, type ChOfficer } from "@/lib/companies-house-live";

// ── Types ────────────────────────────────────────────────────────────────────

/** all = every required signatory must sign; any = the first valid signature suffices. */
export type SigningRule = "all" | "any";

/** Default per spec: an all-must-sign engagement letter. */
export const DEFAULT_SIGNING_RULE: SigningRule = "all";

/**
 * One signer captured on the proposal. A signatory may be sourced from a CH
 * officer (`ch_officer_id`), a persisted company person / contact
 * (`person_id` / `contact_id`), or entered manually (all id fields null). CH
 * never supplies an email, so `email` is captured/edited by the accountant and
 * preserved verbatim on the snapshot.
 */
export interface ProposalSignatory {
  person_id?: string | null;
  contact_id?: string | null;
  ch_officer_id?: string | null;
  name: string;
  email: string;
  /** Exactly one signatory on a snapshot is the primary contact. */
  is_primary: boolean;
  /** Whether this signatory's signature counts toward the signing rule. */
  required: boolean;
}

export interface SignatorySnapshot {
  rule: SigningRule;
  signatories: ProposalSignatory[];
}

export type SignatoryValidationCode =
  | "no_signatories"
  | "missing_email"
  | "invalid_email"
  | "no_primary"
  | "multiple_primary"
  | "invalid_rule";

export interface SignatoryValidationError {
  code: SignatoryValidationCode;
  message: string;
  /** Present for per-signatory errors — the index into `signatories`. */
  index?: number;
}

export interface SignatoryValidationResult {
  ok: boolean;
  errors: SignatoryValidationError[];
}

/** A director offered for selection, extracted from already-loaded CH data. */
export interface DirectorCandidate {
  /** CH appointment link (`links.self`) — stable per appointment; null if absent. */
  ch_officer_id: string | null;
  name: string;
  /** CH never provides an email — always "" until the accountant fills it in. */
  email: string;
}

// ── Constructors ──────────────────────────────────────────────────────────────

export function emptySnapshot(): SignatorySnapshot {
  return { rule: DEFAULT_SIGNING_RULE, signatories: [] };
}

/** A CH director → a required, non-primary signatory (primary is chosen in the UI). */
export function directorToSignatory(dir: DirectorCandidate): ProposalSignatory {
  return {
    ch_officer_id: dir.ch_officer_id,
    name: dir.name,
    email: dir.email,
    is_primary: false,
    required: true,
  };
}

/** The linked SA/individual → the sole, primary, required signatory. */
export function individualSignatory(person: { name: string; email: string }): ProposalSignatory {
  return {
    name: person.name,
    email: person.email,
    is_primary: true,
    required: true,
  };
}

// ── CH director extraction (pure — reads already-loaded data only) ────────────

/** A row carrying a Companies-House snapshot (lead or company). */
export interface CHOfficerSource {
  ch_company_profile?: unknown;
}

/**
 * Locate the officers array regardless of whether the CH profile is stored
 * wrapped (`{ profile, officers, pscs }`, the sync shape) or flat with officers
 * at the top level. Mirrors the defensive resolution in `accounts-periods.ts`.
 */
function resolveOfficers(chProfile: unknown): ChOfficer[] {
  if (!chProfile || typeof chProfile !== "object") return [];
  const root = chProfile as Record<string, unknown>;
  if (Array.isArray(root.officers)) return root.officers as ChOfficer[];
  const wrapped = root.profile as Record<string, unknown> | undefined;
  if (wrapped && typeof wrapped === "object" && Array.isArray(wrapped.officers)) {
    return wrapped.officers as ChOfficer[];
  }
  return [];
}

function chOfficerDisplayName(o: ChOfficer): string {
  const { first_name, last_name } = parseChName(o.name ?? "");
  return [first_name, last_name].filter(Boolean).join(" ").trim() || (o.name ?? "").trim();
}

/**
 * Active directors offered for signatory selection. Only officers whose role is
 * a director and who have NOT resigned are returned — resigned directors are
 * never auto-added (spec). Secretaries and other roles are excluded.
 */
export function extractActiveDirectors(source: CHOfficerSource | null | undefined): DirectorCandidate[] {
  if (!source) return [];
  const officers = resolveOfficers(source.ch_company_profile);
  return officers
    .filter((o) => !o.resigned_on && typeof o.officer_role === "string" && o.officer_role.toLowerCase().includes("director"))
    .map((o) => ({
      ch_officer_id: o.links?.self ?? null,
      name: chOfficerDisplayName(o),
      email: "",
    }));
}

// ── Validation ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Enforce the snapshot block-rules before it may flow to the engagement letter:
 * at least one signatory, every signatory has a valid email, exactly one
 * primary, and a known signing rule. Returns every independent failure so the
 * UI can surface them together.
 */
export function validateSignatorySnapshot(snap: SignatorySnapshot): SignatoryValidationResult {
  const errors: SignatoryValidationError[] = [];

  if (snap.rule !== "all" && snap.rule !== "any") {
    errors.push({ code: "invalid_rule", message: "Signing rule must be 'all' or 'any'." });
  }

  const signatories = Array.isArray(snap.signatories) ? snap.signatories : [];

  if (signatories.length === 0) {
    errors.push({ code: "no_signatories", message: "Add at least one signatory." });
  }

  signatories.forEach((s, index) => {
    const email = (s.email ?? "").trim();
    if (email.length === 0) {
      errors.push({ code: "missing_email", message: `${s.name || "Signatory"} needs an email address.`, index });
    } else if (!EMAIL_RE.test(email)) {
      errors.push({ code: "invalid_email", message: `${s.name || "Signatory"} has an invalid email address.`, index });
    }
  });

  if (signatories.length > 0) {
    const primaryCount = signatories.filter((s) => s.is_primary).length;
    if (primaryCount === 0) {
      errors.push({ code: "no_primary", message: "Mark one signatory as the primary contact." });
    } else if (primaryCount > 1) {
      errors.push({ code: "multiple_primary", message: "Only one signatory can be the primary contact." });
    }
  }

  return { ok: errors.length === 0, errors };
}
