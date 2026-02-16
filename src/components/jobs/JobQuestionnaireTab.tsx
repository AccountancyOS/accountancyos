import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SendQuestionnaireDialog } from "@/components/client-portal/SendQuestionnaireDialog";
import { useState } from "react";
import { FileText, CheckCircle, Clock, Send } from "lucide-react";
import { format } from "date-fns";
import { formatStatus } from "@/lib/format-utils";

interface JobQuestionnaireTabProps {
  jobId: string;
  clientId?: string;
  companyId?: string;
}

export function JobQuestionnaireTab({ jobId, clientId, companyId }: JobQuestionnaireTabProps) {
  const [showSendDialog, setShowSendDialog] = useState(false);

  const { data: questionnaires, isLoading } = useQuery({
    queryKey: ["job-questionnaires", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questionnaire_instances")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted":
        return "bg-green-500";
      case "in_progress":
        return "bg-blue-500";
      case "sent":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "submitted":
        return <CheckCircle className="h-4 w-4" />;
      case "in_progress":
        return <Clock className="h-4 w-4" />;
      default:
        return <Send className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading questionnaires...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Questionnaires</h3>
          <p className="text-sm text-muted-foreground">
            Request information from your client
          </p>
        </div>
        <Button onClick={() => setShowSendDialog(true)}>
          <FileText className="mr-2 h-4 w-4" />
          Send Questionnaire
        </Button>
      </div>

      {questionnaires && questionnaires.length > 0 ? (
        <div className="space-y-4">
          {questionnaires.map((questionnaire) => (
            <Card key={questionnaire.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{questionnaire.name}</CardTitle>
                    <CardDescription>
                      {questionnaire.period_label && (
                        <span>Period: {questionnaire.period_label} • </span>
                      )}
                      Sent {format(new Date(questionnaire.sent_at), "d MMM yyyy")}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(questionnaire.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(questionnaire.status)}
                      {formatStatus(questionnaire.status)}
                    </span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {questionnaire.started_at && (
                    <p className="text-sm text-muted-foreground">
                      Started: {format(new Date(questionnaire.started_at), "d MMM yyyy HH:mm")}
                    </p>
                  )}
                  {questionnaire.submitted_at && (
                    <p className="text-sm text-muted-foreground">
                      Submitted: {format(new Date(questionnaire.submitted_at), "d MMM yyyy HH:mm")}
                    </p>
                  )}
                  {questionnaire.status === "submitted" && (
                    <Button variant="outline" size="sm" className="mt-2">
                      View Responses
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No questionnaires sent yet</p>
            <Button onClick={() => setShowSendDialog(true)} className="mt-4">
              Send First Questionnaire
            </Button>
          </CardContent>
        </Card>
      )}

      {showSendDialog && (
        <SendQuestionnaireDialog
          clientId={clientId}
          jobId={jobId}
          onClose={() => setShowSendDialog(false)}
        />
      )}
    </div>
  );
}
