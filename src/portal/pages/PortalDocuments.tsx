import { FolderOpen } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalDocuments() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Documents"
        description="Documents shared between you and your accountant."
      />
      <PortalEmptyState
        icon={FolderOpen}
        title="No Documents Yet"
        description="Documents shared by your accountant or uploaded by you will appear here."
      />
    </div>
  );
}