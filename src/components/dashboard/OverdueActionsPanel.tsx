import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { useCurrentUserRole } from "@/hooks/usePermissions";
import { roleIsAtLeast } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Mail, MessageSquare, CheckSquare, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

interface OverdueItem {
  id: string;
  type: "email" | "message" | "task";
  title: string;
  entityName: string;
  dueAt: string;
  assignee?: string;
  severity: "critical" | "high" | "medium";
}

export const OverdueActionsPanel = () => {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const role = useCurrentUserRole();
  const isOwnerOrAdmin = roleIsAtLeast(role, 'admin');

  const { data: overdueItems, isLoading } = useQuery({
    queryKey: ["overdue-actions", organization?.id, user?.id, role],
    queryFn: async () => {
      if (!organization?.id) return [];

      const now = new Date().toISOString();
      const items: OverdueItem[] = [];

      // Get overdue SLA instances
      const { data: slaInstances, error: slaError } = await supabase
        .from("sla_instances")
        .select("id, entity_type, entity_id, due_at, metadata, started_at")
        .eq("organization_id", organization.id)
        .eq("status", "active")
        .lt("due_at", now)
        .order("due_at", { ascending: true })
        .limit(20);

      if (!slaError && slaInstances) {
        for (const sla of slaInstances) {
          const hoursOverdue = Math.floor(
            (new Date().getTime() - new Date(sla.due_at).getTime()) / (1000 * 60 * 60)
          );

          items.push({
            id: sla.id,
            type: sla.entity_type as "email" | "message" | "task",
            title: `Overdue ${sla.entity_type}`,
            entityName: (sla.metadata as any)?.entity_name || "Unknown",
            dueAt: sla.due_at,
            severity: hoursOverdue > 48 ? "critical" : hoursOverdue > 24 ? "high" : "medium",
          });
        }
      }

      // Get overdue tasks directly
      const { data: overdueTasks, error: taskError } = await supabase
        .from("job_tasks")
        .select(`
          id, 
          title, 
          due_date, 
          jobs!inner(name, clients(first_name, last_name), companies(company_name))
        `)
        .eq("organization_id", organization.id)
        .eq("status", "pending")
        .lt("due_date", now)
        .order("due_date", { ascending: true })
        .limit(10);

      if (!taskError && overdueTasks) {
        for (const task of overdueTasks) {
          const job = task.jobs as any;
          const entityName = job?.companies?.company_name || 
            (job?.clients ? `${job.clients.first_name} ${job.clients.last_name}` : job?.name);

          const hoursOverdue = Math.floor(
            (new Date().getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60)
          );

          items.push({
            id: task.id,
            type: "task",
            title: task.title,
            entityName: entityName || "Unknown",
            dueAt: task.due_date,
            severity: hoursOverdue > 72 ? "critical" : hoursOverdue > 24 ? "high" : "medium",
          });
        }
      }

      // Sort by severity then due date
      return items.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
    },
    enabled: !!organization?.id,
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "message":
        return <MessageSquare className="h-4 w-4" />;
      case "task":
        return <CheckSquare className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-destructive text-destructive-foreground";
      case "high":
        return "bg-orange-500 text-white";
      case "medium":
        return "bg-amber-500 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Overdue Actions
          </CardTitle>
          <CardDescription>Items requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = overdueItems?.filter((i) => i.severity === "critical").length || 0;
  const highCount = overdueItems?.filter((i) => i.severity === "high").length || 0;

  return (
    <Card className={criticalCount > 0 ? "border-destructive" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className={`h-5 w-5 ${criticalCount > 0 ? "text-destructive" : ""}`} />
          Overdue Actions
          {(overdueItems?.length || 0) > 0 && (
            <Badge variant="destructive" className="ml-2">
              {overdueItems?.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {criticalCount > 0
            ? `${criticalCount} critical, ${highCount} high priority`
            : "Items requiring attention"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px]">
          {overdueItems && overdueItems.length > 0 ? (
            <div className="space-y-3">
              {overdueItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-md ${getSeverityColor(item.severity)}`}>
                      {getIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.entityName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">
                      {formatDistanceToNow(new Date(item.dueAt), { addSuffix: true })}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <CheckSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">All caught up</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
