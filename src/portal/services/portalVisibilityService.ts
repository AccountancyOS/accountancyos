import type { PortalVisibilitySettings } from "../types";

// TODO(batch-2): map to portal_visibility_settings.
export async function getPortalVisibilitySettings(): Promise<PortalVisibilitySettings> {
  return {
    showRevenue: false,
    showNetProfit: false,
    showCashBalance: false,
    showVatPosition: false,
    showCorporationTaxEstimate: false,
    showTransactions: false,
    showBankAccounts: false,
    showBookkeeping: false,
  };
}