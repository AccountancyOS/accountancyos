/**
 * Data-governance requirements catalog (pure, no React/DB/network).
 *
 * Spec: docs/superpowers/specs/2026-07-22-data-governance-architecture-design.md (G1).
 *
 * This is the code-side source of truth for the governed-field catalog. It mirrors the
 * seed rows inserted by supabase/migrations/20260722130000_data_governance_foundation.sql
 * into `data_requirements` — keep the two in sync when a field is added/changed.
 *
 * Values of record stay in the existing typed columns (companies, company_persons,
 * clients, client_detail_*). This catalog only describes REQUIREMENT/SENSITIVITY/
 * PROVIDER/VERIFICATION metadata per field and where the authoritative value lives —
 * it never stores or returns actual field values.
 */

import type { ClientType } from "@/lib/client-types";

export type SubjectKind = "company" | "client" | "person";
export type Sensitivity = "normal" | "sensitive";
export type Provider = "client" | "firm" | "companies_house";

export interface DataRequirement {
  /** Stable catalog key, e.g. "person.nino", "company.vat_number". */
  fieldKey: string;
  subjectKind: SubjectKind;
  /** Entity/client type codes (src/lib/client-types.ts) this field applies to. Empty = all types. */
  appliesEntityTypes: ClientType[];
  /** Service code (e.g. "vat", "payroll") required for this field to apply. Null = always applicable. */
  appliesServiceCondition: string | null;
  sensitivity: Sensitivity;
  provider: Provider;
  requiresVerification: boolean;
  authoritativeTable: string;
  authoritativeColumn: string;
}

/**
 * The governed-field catalog. Mirrors the seed rows in
 * 20260722130000_data_governance_foundation.sql — see that migration's INSERT for the
 * DB-side registration of the same catalog.
 */
export const DATA_REQUIREMENTS: DataRequirement[] = [
  {
    fieldKey: "person.nino",
    subjectKind: "person",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "sensitive",
    provider: "client",
    requiresVerification: true,
    authoritativeTable: "company_persons",
    authoritativeColumn: "nino",
  },
  {
    fieldKey: "person.utr",
    subjectKind: "person",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "sensitive",
    provider: "client",
    requiresVerification: true,
    authoritativeTable: "company_persons",
    authoritativeColumn: "utr",
  },
  {
    fieldKey: "person.date_of_birth",
    subjectKind: "person",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "sensitive",
    provider: "client",
    requiresVerification: true,
    authoritativeTable: "company_persons",
    authoritativeColumn: "date_of_birth",
  },
  {
    fieldKey: "person.home_address",
    subjectKind: "person",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "sensitive",
    provider: "client",
    requiresVerification: true,
    authoritativeTable: "company_persons",
    authoritativeColumn: "residential_address_line_1",
  },
  {
    fieldKey: "company.utr",
    subjectKind: "company",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "normal",
    provider: "client",
    requiresVerification: false,
    authoritativeTable: "companies",
    authoritativeColumn: "utr",
  },
  {
    fieldKey: "company.vat_number",
    subjectKind: "company",
    appliesEntityTypes: [],
    appliesServiceCondition: "vat",
    sensitivity: "normal",
    provider: "client",
    requiresVerification: false,
    authoritativeTable: "companies",
    authoritativeColumn: "vat_number",
  },
  {
    fieldKey: "company.paye_reference",
    subjectKind: "company",
    appliesEntityTypes: [],
    appliesServiceCondition: "payroll",
    sensitivity: "normal",
    provider: "client",
    requiresVerification: false,
    // PAYE reference lives on paye_schemes (one-to-many: a company can run several
    // schemes), not as a scalar on companies. employer_paye_reference is the anchor
    // column; like person.home_address's single-column anchor, the merge/completeness
    // layers (G2/G7) must resolve the actual scheme row — G2 decides how an onboarding-
    // captured reference materialises a scheme (a paye_schemes row also requires `name`).
    authoritativeTable: "paye_schemes",
    authoritativeColumn: "employer_paye_reference",
  },
  {
    fieldKey: "company.registered_office",
    subjectKind: "company",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "normal",
    provider: "companies_house",
    requiresVerification: false,
    authoritativeTable: "companies",
    authoritativeColumn: "registered_office_address",
  },
  {
    fieldKey: "company.trading_address",
    subjectKind: "company",
    appliesEntityTypes: [],
    appliesServiceCondition: null,
    sensitivity: "normal",
    provider: "firm",
    requiresVerification: false,
    authoritativeTable: "companies",
    authoritativeColumn: "trading_address",
  },
];

const BY_FIELD_KEY: Map<string, DataRequirement> = new Map(
  DATA_REQUIREMENTS.map((r) => [r.fieldKey, r]),
);

/** True if the field is flagged sensitive in the catalog. Unknown keys are treated as sensitive (fail closed). */
export function isSensitive(fieldKey: string): boolean {
  const req = BY_FIELD_KEY.get(fieldKey);
  if (!req) return true;
  return req.sensitivity === "sensitive";
}

/**
 * The catalog entry for a field, or undefined if the key isn't governed.
 */
export function requirementFor(fieldKey: string): DataRequirement | undefined {
  return BY_FIELD_KEY.get(fieldKey);
}

/**
 * The authoritative (table, column) a field's value of record lives in, or undefined for
 * an unknown field key.
 */
export function authoritativeRef(
  fieldKey: string,
): { table: string; column: string } | undefined {
  const req = BY_FIELD_KEY.get(fieldKey);
  if (!req) return undefined;
  return { table: req.authoritativeTable, column: req.authoritativeColumn };
}

/**
 * The requirement catalog entries applicable to a given subject: filtered by subject kind,
 * entity type (empty appliesEntityTypes = applies to all types), and engaged services
 * (a field with a non-null appliesServiceCondition only applies when that service is in
 * engagedServices). This is what onboarding/portal/reporting consult to know which fields
 * are in scope for a given subject.
 */
export function requirementsFor(
  subjectKind: SubjectKind,
  entityType: ClientType | null | undefined,
  engagedServices: string[],
): DataRequirement[] {
  return DATA_REQUIREMENTS.filter((req) => {
    if (req.subjectKind !== subjectKind) return false;
    if (
      req.appliesEntityTypes.length > 0 &&
      (!entityType || !req.appliesEntityTypes.includes(entityType))
    ) {
      return false;
    }
    if (req.appliesServiceCondition && !engagedServices.includes(req.appliesServiceCondition)) {
      return false;
    }
    return true;
  });
}
