import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertCircle, Clock, Pause } from "lucide-react";
import { useOrganization } from "@/lib/organization-context";

interface Props {
  clientId?: string;
  companyId?: string;
}

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  active: { label: "Active", variant: "default", icon: CheckCircle2 },
  draft: { label: "Draft", variant: "secondary", icon: Clock },
  suspended: { label: "Suspended", variant: "outline", icon: Pause },
  terminated: { label: "Terminated", variant: "destructive", icon: AlertCircle },
};

export function ServiceStatusDashboard({ clientId, companyId }: Props) {
  const { organization } = useOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ["service-status", organization?.id, clientId, companyId],
    queryFn: async () => {
      if (!organization?.id) return [];
      let q = supabase
        .from("engagements")
        .select("id, status, frequency, start_date, end_date, activated_at, service_id, services_catalog(name, code)")
        .eq("organization_id", organization.id);
      if (clientId) q = q.eq("client_id", clientId);
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q.order("status", { ascending: true });
      if (error) throw error;

      // Fetch latest job per service
      const engagementIds = (data || []).map((e: any) => e.id);
      let jobsByService: Record<string, any> = {};
      if (engagementIds.length) {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id, service_type, status, filing_deadline, updated_at")
          .eq("organization_id", organization.id)
          .or(
            [
              clientId ? `client_id.eq.${clientId}` : null,
              companyId ? `company_id.eq.${companyId}` : null,
            ]
              .filter(Boolean)
              .join(",")
          )
          .order("updated_at", { ascending: false });
        for (const j of jobs || []) {
          if (!jobsByService[j.service_type]) jobsByService[j.service_type] = j;
        }
      }

      return (data || []).map((e: any) => ({
        ...e,
        latestJob: e.services_catalog?.code ? jobsByService[e.services_catalog.code] : null,
      }));
    },
    enabled: !!organization?.id && (!!clientId || !!companyId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Status</CardTitle>
        <CardDescription>Real-time status of every engaged service</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No services engaged yet
          </p>
        ) : (
          <div className="divide-y border rounded-lg">
            {data.map((eng: any) => {
              const meta = STATUS_META[eng.status] || STATUS_META.draft;
              const Icon = meta.icon;
              return (
                <div key={eng.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {eng.services_catalog?.name || "Service"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {eng.latestJob && (
                      <div className="text-right text-xs text-muted-foreground">
                        <div>Latest Job: <span className="font-medium text-foreground">{!eng.latestJob.status || eng.latestJob.status === "blank" ? "None" : formatStatus(eng.latestJob.status)}</span></div>
                        {eng.latestJob.filing_deadline && <div>Due {eng.latestJob.filing_deadline}</div>}
                      </div>
                    )}
                    <Badge variant={meta.variant}>{meta.label}</Badge>
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