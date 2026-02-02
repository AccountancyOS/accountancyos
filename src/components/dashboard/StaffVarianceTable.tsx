import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";

interface StaffStats {
  userId: string;
  name: string;
  activeJobs: number;
  performance: number;
}

export const StaffVarianceTable = () => {
  const { organization } = useOrganization();

  const { data: staffStats, isLoading } = useQuery({
    queryKey: ["staff-variance", organization?.id],
    queryFn: async (): Promise<StaffStats[]> => {
      if (!organization?.id) return [];

      const { data: users } = await supabase
        .from("organization_users")
        .select("user_id, role")
        .eq("organization_id", organization.id);

      if (!users) return [];

      return users.map((user) => ({
        userId: user.user_id,
        name: `Staff ${user.user_id.slice(0, 4)}`,
        activeJobs: 0,
        performance: 100,
      }));
    },
    enabled: !!organization?.id,
  });

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Staff Performance</CardTitle>
          <CardDescription>Workload by team member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-2 w-full" /></div>
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
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Staff Performance</CardTitle>
        <CardDescription>Workload by team member</CardDescription>
      </CardHeader>
      <CardContent>
        {staffStats && staffStats.length > 0 ? (
          <div className="space-y-4">
            {staffStats.map((staff) => (
              <div key={staff.userId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{getInitials(staff.name)}</AvatarFallback></Avatar>
                    <p className="text-sm font-medium">{staff.name}</p>
                  </div>
                  <span className="text-sm font-medium">{staff.performance}%</span>
                </div>
                <Progress value={staff.performance} className="h-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No staff data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
