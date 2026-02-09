import DashboardLayout from "@/components/DashboardLayout";
import { useOrganization } from "@/lib/organization-context";
import { DashboardKPICards } from "@/components/dashboard/DashboardKPICards";
import { DeadlineWidget } from "@/components/dashboard/DeadlineWidget";
import { OverdueActionsPanel } from "@/components/dashboard/OverdueActionsPanel";
import { StaffVarianceTable } from "@/components/dashboard/StaffVarianceTable";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Overview = () => {
  const { organization } = useOrganization();
  const { user } = useAuth();

  // Check if user is owner/admin for staff variance visibility
  const { data: userRole } = useQuery({
    queryKey: ["user-role", user?.id, organization?.id],
    queryFn: async () => {
      if (!user?.id || !organization?.id) return null;
      const { data } = await supabase
        .from("organization_users")
        .select("role")
        .eq("organization_id", organization.id)
        .eq("user_id", user.id)
        .single();
      return data?.role || null;
    },
    enabled: !!user?.id && !!organization?.id,
  });

  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground mt-1">
            Here is what is happening with {organization?.name || "your practice"} today.
          </p>
        </div>

        <DashboardKPICards />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <OverdueActionsPanel />
            <DeadlineWidget />
          </div>
          <div className="space-y-6">
            {isOwnerOrAdmin && <StaffVarianceTable />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Overview;
