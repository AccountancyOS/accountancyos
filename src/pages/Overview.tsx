import DashboardLayout from "@/components/DashboardLayout";
import { useOrganization } from "@/lib/organization-context";
import { DashboardKPICards } from "@/components/dashboard/DashboardKPICards";
import { AutomationActivityFeed } from "@/components/dashboard/AutomationActivityFeed";
import { DeadlineWidget } from "@/components/dashboard/DeadlineWidget";
import { JobPipelineChart } from "@/components/dashboard/JobPipelineChart";

const Overview = () => {
  const { organization } = useOrganization();

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              Here's what's happening with {organization?.name || "your practice"} today.
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
              <JobPipelineChart />
              <DeadlineWidget />
            </div>

            {/* Right Column */}
            <div>
              <AutomationActivityFeed />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Overview;
