import type { ClientType } from "./client-types";
import type { BillingFrequency } from "@/lib/db-constants/check-constraints";

export interface DefaultQuoteLine {
  code: string;
  billing_frequency: BillingFrequency;
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

/** A quote/proposal line for the purpose of the "Included" (zero-fee) test. */
export interface IncludableLine {
  unit_price?: number | string | null;
  subtotal?: number | string | null;
}

/**
 * A "zero-fee / Included" line is DERIVED purely from money === 0 — there is NO
 * `is_chargeable` column/flag. `unit_price` is the source of truth; when it is
 * absent we fall back to `subtotal` (which is 0 whenever unit_price is 0).
 *
 * Included lines are rendered as "Included", excluded from the one-off and
 * monthly totals, and excluded from the Stripe checkout line-item builders.
 * Single-source — reused across the UI and the checkout builder.
 */
export function isIncludedLine(line: IncludableLine | null | undefined): boolean {
  if (!line) return false;
  const unit = line.unit_price;
  if (unit !== null && unit !== undefined && unit !== "") return Number(unit) === 0;
  const sub = line.subtotal;
  if (sub !== null && sub !== undefined && sub !== "") return Number(sub) === 0;
  return false;
}