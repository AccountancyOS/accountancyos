import DashboardLayout from "@/components/DashboardLayout";
import { useOrganization } from "@/lib/organization-context";
import { DashboardKPICards } from "@/components/dashboard/DashboardKPICards";
import { DeadlineWidget } from "@/components/dashboard/DeadlineWidget";
import { OverdueActionsPanel } from "@/components/dashboard/OverdueActionsPanel";
import { StaffVarianceTable } from "@/components/dashboard/StaffVarianceTable";
import { useCurrentUserRole } from "@/hooks/usePermissions";
import { roleIsAtLeast } from "@/lib/permissions";

const Overview = () => {
  const { organization } = useOrganization();
  const role = useCurrentUserRole();
  const isOwnerOrAdmin = roleIsAtLeast(role, 'admin');

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
