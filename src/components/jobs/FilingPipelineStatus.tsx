import { CheckCircle, Circle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStep {
  id: string;
  label: string;
  status: "completed" | "in_progress" | "pending" | "failed";
}

interface FilingPipelineStatusProps {
  questionnaireStatus?: string;
  workpaperStatus?: string;
  filingStatus?: string;
}

export function FilingPipelineStatus({
  questionnaireStatus = "pending",
  workpaperStatus = "pending",
  filingStatus = "pending",
}: FilingPipelineStatusProps) {
  const getStepStatus = (
    stepType: string,
    currentStatus: string
  ): "completed" | "in_progress" | "pending" | "failed" => {
    switch (stepType) {
      case "questionnaire":
        if (currentStatus === "submitted" || currentStatus === "reviewed") return "completed";
        if (currentStatus === "in_progress" || currentStatus === "started") return "in_progress";
        if (currentStatus === "sent") return "in_progress";
        return "pending";
      case "workpaper":
        if (currentStatus === "finalised") return "completed";
        if (currentStatus === "ready_for_review") return "in_progress";
        if (currentStatus === "in_progress" || currentStatus === "draft") return "in_progress";
        return "pending";
      case "filing":
        if (currentStatus === "filed") return "completed";
        if (currentStatus === "rejected") return "failed";
        if (
          currentStatus === "awaiting_approval" ||
          currentStatus === "approved" ||
          currentStatus === "ready_to_file" ||
          currentStatus === "draft"
        )
          return "in_progress";
        return "pending";
      default:
        return "pending";
    }
  };

  const steps: PipelineStep[] = [
    {
      id: "questionnaire",
      label: "Questionnaire",
      status: getStepStatus("questionnaire", questionnaireStatus),
    },
    {
      id: "workpaper",
      label: "Workpaper",
      status: getStepStatus("workpaper", workpaperStatus),
    },
    {
      id: "filing",
      label: "Filing",
      status: getStepStatus("filing", filingStatus),
    },
  ];

  const getStepIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 border-green-600 bg-green-50";
      case "in_progress":
        return "text-blue-600 border-blue-600 bg-blue-50";
      case "failed":
        return "text-red-600 border-red-600 bg-red-50";
      default:
        return "text-gray-400 border-gray-300 bg-gray-50";
    }
  };

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* Connection lines */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2 -z-10" />

        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center flex-1">
            <div
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full border-2 mb-2 bg-background",
                getStepColor(step.status)
              )}
            >
              {getStepIcon(step.status)}
            </div>
            <p
              className={cn(
                "text-sm font-medium text-center",
                step.status === "pending" ? "text-muted-foreground" : ""
              )}
            >
              {step.label}
            </p>
            <p className="text-xs text-muted-foreground capitalize mt-1">
              {step.status === "in_progress" ? "In Progress" : step.status}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
