import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Clock, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

export const AutomationActivityFeed = () => {
  const { organization } = useOrganization();

  const { data: executions, isLoading } = useQuery({
    queryKey: ["automation-activity", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from("automation_executions")
        .select(`
          id,
          status,
          triggered_by_entity,
          triggered_by_id,
          executed_at,
          created_at,
          error_message,
          automation_rules (
            name,
            action_type
          )
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case "create_job":
        return "Created Job";
      case "send_email":
        return "Sent Email";
      case "send_notification":
        return "Sent Notification";
      case "create_task":
        return "Created Task";
      default:
        return actionType;
    }
  };

  const getEntityLink = (entity: string, id: string) => {
    switch (entity) {
      case "job":
        return `/jobs/${id}`;
      case "deadline":
        return `/deadlines`;
      case "client":
        return `/clients/${id}`;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Automation Activity
          </CardTitle>
          <CardDescription>Recent automation executions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Automation Activity
        </CardTitle>
        <CardDescription>Recent automation executions</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {executions && executions.length > 0 ? (
            <div className="space-y-4">
              {executions.map((execution) => {
                const link = getEntityLink(execution.triggered_by_entity, execution.triggered_by_id);
                return (
                  <div key={execution.id} className="flex items-start gap-3">
                    {getStatusIcon(execution.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {execution.automation_rules?.name || "Unknown Rule"}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {getActionLabel(execution.automation_rules?.action_type || "")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>
                          Triggered by {execution.triggered_by_entity}
                        </span>
                        {link && (
                          <Link to={link} className="text-primary hover:underline">
                            View →
                          </Link>
                        )}
                      </div>
                      {execution.error_message && (
                        <p className="text-xs text-destructive mt-1 truncate">
                          {execution.error_message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(execution.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Zap className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No automation activity yet</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
