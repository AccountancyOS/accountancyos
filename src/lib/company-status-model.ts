/**
 * Pure company-status derivation (no React/DB import), unit-tested.
 *
 * Combines two independent sources of "status" that both live on the
 * `companies` row:
 *  - `status`: the practice-relationship lifecycle status
 *    (pending/active/disengaged/archived — see ENTITY_LIFECYCLE_STATUSES
 *    in src/lib/db-constants/check-constraints.ts).
 *  - `ch_company_profile.company_status`: the real-world Companies House
 *    status (active/dormant/dissolved/liquidation/administration/...),
 *    synced from the CH API.
 *
 * These can diverge (e.g. a company can be "active" in our practice
 * relationship while Companies House reports it as dormant). CH facts about
 * the company itself take precedence when they say anything other than
 * "active"; otherwise the practice lifecycle status decides.
 */

export type CompanyStatusLabel =
  | "active"
  | "dormant"
  | "dissolved"
  | "liquidation"
  | "pending"
  | "disengaged"
  | "archived"
  | "unknown";

export interface CompanyStatusInput {
  status: string | null;
  ch_company_profile: { company_status?: string | null } | null;
}

/** CH statuses (other than "active") that take precedence over the practice lifecycle status. */
const CH_STATUS_OVERRIDES: Record<string, CompanyStatusLabel> = {
  dormant: "dormant",
  dissolved: "dissolved",
  liquidation: "liquidation",
  administration: "liquidation",
  receivership: "liquidation",
  "insolvency-proceedings": "liquidation",
  "converted-closed": "dissolved",
};

const LIFECYCLE_LABELS: ReadonlySet<string> = new Set([
  "active",
  "pending",
  "disengaged",
  "archived",
]);

/** Derive a single display status for a company, for read-only presentation. */
export function deriveCompanyStatus(row: CompanyStatusInput): CompanyStatusLabel {
  const chStatus = row.ch_company_profile?.company_status?.toLowerCase().trim();

  if (chStatus && chStatus !== "active" && chStatus in CH_STATUS_OVERRIDES) {
    return CH_STATUS_OVERRIDES[chStatus];
  }

  const lifecycle = row.status?.toLowerCase().trim();
  if (lifecycle && LIFECYCLE_LABELS.has(lifecycle)) {
    return lifecycle as CompanyStatusLabel;
  }

  if (chStatus === "active") return "active";

  return "unknown";
}
