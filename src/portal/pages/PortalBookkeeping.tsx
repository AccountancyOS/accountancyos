import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import {
  usePortalFinancialSummary,
  usePortalVisibility,
} from "../hooks/usePortalData";

/**
 * Bookkeeping in the portal is strictly read-only.
 * Writes (invoice/bill creation, payments, categorisation, ledger edits,
 * VAT-affecting changes) are intentionally not exposed. See
 * docs/portal-disabled-features.md.
 */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function PortalBookkeeping() {
  const visibility = usePortalVisibility();
  const summary = usePortalFinancialSummary();

  const v = visibility.data;
  const anyVisible =
    v &&
    (v.showRevenue ||
      v.showProfit ||
      v.showCash ||
      v.showVatPosition ||
      v.showCtEstimate ||
      v.showReceivablesPayables);

  if (visibility.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PortalPageHeader title="Bookkeeping" description="View-only financial summary." />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!anyVisible) {
    return (
      <div className="p-6 space-y-6">
        <PortalPageHeader title="Bookkeeping" description="View-only financial summary." />
        <PortalEmptyState
          icon={BarChart3}
          title="No Financial Data Available"
          description="Your accountant has not published financial data to your portal yet. Bookkeeping in the portal is view-only."
        />
      </div>
    );
  }

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Bookkeeping"
        description={
          summary.data?.asOf
            ? `As of ${new Date(summary.data.asOf).toLocaleDateString("en-GB")}.`
            : "View-only financial summary."
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {v?.showRevenue && <Tile label="Revenue (YTD)" value={fmt(summary.data?.revenueYTD)} />}
        {v?.showProfit && <Tile label="Net Profit (YTD)" value={fmt(summary.data?.netProfitYTD)} />}
        {v?.showCash && <Tile label="Cash Balance" value={fmt(summary.data?.cashBalance)} />}
        {v?.showVatPosition && <Tile label="VAT Position" value={fmt(summary.data?.vatPosition)} />}
        {v?.showCtEstimate && (
          <Tile label="Corporation Tax Estimate" value={fmt(summary.data?.corporationTaxEstimate)} />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Figures are derived from the latest published trial balance. Detailed line-level
        bookkeeping is available on request from your accountant.
      </p>
    </div>
  );
}