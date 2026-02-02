import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, AlertTriangle, CheckCircle } from "lucide-react";

interface StaffStats {
  userId: string;
  displayName: string;
  role: string;
  activeJobs: number;
  completedJobs: number;
  overdueJobs: number;
  performance: number;
}

export const StaffVarianceTable = () => {
  const { organization } = useOrganization();

  const { data: staffStats, isLoading } = useQuery({
    queryKey: ["staff-variance", organization?.id],
    queryFn: async (): Promise<StaffStats[]> => {
      if (!organization?.id) return [];

      // Get all organization users
      const { data: orgUsers } = await supabase
        .from("organization_users")
        .select("user_id, role")
        .eq("organization_id", organization.id);

      if (!orgUsers || orgUsers.length === 0) return [];

      const userIds = orgUsers.map(u => u.user_id);

      // Get jobs assigned to these users
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, status, assigned_to, filing_deadline")
        .eq("organization_id", organization.id)
        .not("assigned_to", "is", null);

      // Calculate stats per user
      const now = new Date();
      const stats: StaffStats[] = orgUsers.map((user) => {
        const userJobs = jobs?.filter(j => j.assigned_to === user.user_id) || [];
        
        const activeJobs = userJobs.filter(j => 
          j.status !== "completed" && j.status !== "cancelled"
        ).length;
        
        const completedJobs = userJobs.filter(j => j.status === "completed").length;
        
        const overdueJobs = userJobs.filter(j => {
          if (j.status === "completed" || j.status === "cancelled") return false;
          if (!j.filing_deadline) return false;
          return new Date(j.filing_deadline) < now;
        }).length;

        // Performance = % of jobs not overdue (simple metric)
        const totalActiveOrComplete = activeJobs + completedJobs;
        const performance = totalActiveOrComplete > 0 
          ? Math.round(((totalActiveOrComplete - overdueJobs) / totalActiveOrComplete) * 100)
          : 100;

        return {
          userId: user.user_id,
          displayName: `User ${user.user_id.slice(0, 8)}`,
          role: user.role || "member",
          activeJobs,
          completedJobs,
          overdueJobs,
          performance: Math.max(0, Math.min(100, performance)),
        };
      });

      // Sort by active jobs descending
      return stats.sort((a, b) => b.activeJobs - a.activeJobs);
    },
    enabled: !!organization?.id,
  });

  const getInitials = (name: string) => {
    const parts = name.split(/[\s_-]/);
    return parts.map(p => p[0]?.toUpperCase() || "").join("").slice(0, 2) || "??";
  };

  const getPerformanceColor = (perf: number) => {
    if (perf >= 90) return "text-green-600 dark:text-green-400";
    if (perf >= 70) return "text-amber-600 dark:text-amber-400";
    return "text-destructive";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Workload
          </CardTitle>
          <CardDescription>Active jobs and performance by team member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-2 w-full" />
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
          <Users className="h-5 w-5" />
          Staff Workload
        </CardTitle>
        <CardDescription>Active jobs and performance by team member</CardDescription>
      </CardHeader>
      <CardContent>
        {staffStats && staffStats.length > 0 ? (
          <div className="space-y-4">
            {staffStats.map((staff) => (
              <div key={staff.userId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(staff.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{staff.displayName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{staff.activeJobs} active</span>
                        <span>·</span>
                        <span>{staff.completedJobs} done</span>
                        {staff.overdueJobs > 0 && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              {staff.overdueJobs} overdue
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${getPerformanceColor(staff.performance)}`}>
                      {staff.performance}%
                    </span>
                    {staff.performance >= 90 && (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                </div>
                <Progress value={staff.performance} className="h-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No team members found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
