import { CheckSquare } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalTasks() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Tasks" description="Items requiring your attention." />
      <PortalEmptyState
        icon={CheckSquare}
        title="No Tasks Assigned"
        description="You will see tasks here when your accountant assigns work that requires your input."
      />
    </div>
  );
}