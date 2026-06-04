import { BarChart3 } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

/**
 * Bookkeeping in the portal is strictly read-only for this sprint.
 * Writes (invoice/bill creation, payments, categorisation, ledger edits,
 * VAT-affecting changes) are intentionally not exposed. See
 * docs/portal-disabled-features.md.
 */
export default function PortalBookkeeping() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Bookkeeping"
        description="A read-only view of your bookkeeping data."
      />
      <PortalEmptyState
        icon={BarChart3}
        title="No Financial Data Available"
        description="Once your accountant publishes financial data to your portal, it will appear here. Bookkeeping in the portal is view-only."
      />
    </div>
  );
}