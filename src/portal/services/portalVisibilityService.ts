import { supabase } from "@/integrations/supabase/client";
import type { PortalEntity, PortalVisibilitySettings } from "../types";

const ALL_FALSE: PortalVisibilitySettings = {
  showRevenue: false,
  showProfit: false,
  showCash: false,
  showVatPosition: false,
  showCtEstimate: false,
  showReceivablesPayables: false,
  showTransactions: false,
  showBankAccounts: false,
  showInvoices: false,
  showTrialBalance: false,
  showDetailedLedger: false,
};

/**
 * Reads public.portal_visibility_settings for the current entity. Falls back
 * to an all-off default when no row exists — accountants must explicitly opt
 * in to each metric.
 */
export async function getPortalVisibilitySettings(
  entity: PortalEntity | null,
): Promise<PortalVisibilitySettings> {
  if (!entity) return ALL_FALSE;
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data } = await supabase
    .from("portal_visibility_settings")
    .select(
      "show_revenue, show_profit, show_cash, show_vat_position, show_ct_estimate, show_receivables_payables, show_transactions, show_bank_accounts, show_invoices, show_trial_balance, show_detailed_ledger",
    )
    .eq("organization_id", entity.organizationId)
    .eq(col, entity.id)
    .maybeSingle();
  if (!data) return ALL_FALSE;
  return {
    showRevenue: !!data.show_revenue,
    showProfit: !!data.show_profit,
    showCash: !!data.show_cash,
    showVatPosition: !!data.show_vat_position,
    showCtEstimate: !!data.show_ct_estimate,
    showReceivablesPayables: !!data.show_receivables_payables,
    showTransactions: !!data.show_transactions,
    showBankAccounts: !!data.show_bank_accounts,
    showInvoices: !!data.show_invoices,
    showTrialBalance: !!data.show_trial_balance,
    showDetailedLedger: !!data.show_detailed_ledger,
  };
}