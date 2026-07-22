/**
 * Onboarding-approval merge — pure helpers (no React/DB/network).
 *
 * Spec: docs/superpowers/specs/2026-07-22-data-governance-architecture-design.md (G2).
 *
 * These mirror, EXACTLY, the SQL used by the G2 merge RPC
 * (supabase/migrations/20260722150000_approve_onboarding_transactional.sql):
 *   - `maskSensitiveValue`  ↔ `public.governance_mask_value(field_key, val)`
 *   - `splitPersonName`     ↔ the RPC's first-token / remainder name split
 * Keep the two sides in lockstep — the source-structure test asserts the SQL
 * masking helper exists and this file's unit tests pin the exact outputs.
 *
 * Sensitivity is NOT redefined here: it is imported from the governed-field
 * catalog (`isSensitive`) so there is one source of truth for what is sensitive.
 */

import { isSensitive } from "@/lib/data-requirements-model";

/** Mask glyph — four bullets. Matches the SQL helper's literal. */
const MASK = "••••";

/**
 * Sensitive identifier fields where masking reveals the right-2 characters
 * (e.g. NINO suffix), matching `'••••' || right(p_val, 2)` in SQL.
 */
const IDENTIFIER_MERGE_FIELDS = new Set<string>(["person.nino", "person.utr"]);

/**
 * The sensitive person fields the onboarding merge writes. Every entry here is
 * flagged `sensitive` by the governed-field catalog (asserted in tests). NINO/UTR
 * reveal the right-2; date-of-birth / home-address are fully masked.
 */
export const SENSITIVE_MERGE_FIELDS: string[] = [
  "person.nino",
  "person.utr",
  "person.date_of_birth",
  "person.home_address",
];

/**
 * Masked form of a value for a governed field, for storage in the audit log's
 * `*_masked` columns. Mirrors `public.governance_mask_value` EXACTLY for every
 * field key the merge uses:
 *   - NULL in → NULL out.
 *   - non-sensitive field → value unchanged.
 *   - sensitive identifier (nino/utr) → '••••' + last 2 chars.
 *   - sensitive dob/home-address → '••••'.
 */
export function maskSensitiveValue(
  fieldKey: string,
  value: string | null,
): string | null {
  if (value === null) return null;
  if (!isSensitive(fieldKey)) return value;
  if (IDENTIFIER_MERGE_FIELDS.has(fieldKey)) return MASK + value.slice(-2);
  return MASK;
}

/**
 * Split a captured full name into first / last, matching the RPC's SQL split:
 * first whitespace-delimited token is the first name, the remainder is the last
 * name; a single token is used for BOTH (last_name is NOT NULL on company_persons).
 * Empty/whitespace-only input yields empty strings (never throws).
 */
export function splitPersonName(name: string): {
  firstName: string;
  lastName: string;
} {
  const tokens = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: tokens[0] };
  return { firstName: tokens[0], lastName: tokens.slice(1).join(" ") };
}
