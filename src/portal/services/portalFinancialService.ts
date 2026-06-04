import { supabase } from "@/integrations/supabase/client";
import type {
  PortalEntity,
  PortalFinancialSummary,
  PortalVisibilitySettings,
} from "../types";

/**
 * Returns a financial summary anchored at the latest finalised TB snapshot.
 * Per-metric derivation from `balances` (a JSON list of accounts) requires the
 * Chart-of-Accounts mapping currently owned by the accountant-side modules.
 * Until that helper is exposed in a portal-safe shape, this function returns
 * the snapshot timestamp + null metrics so the UI can render the period
 * without ever fabricating numbers. Visibility flags still decide which tiles
 * appear.
 */
export async function getPortalFinancialSummary(
  entity: PortalEntity | null,
  _visibility: PortalVisibilitySettings,
): Promise<PortalFinancialSummary | null> {
  if (!entity) return null;
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data } = await supabase
    .from("trial_balance_snapshots")
    .select("period_end, finalised_at, status")
    .eq("organization_id", entity.organizationId)
    .eq(col, entity.id)
    .eq("status", "finalised")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    asOf: data.finalised_at ?? data.period_end,
    revenueYTD: null,
    netProfitYTD: null,
    cashBalance: null,
    vatPosition: null,
    corporationTaxEstimate: null,
  };
}