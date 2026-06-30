import { supabase } from "@/integrations/supabase/client";
import type {
  PortalEntity,
  PortalFinancialSummary,
  PortalVisibilitySettings,
} from "../types";

// Sign convention mirrors src/lib/trial-balance-service.ts:
//   Debit-normal  (ASSET, EXPENSE):            balance = debit - credit
//   Credit-normal (LIABILITY, EQUITY, INCOME): balance = credit - debit
const CREDIT_NORMAL = new Set(["LIABILITY", "EQUITY", "INCOME"]);

function typeOf(line: any): string {
  return String(line.accountType ?? line.account_type ?? "").toUpperCase();
}

/** Per-account value: prefer the finalised closingBalance; else derive from debit/credit. */
function lineBalance(line: any): number {
  const closing = line.closingBalance ?? line.closing_balance;
  if (typeof closing === "number") return closing;
  const debit = Number(line.debit ?? 0);
  const credit = Number(line.credit ?? 0);
  return CREDIT_NORMAL.has(typeOf(line)) ? credit - debit : debit - credit;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Financial summary derived from the latest finalised TB snapshot. The snapshot's
 * `balances` array embeds accountType + isBankAccount per line, so the metrics are
 * derived directly here — no separate Chart-of-Accounts mapping needed. Visibility
 * flags null out metrics the practice has chosen not to expose. The CT estimate is a
 * tax computation (not a trial-balance figure), so it is intentionally left null
 * rather than fabricated.
 */
export async function getPortalFinancialSummary(
  entity: PortalEntity | null,
  visibility: PortalVisibilitySettings,
): Promise<PortalFinancialSummary | null> {
  if (!entity) return null;
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data } = await supabase
    .from("trial_balance_snapshots")
    .select("period_end, finalised_at, status, balances")
    .eq("organization_id", entity.organizationId)
    .eq(col, entity.id)
    .eq("status", "finalised")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const asOf = (data as any).finalised_at ?? data.period_end;
  const lines: any[] = Array.isArray((data as any).balances) ? (data as any).balances : [];

  // A finalised snapshot with no lines: show the period but don't fabricate zeros.
  if (!lines.length) {
    return {
      asOf,
      revenueYTD: null,
      netProfitYTD: null,
      cashBalance: null,
      vatPosition: null,
      corporationTaxEstimate: null,
    };
  }

  const sumWhere = (pred: (l: any) => boolean) =>
    lines.filter(pred).reduce((s, l) => s + lineBalance(l), 0);

  const revenue = sumWhere((l) => typeOf(l) === "INCOME");
  const expense = sumWhere((l) => typeOf(l) === "EXPENSE");
  const cash = sumWhere((l) => l.isBankAccount === true || l.is_bank_account === true);

  const vatLines = lines.filter((l) => {
    const sub = String(l.accountSubtype ?? l.account_subtype ?? "").toUpperCase();
    const name = String(l.accountName ?? l.account_name ?? "").toUpperCase();
    return sub === "VAT" || sub === "VAT_CONTROL" || name.includes("VAT");
  });
  const vat = vatLines.length ? vatLines.reduce((s, l) => s + lineBalance(l), 0) : null;

  return {
    asOf,
    revenueYTD: visibility.showRevenue ? round2(revenue) : null,
    netProfitYTD: visibility.showProfit ? round2(revenue - expense) : null,
    cashBalance: visibility.showCash ? round2(cash) : null,
    vatPosition: visibility.showVatPosition && vat !== null ? round2(vat) : null,
    corporationTaxEstimate: null,
  };
}
