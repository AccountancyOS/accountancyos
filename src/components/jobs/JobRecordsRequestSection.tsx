import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, FileText, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { triggerRecordsRequest } from "@/lib/questionnaire-workpaper-service";

interface JobRecordsRequestSectionProps {
  jobId: string;
  jobStatus: string;
}

export default function JobRecordsRequestSection({ jobId, jobStatus }: JobRecordsRequestSectionProps) {
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);

  // Fetch linked questionnaire instances
  const { data: questionnaires, isLoading } = useQuery({
    queryKey: ["job-questionnaires", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_questionnaire_instances")
        .select(`
          *,
          questionnaire_instance:questionnaire_instances(
            *,
            template:templates(name, type)
          )
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch job to check if it has a service with records request template
  const { data: job } = useQuery({
    queryKey: ["job-for-records", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(`
          *,
          service:services_catalog(
            name,
            records_request_template_id
          )
        `)
        .eq("id", jobId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const handleSendRecordsRequest = async () => {
    setIsSending(true);
    try {
      const result = await triggerRecordsRequest(jobId);
      
      if (result.success) {
        toast.success("Records request sent successfully");
        queryClient.invalidateQueries({ queryKey: ["job-questionnaires", jobId] });
        queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      } else {
        toast.error(result.error || "Failed to send records request");
      }
    } catch (error) {
      toast.error("Failed to send records request");
    } finally {
      setIsSending(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "submitted":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "sent":
      case "viewed":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "draft":
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return <Badge variant="default">Submitted</Badge>;
      case "viewed":
        return <Badge variant="secondary">Viewed</Badge>;
      case "sent":
        return <Badge variant="outline">Sent</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const hasRecordsRequestTemplate = !!(job?.service as any)?.records_request_template_id;
  const canSendRequest = hasRecordsRequestTemplate && 
    (jobStatus === "awaiting_info" || jobStatus === "not_started" || jobStatus === "in_progress");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Records Requests</CardTitle>
          <CardDescription>
            Information requests sent to the client for this job
          </CardDescription>
        </div>
        {canSendRequest && (
          <Button 
            onClick={handleSendRecordsRequest} 
            disabled={isSending}
            size="sm"
          >
            <Send className="mr-2 h-4 w-4" />
            {isSending ? "Sending..." : "Send Records Request"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-4 text-center text-muted-foreground">Loading...</div>
        ) : !questionnaires || questionnaires.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground">
            {hasRecordsRequestTemplate ? (
              <>
                No records requests sent yet.
                {canSendRequest && " Click 'Send Records Request' to request information from the client."}
              </>
            ) : (
              "No records request template configured for this service."
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {questionnaires.map((item) => {
              const qi = item.questionnaire_instance as any;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(qi?.status)}
                    <div>
                      <p className="font-medium">
                        {qi?.template?.name || "Records Request"}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Sent {format(new Date(item.created_at), "dd MMM yyyy")}</span>
                        {qi?.submitted_at && (
                          <>
                            <span>•</span>
                            <span>Submitted {format(new Date(qi.submitted_at), "dd MMM yyyy")}</span>
                          </>
                        )}
                        {item.feeds_workpaper && (
                          <>
                            <span>•</span>
                            <span className="text-primary">Feeds workpaper</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(qi?.status)}
                    {qi?.status === "submitted" && (
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
