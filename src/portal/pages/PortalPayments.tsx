import { CreditCard } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalPayments() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Payments" description="Your invoices and payment history." />
      <PortalEmptyState
        icon={CreditCard}
        title="No Invoices Issued"
        description="Invoices from your accountant will appear here once issued."
      />
    </div>
  );
}