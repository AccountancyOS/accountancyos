import { MessageSquare } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalMessages() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Messages" description="Conversations with your accountant." />
      <PortalEmptyState
        icon={MessageSquare}
        title="No Messages Yet"
        description="When your accountant starts a conversation, it will appear here."
      />
    </div>
  );
}