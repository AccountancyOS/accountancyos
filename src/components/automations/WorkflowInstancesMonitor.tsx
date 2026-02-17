/**
 * Workflow Instances Monitor
 * 
 * Shows running, waiting, completed, and failed workflow instances
 * for the current organization.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  PlayCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface WorkflowInstanceRow {
  id: string;
  org_id: string;
  template_id: string;
  client_id: string | null;
  company_id: string | null;
  period_key: string;
  status: string;
  next_run_at: string | null;
  waiting_for_event_key: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  automation_workflow_templates: {
    name: string;
    service_type: string | null;
  } | null;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  running: { icon: PlayCircle, label: "Running", variant: "default" },
  waiting: { icon: Pause, label: "Waiting", variant: "secondary" },
  completed: { icon: CheckCircle2, label: "Completed", variant: "outline" },
  failed: { icon: XCircle, label: "Failed", variant: "destructive" },
  cancelled: { icon: XCircle, label: "Cancelled", variant: "outline" },
};

export function WorkflowInstancesMonitor() {
  const { organization } = useOrganization();

  const { data: instances, isLoading } = useQuery({
    queryKey: ["workflow-instances", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("automation_workflow_instances")
        .select(`
          id, org_id, template_id, client_id, company_id,
          period_key, status, next_run_at, waiting_for_event_key,
          error_message, created_at, updated_at,
          automation_workflow_templates (name, service_type)
        `)
        .eq("org_id", organization.id)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as WorkflowInstanceRow[];
    },
    enabled: !!organization?.id,
  });

  // Realtime
  useRealtimeSubscription({
    table: "automation_workflow_instances",
    organizationId: organization?.id,
    queryKeys: [["workflow-instances", organization?.id || ""]],
  });

  // Summary counts
  const counts = (instances || []).reduce(
    (acc, inst) => {
      acc[inst.status] = (acc[inst.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["running", "waiting", "completed", "failed"] as const).map((status) => {
          const config = STATUS_CONFIG[status];
          const Icon = config.icon;
          return (
            <Card key={status}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                    <p className="text-2xl font-bold">{counts[status] || 0}</p>
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Instances table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Workflow Instances
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!instances || instances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No workflow instances yet</p>
              <p className="text-xs mt-1">
                Instances are created automatically when trigger events fire
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((inst) => {
                    const statusConfig = STATUS_CONFIG[inst.status] || STATUS_CONFIG.running;
                    const StatusIcon = statusConfig.icon;
                    return (
                      <TableRow key={inst.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">
                              {inst.automation_workflow_templates?.name || "Unknown"}
                            </span>
                            {inst.automation_workflow_templates?.service_type && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {inst.automation_workflow_templates.service_type}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {inst.period_key}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusConfig.variant} className="text-xs gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </Badge>
                          {inst.error_message && (
                            <p className="text-xs text-destructive mt-1 max-w-[200px] truncate">
                              {inst.error_message}
                            </p>
                          )}
                          {inst.waiting_for_event_key && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Waiting: {inst.waiting_for_event_key.split(":")[0]}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {inst.next_run_at ? (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(inst.next_run_at), "dd MMM HH:mm")}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(inst.updated_at), { addSuffix: true })}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
