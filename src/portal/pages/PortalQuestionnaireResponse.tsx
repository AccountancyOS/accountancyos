import { useParams } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalEmptyState } from "../components/PortalEmptyState";

export default function PortalQuestionnaireResponse() {
  const { id } = useParams();
  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader title="Questionnaire" description={`Reference: ${id ?? "—"}`} />
      <PortalEmptyState
        icon={ClipboardList}
        title="Questionnaire Unavailable"
        description="This questionnaire cannot be displayed yet. Backend wiring is in progress."
      />
    </div>
  );
}