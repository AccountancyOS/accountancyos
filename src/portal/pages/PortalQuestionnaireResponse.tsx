import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPortalQuestionnaire } from "../services/portalQuestionnairesService";
import { portalPath } from "../utils/portalPaths";

/**
 * Portal questionnaire responder. Defers to the existing public token-based
 * response page at /questionnaire/:id?token=... so we don't fork the answer
 * collection UI.
 */
export default function PortalQuestionnaireResponse() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "questionnaire", id],
    queryFn: () => getPortalQuestionnaire(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.responseUrl) {
      window.location.replace(data.responseUrl);
    } else if (!isLoading && !data) {
      navigate(portalPath("questionnaires"), { replace: true });
    }
  }, [data, isLoading, navigate]);

  return (
    <div className="p-6 flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}