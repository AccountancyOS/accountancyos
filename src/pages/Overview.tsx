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
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              Here is what is happening with {organization?.name || "your practice"} today.
            </p>
          </div>

          {/* KPI Cards */}
          <div className="mb-8">
            <DashboardKPICards />
          </div>

          {/* Main Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
              <OverdueActionsPanel />
              <DeadlineWidget />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {isOwnerOrAdmin && <StaffVarianceTable />}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Overview;
