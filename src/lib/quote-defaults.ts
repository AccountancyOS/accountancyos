import type { ClientType } from "./client-types";

export interface DefaultQuoteLine {
  code: string;
  billing_frequency: "now" | "monthly";
}

/**
 * Default service lines to pre-populate on a new quote, based on lead/client type.
 * Codes match services_catalog.canonical_service_code.
 */
export function getDefaultServiceCodesForLeadType(
  leadType: ClientType | string | null | undefined
): DefaultQuoteLine[] {
  switch (leadType) {
    case "sa_non_mtd":
      return [{ code: "self_assessment_non_mtd", billing_frequency: "monthly" }];
    case "sa_mtd":
      return [{ code: "self_assessment_mtd_quarterly", billing_frequency: "monthly" }];
    case "limited_company":
      return [
        { code: "accounts_production_ltd", billing_frequency: "monthly" },
        { code: "corporation_tax_return", billing_frequency: "monthly" },
        { code: "confirmation_statement", billing_frequency: "monthly" },
      ];
    case "llp":
      return [
        { code: "llp_accounts", billing_frequency: "monthly" },
        { code: "confirmation_statement", billing_frequency: "monthly" },
      ];
    case "partnership":
      return [{ code: "self_assessment_non_mtd", billing_frequency: "monthly" }];
    case "charity":
      return [{ code: "accounts_production_ltd", billing_frequency: "monthly" }];
    case "cgt":
      return [{ code: "capital_gains_tax_return", billing_frequency: "now" }];
    default:
      return [];
  }
}