import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  blank: { label: "—", color: "hsl(var(--muted-foreground))" },
  records_requested: { label: "Records Req.", color: "hsl(210, 79%, 56%)" },
  records_received: { label: "Records Rec.", color: "hsl(199, 89%, 48%)" },
  accountant_queries: { label: "Acc. Queries", color: "hsl(45, 93%, 47%)" },
  client_queries: { label: "Client Queries", color: "hsl(32, 95%, 50%)" },
  accountant_review: { label: "Acc. Review", color: "hsl(262, 83%, 58%)" },
  client_review: { label: "Client Review", color: "hsl(280, 65%, 60%)" },
  ready_to_file: { label: "Ready to File", color: "hsl(160, 84%, 39%)" },
  completed: { label: "Completed", color: "hsl(142, 71%, 45%)" },
};

export const JobPipelineChart = () => {
  const { organization } = useOrganization();

  const { data: jobStats, isLoading } = useQuery({
    queryKey: ["job-pipeline-stats", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from("jobs")
        .select("status")
        .eq("organization_id", organization.id);

      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach((job) => {
        counts[job.status] = (counts[job.status] || 0) + 1;
      });

      return Object.entries(STATUS_CONFIG).map(([status, config]) => ({
        status,
        label: config.label,
        count: counts[status] || 0,
        color: config.color,
      }));
    },
    enabled: !!organization?.id,
  });

  // Real-time subscription for jobs
  useRealtimeSubscription({
    table: "jobs",
    organizationId: organization?.id,
    queryKeys: [["job-pipeline-stats", organization?.id || ""]],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Job Pipeline
          </CardTitle>
          <CardDescription>Jobs by status</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalJobs = jobStats?.reduce((sum, s) => sum + s.count, 0) || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Job Pipeline
          </CardTitle>
          <CardDescription>{totalJobs} total jobs</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/jobs">
            View All <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {totalJobs > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={jobStats} layout="vertical" margin={{ left: 0, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="label" 
                width={80}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg px-3 py-2 shadow-md">
                        <p className="font-medium">{data.label}</p>
                        <p className="text-sm text-muted-foreground">{data.count} jobs</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {jobStats?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
            <Briefcase className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No jobs yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
