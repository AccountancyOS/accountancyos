import { LayoutDashboard } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalDashboard() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Dashboard"
        description="An overview of your tasks, documents, and deadlines."
      />
      <PortalEmptyState
        icon={LayoutDashboard}
        title="Nothing To Show Yet"
        description="Your dashboard will populate once your accountant assigns tasks, requests documents, or shares updates."
      />
    </div>
  );
}