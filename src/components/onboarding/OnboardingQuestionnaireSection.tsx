import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Send, CheckCircle, Clock, Eye } from "lucide-react";
import { SendOnboardingQuestionnaireDialog } from "./SendOnboardingQuestionnaireDialog";
import { format } from "date-fns";

interface OnboardingQuestionnaireSectionProps {
  onboardingId: string;
  organizationId: string;
  questionnaireInstanceId: string | null;
  questionnaireSubmittedAt: string | null;
  recipientEmail: string;
  recipientName: string;
  onQuestionnaireSent: () => void;
}

export function OnboardingQuestionnaireSection({
  onboardingId,
  organizationId,
  questionnaireInstanceId,
  questionnaireSubmittedAt,
  recipientEmail,
  recipientName,
  onQuestionnaireSent,
}: OnboardingQuestionnaireSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const getStatus = () => {
    if (questionnaireSubmittedAt) return "submitted";
    if (questionnaireInstanceId) return "sent";
    return "not_sent";
  };

  const status = getStatus();

  const statusConfig = {
    not_sent: {
      label: "Not Sent",
      variant: "secondary" as const,
      icon: FileText,
    },
    sent: {
      label: "Awaiting Response",
      variant: "outline" as const,
      icon: Clock,
    },
    submitted: {
      label: "Submitted",
      variant: "default" as const,
      icon: CheckCircle,
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Onboarding Questionnaire</CardTitle>
            </div>
            <Badge variant={config.variant}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>
          <CardDescription>
            Collect client information and AML documents via questionnaire
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "not_sent" && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Send the onboarding questionnaire to collect client information and AML documents.
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Send Questionnaire
              </Button>
            </div>
          )}

          {status === "sent" && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">
                Questionnaire sent to <strong>{recipientEmail}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Waiting for the client to complete and submit.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Resend Questionnaire
              </Button>
            </div>
          )}

          {status === "submitted" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Questionnaire Completed</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted on {format(new Date(questionnaireSubmittedAt!), "PPp")}
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  View Responses
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Client information and uploaded documents are ready for review below.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <SendOnboardingQuestionnaireDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onboardingId={onboardingId}
        organizationId={organizationId}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
        onSuccess={() => {
          setDialogOpen(false);
          onQuestionnaireSent();
        }}
      />
    </>
  );
}
