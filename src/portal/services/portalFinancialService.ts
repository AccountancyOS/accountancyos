import type { PortalFinancialSummary } from "../types";

// TODO(batch-2): derive from ledger_entries / trial_balance_snapshots filtered
// by portal_visibility_settings. Read-only this sprint.
export async function getPortalFinancialSummary(): Promise<PortalFinancialSummary | null> {
  return null;
}