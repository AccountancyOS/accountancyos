import { BarChart3, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";
import {
  usePortalFinancialSummary,
  usePortalVisibility,
} from "../hooks/usePortalData";
import { usePortalBookkeepingAccess } from "../hooks/usePortalBookkeepingAccess";
import PortalBookkeepingFull from "./PortalBookkeepingFull";

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
  const access = usePortalBookkeepingAccess();
  const visibility = usePortalVisibility();
  const summary = usePortalFinancialSummary();

  // While we determine service status, show a skeleton.
  if (access.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PortalPageHeader title="Bookkeeping" description="Loading…" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Bookkeeping service active → render the full module.
  if (access.data === true) {
    return <PortalBookkeepingFull />;
  }

  // Otherwise fall back to the legacy read-only summary (preserves any
  // previously published figures so historical context is not lost).

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
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Bookkeeping Service Not Active</AlertTitle>
          <AlertDescription>
            The bookkeeping service is not currently active on your account. Contact your accountant to enable it and unlock bank feeds, invoicing, and transaction categorisation. Any prior data is retained and will reappear here if the service is reactivated.
          </AlertDescription>
        </Alert>
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