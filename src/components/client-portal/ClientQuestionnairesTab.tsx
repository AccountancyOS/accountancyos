import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, FileText, CheckCircle2, Clock, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { SendQuestionnaireDialog } from "./SendQuestionnaireDialog";

interface ClientQuestionnairesTabProps {
  clientId: string;
}

export default function ClientQuestionnairesTab({ clientId }: ClientQuestionnairesTabProps) {
  const { organization } = useOrganization();
  const [selectedInstance, setSelectedInstance] = useState<any>(null);

  const { data: instances, isLoading } = useQuery({
    queryKey: ["questionnaire-instances", clientId],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("questionnaire_instances")
        .select(`
          *,
          template:templates(name, service)
        `)
        .eq("client_id", clientId)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id && !!clientId,
  });

  const { data: responses } = useQuery({
    queryKey: ["questionnaire-responses-for-instance", selectedInstance?.id],
    queryFn: async () => {
      if (!selectedInstance?.id) return [];
      const { data, error } = await supabase
        .from("questionnaire_responses")
        .select("*")
        .eq("questionnaire_instance_id", selectedInstance.id);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedInstance?.id,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge variant="secondary"><Send className="mr-1 h-3 w-3" />Sent</Badge>;
      case "in_progress":
        return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />In Progress</Badge>;
      case "submitted":
        return <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />Submitted</Badge>;
      case "reviewed":
        return <Badge><Eye className="mr-1 h-3 w-3" />Reviewed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderAnswer = (response: any) => {
    if (response.answer_text) return response.answer_text;
    if (response.answer_number !== null) return response.answer_number;
    if (response.answer_boolean !== null) return response.answer_boolean ? "Yes" : "No";
    if (response.answer_date) return new Date(response.answer_date).toLocaleDateString();
    if (response.answer_array) return JSON.stringify(response.answer_array);
    return "-";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Questionnaires</CardTitle>
            <CardDescription>
              Records requests and information gathering
            </CardDescription>
          </div>
          <SendQuestionnaireDialog clientId={clientId} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading questionnaires...</p>
          ) : instances && instances.length > 0 ? (
            <div className="space-y-4">
              {instances.map((instance) => {
                const template = instance.template as any;
                return (
                  <div
                    key={instance.id}
                    className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{instance.name}</h4>
                          {getStatusBadge(instance.status)}
                        </div>
                        {template && (
                          <p className="text-sm text-muted-foreground">
                            Template: {template.name}
                            {template.service && ` • ${template.service}`}
                          </p>
                        )}
                        {instance.period_label && (
                          <p className="text-sm text-muted-foreground">
                            Period: {instance.period_label}
                          </p>
                        )}
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedInstance(instance)}
                            disabled={instance.status === "sent"}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Responses
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{instance.name} - Responses</DialogTitle>
                            <DialogDescription>
                              Submitted on {instance.submitted_at ? new Date(instance.submitted_at).toLocaleString() : "Not yet submitted"}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            {responses && responses.length > 0 ? (
                              responses.map((response) => {
                                const questionsData = instance.questions as any;
                                const question = questionsData?.questions?.find(
                                  (q: any) => q.id === response.question_id
                                );
                                return (
                                  <div key={response.id} className="border-b pb-4 last:border-0">
                                    <p className="font-semibold mb-2">
                                      {question?.label || "Question"}
                                    </p>
                                    <p className="text-muted-foreground">
                                      {renderAnswer(response)}
                                    </p>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-muted-foreground text-center py-8">
                                No responses yet
                              </p>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Sent: {new Date(instance.sent_at).toLocaleDateString()}</span>
                      {instance.submitted_at && (
                        <span>Submitted: {new Date(instance.submitted_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No questionnaires sent yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
