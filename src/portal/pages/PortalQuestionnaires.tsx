import { ClipboardList } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalQuestionnaires() {
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Questionnaires"
        description="Information requests from your accountant."
      />
      <PortalEmptyState
        icon={ClipboardList}
        title="No Questionnaires"
        description="When your accountant sends you a questionnaire, it will appear here."
      />
    </div>
  );
}