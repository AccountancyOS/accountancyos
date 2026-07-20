/**
 * Pure company-status derivation (no React/DB import), unit-tested.
 *
 * Combines three independent sources of "status" that all live on the
 * `companies` row:
 *  - `status`: the practice-relationship lifecycle status
 *    (pending/active/disengaged/archived — see ENTITY_LIFECYCLE_STATUSES
 *    in src/lib/db-constants/check-constraints.ts).
 *  - `ch_company_profile.company_status`: the real-world Companies House
 *    status (active/dissolved/liquidation/administration/...), synced from
 *    the CH API. Note: CH never reports "dormant" via `company_status` —
 *    dormancy is expressed separately, via the accounts filing type below.
 *  - `ch_company_profile.accounts.last_accounts.type`: the CH accounts
 *    filing type for the company's last filed accounts. When this is
 *    "dormant" the company is dormant, regardless of `company_status`.
 *
 * These can diverge (e.g. a company can be "active" in our practice
 * relationship while Companies House reports it as dormant, or reports a
 * `company_status` other than dormant/dissolved/etc). CH facts about the
 * company itself take precedence when they say anything other than
 * "active"; otherwise the practice lifecycle status decides. Among CH
 * facts, an explicit non-active `company_status` (e.g. dissolved,
 * liquidation) wins over a "dormant" accounts filing type — a dissolved
 * company is reported as dissolved, not dormant.
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
  ch_company_profile: {
    company_status?: string | null;
    accounts?: {
      last_accounts?: { type?: string | null } | null;
    } | null;
  } | null;
}

/** CH statuses (other than "active") that take precedence over the practice lifecycle status. */
const CH_STATUS_OVERRIDES: Record<string, CompanyStatusLabel> = {
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

/**
 * True when CH's last accounts filing type marks the company dormant.
 * This is the actual CH signal for dormancy — `company_status` never
 * carries it.
 */
function isDormantByAccountsFilingType(
  chCompanyProfile: CompanyStatusInput["ch_company_profile"]
): boolean {
  const lastAccountsType = chCompanyProfile?.accounts?.last_accounts?.type?.toLowerCase().trim();
  return lastAccountsType === "dormant";
}

/** Derive a single display status for a company, for read-only presentation. */
export function deriveCompanyStatus(row: CompanyStatusInput): CompanyStatusLabel {
  const chStatus = row.ch_company_profile?.company_status?.toLowerCase().trim();

  if (chStatus && chStatus !== "active" && chStatus in CH_STATUS_OVERRIDES) {
    return CH_STATUS_OVERRIDES[chStatus];
  }

  if (isDormantByAccountsFilingType(row.ch_company_profile)) {
    return "dormant";
  }

  const lifecycle = row.status?.toLowerCase().trim();
  if (lifecycle && LIFECYCLE_LABELS.has(lifecycle)) {
    return lifecycle as CompanyStatusLabel;
  }

  if (chStatus === "active") return "active";

  return "unknown";
}
