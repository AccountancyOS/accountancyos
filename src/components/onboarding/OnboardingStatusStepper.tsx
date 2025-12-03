import { Check, Circle, Clock, Send, FileSignature, Shield, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  timestamp?: string;
}

interface OnboardingStatusStepperProps {
  quoteStatus?: string;
  quoteSentAt?: string;
  quoteAcceptedAt?: string;
  engagementLetterStatus?: string;
  engagementLetterSignedAt?: string;
  amlStatus?: string;
  amlVerifiedAt?: string;
  applicationStatus?: string;
  approvedAt?: string;
}

const OnboardingStatusStepper = ({
  quoteStatus,
  quoteSentAt,
  quoteAcceptedAt,
  engagementLetterStatus,
  engagementLetterSignedAt,
  amlStatus,
  amlVerifiedAt,
  applicationStatus,
  approvedAt,
}: OnboardingStatusStepperProps) => {
  const getStepState = (stepId: string): "completed" | "current" | "upcoming" => {
    switch (stepId) {
      case "quote_sent":
        if (quoteStatus === "sent" || quoteStatus === "accepted") return "completed";
        return quoteStatus === "draft" ? "current" : "upcoming";
      case "quote_accepted":
        if (quoteStatus === "accepted") return "completed";
        if (quoteStatus === "sent") return "current";
        return "upcoming";
      case "contracts_signed":
        if (engagementLetterStatus === "signed" || engagementLetterSignedAt) return "completed";
        if (quoteStatus === "accepted" && !engagementLetterSignedAt) return "current";
        return "upcoming";
      case "aml_verified":
        if (amlStatus === "verified") return "completed";
        if (engagementLetterSignedAt && amlStatus !== "verified") return "current";
        return "upcoming";
      case "client_active":
        if (applicationStatus === "approved") return "completed";
        if (amlStatus === "verified" && applicationStatus !== "approved") return "current";
        return "upcoming";
      default:
        return "upcoming";
    }
  };

  const steps: Step[] = [
    {
      id: "quote_sent",
      label: "Quote Sent",
      description: quoteSentAt ? `Sent ${new Date(quoteSentAt).toLocaleDateString()}` : undefined,
      icon: <Send className="h-4 w-4" />,
      timestamp: quoteSentAt,
    },
    {
      id: "quote_accepted",
      label: "Quote Accepted",
      description: quoteAcceptedAt ? `Accepted ${new Date(quoteAcceptedAt).toLocaleDateString()}` : undefined,
      icon: <Check className="h-4 w-4" />,
      timestamp: quoteAcceptedAt,
    },
    {
      id: "contracts_signed",
      label: "Contracts Signed",
      description: engagementLetterSignedAt ? `Signed ${new Date(engagementLetterSignedAt).toLocaleDateString()}` : undefined,
      icon: <FileSignature className="h-4 w-4" />,
      timestamp: engagementLetterSignedAt,
    },
    {
      id: "aml_verified",
      label: "AML Verified",
      description: amlVerifiedAt ? `Verified ${new Date(amlVerifiedAt).toLocaleDateString()}` : undefined,
      icon: <Shield className="h-4 w-4" />,
      timestamp: amlVerifiedAt,
    },
    {
      id: "client_active",
      label: "Client Active",
      description: approvedAt ? `Created ${new Date(approvedAt).toLocaleDateString()}` : undefined,
      icon: <UserCheck className="h-4 w-4" />,
      timestamp: approvedAt,
    },
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const state = getStepState(step.id);
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                    state === "completed" && "bg-primary border-primary text-primary-foreground",
                    state === "current" && "border-primary text-primary bg-background",
                    state === "upcoming" && "border-muted text-muted-foreground bg-background"
                  )}
                >
                  {state === "completed" ? <Check className="h-5 w-5" /> : step.icon}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      state === "completed" && "text-primary",
                      state === "current" && "text-foreground",
                      state === "upcoming" && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  )}
                </div>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 mt-[-24px]",
                    state === "completed" ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnboardingStatusStepper;
