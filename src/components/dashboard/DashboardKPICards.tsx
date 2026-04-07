import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { useCurrentUserRole } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Briefcase, AlertTriangle, TrendingUp, PoundSterling, Target } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { roleIsAtLeast } from "@/lib/permissions";

export const DashboardKPICards = () => {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const role = useCurrentUserRole();
  const isOwnerOrAdmin = roleIsAtLeast(role, 'admin');

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-kpis", organization?.id, user?.id, role],
    queryFn: async () => {
      if (!organization?.id) return null;

      // Base queries — scope by role
      const assignedFilter = !isOwnerOrAdmin && user?.id;

      const [clientsRes, jobsRes, deadlinesRes, leadsRes, revenueRes] = await Promise.all([
        // Active clients
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("status", "active"),

        // Jobs in progress — staff only sees their assigned jobs
        (() => {
          let q = supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organization.id)
            .in("status", ["in_progress", "waiting_on_client", "ready_for_review"]);
          if (assignedFilter) q = q.eq("assigned_to", user!.id);
          return q;
        })(),

        // Overdue deadlines
        supabase
          .from("deadlines")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("status", "pending")
          .lt("due_date", new Date().toISOString()),

        // Total leads (owner/admin only)
        isOwnerOrAdmin
          ? supabase
              .from("leads")
              .select("id, estimated_monthly_value, pipeline_stage", { count: "exact" })
              .eq("organization_id", organization.id)
              .not("pipeline_stage", "eq", "lost")
          : Promise.resolve({ count: 0, data: [] }),

        // Revenue from engagements (owner/admin only)
        isOwnerOrAdmin
          ? supabase
              .from("engagements")
              .select("frequency, service_config, services_catalog!inner(billing_model, default_price)")
              .eq("organization_id", organization.id)
              .eq("status", "active")
          : Promise.resolve({ data: [] }),
      ]);

      // Calculate revenue split
      let monthlyRevenue = 0;
      let oneOffRevenue = 0;
      if (revenueRes.data) {
        for (const eng of revenueRes.data as any[]) {
          const fee = Number(eng.fee_amount) || 0;
          if (eng.billing_frequency === 'monthly') {
            monthlyRevenue += fee;
          } else if (eng.billing_frequency === 'one_off' || eng.billing_frequency === 'fixed') {
            oneOffRevenue += fee;
          } else if (eng.billing_frequency === 'quarterly') {
            monthlyRevenue += fee / 3;
          } else if (eng.billing_frequency === 'annually' || eng.billing_frequency === 'yearly') {
            monthlyRevenue += fee / 12;
          } else {
            monthlyRevenue += fee;
          }
        }
      }

      // Pipeline value from leads
      let pipelineValue = 0;
      if (leadsRes.data) {
        for (const lead of leadsRes.data as any[]) {
          if (lead.pipeline_stage !== 'won' && lead.pipeline_stage !== 'lost') {
            pipelineValue += Number(lead.estimated_monthly_value) || 0;
          }
        }
      }

      return {
        activeClients: clientsRes.count || 0,
        jobsInProgress: jobsRes.count || 0,
        overdueDeadlines: deadlinesRes.count || 0,
        totalLeads: leadsRes.count || 0,
        monthlyRevenue: Math.round(monthlyRevenue),
        oneOffRevenue: Math.round(oneOffRevenue),
        pipelineValue: Math.round(pipelineValue),
      };
    },
    enabled: !!organization?.id,
  });

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
      <div className="space-y-4">
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
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
  };

  // Core KPIs visible to all roles
  const coreKpis = [
    {
      title: isOwnerOrAdmin ? "Active Clients" : "My Jobs",
      value: isOwnerOrAdmin ? (stats?.activeClients || 0) : (stats?.jobsInProgress || 0),
      icon: isOwnerOrAdmin ? Users : Briefcase,
      description: isOwnerOrAdmin ? "Total active clients" : "Assigned to you",
      color: "text-primary",
    },
    {
      title: "Jobs In Progress",
      value: stats?.jobsInProgress || 0,
      icon: Briefcase,
      description: isOwnerOrAdmin ? "Across the practice" : "Your active work",
      color: "text-blue-500",
    },
    {
      title: "Overdue Deadlines",
      value: stats?.overdueDeadlines || 0,
      icon: AlertTriangle,
      description: "Require attention",
      color: stats?.overdueDeadlines ? "text-destructive" : "text-muted-foreground",
    },
  ];

  // Owner/Admin-only KPIs
  if (isOwnerOrAdmin) {
    coreKpis.push({
      title: "Pipeline Leads",
      value: stats?.totalLeads || 0,
      icon: Target,
      description: `${formatCurrency(stats?.pipelineValue || 0)}/mo pipeline`,
      color: "text-purple-500",
    });
  } else {
    coreKpis.push({
      title: "Active Clients",
      value: stats?.activeClients || 0,
      icon: Users,
      description: "Total practice clients",
      color: "text-primary",
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {coreKpis.map((kpi) => (
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

      {/* Revenue row — owner/admin only */}
      {isOwnerOrAdmin && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <PoundSterling className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.monthlyRevenue || 0)}</div>
              <p className="text-xs text-muted-foreground">Recurring fees/month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">One-Off Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.oneOffRevenue || 0)}</div>
              <p className="text-xs text-muted-foreground">Fixed/project fees</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <Target className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.pipelineValue || 0)}</div>
              <p className="text-xs text-muted-foreground">Potential monthly from leads</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
