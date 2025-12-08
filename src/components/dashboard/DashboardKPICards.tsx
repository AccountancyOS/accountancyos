import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Briefcase, AlertTriangle, Zap } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

export const DashboardKPICards = () => {
  const { organization } = useOrganization();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-kpis", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const [clientsRes, jobsRes, deadlinesRes, automationsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("status", "active"),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .in("status", ["in_progress", "waiting_on_client", "ready_for_review"]),
        supabase
          .from("deadlines")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("status", "pending")
          .lt("due_date", new Date().toISOString()),
        supabase
          .from("automation_executions")
          .select("status")
          .eq("organization_id", organization.id)
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const totalAutomations = automationsRes.data?.length || 0;
      const successfulAutomations = automationsRes.data?.filter(a => a.status === "completed").length || 0;
      const successRate = totalAutomations > 0 ? Math.round((successfulAutomations / totalAutomations) * 100) : 100;

      return {
        activeClients: clientsRes.count || 0,
        jobsInProgress: jobsRes.count || 0,
        overdueDeadlines: deadlinesRes.count || 0,
        automationSuccessRate: successRate,
      };
    },
    enabled: !!organization?.id,
  });

  // Real-time subscriptions
  useRealtimeSubscription({
    table: 'jobs',
    organizationId: organization?.id,
    queryKeys: [['dashboard-kpis', organization?.id || '']],
  });

  useRealtimeSubscription({
    table: 'deadlines',
    organizationId: organization?.id,
    queryKeys: [['dashboard-kpis', organization?.id || '']],
  });

  useRealtimeSubscription({
    table: 'clients',
    organizationId: organization?.id,
    queryKeys: [['dashboard-kpis', organization?.id || '']],
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      title: "Active Clients",
      value: stats?.activeClients || 0,
      icon: Users,
      description: "Total active clients",
      color: "text-primary",
    },
    {
      title: "Jobs In Progress",
      value: stats?.jobsInProgress || 0,
      icon: Briefcase,
      description: "Currently being worked on",
      color: "text-blue-500",
    },
    {
      title: "Overdue Deadlines",
      value: stats?.overdueDeadlines || 0,
      icon: AlertTriangle,
      description: "Require attention",
      color: stats?.overdueDeadlines ? "text-destructive" : "text-muted-foreground",
    },
    {
      title: "Automation Success",
      value: `${stats?.automationSuccessRate || 100}%`,
      icon: Zap,
      description: "Last 30 days",
      color: "text-green-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.value}</div>
            <p className="text-xs text-muted-foreground">{kpi.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
