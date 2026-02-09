import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import { DeadlinesTable } from "@/components/deadlines/DeadlinesTable";
import { DeadlinesCalendar } from "@/components/deadlines/DeadlinesCalendar";
import { DeadlineFilters } from "@/components/deadlines/DeadlineFilters";
import { CreateDeadlineDialog } from "@/components/deadlines/CreateDeadlineDialog";

type DeadlineFilters = {
  search: string;
  clientId: string;
  deadlineType: string;
  filingBody: string;
  status: string;
  riskLevel: string;
  ownerId: string;
  timeHorizon: string;
};

const Deadlines = () => {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [filters, setFilters] = useState<DeadlineFilters>({
    search: "",
    clientId: "",
    deadlineType: "",
    filingBody: "",
    status: "",
    riskLevel: "",
    ownerId: "",
    timeHorizon: "all",
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Deadlines</h1>
            <p className="text-muted-foreground mt-1">
              Manage statutory and internal deadlines across your practice
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Deadline
          </Button>
        </div>

        <div className="flex gap-4 mb-4">
          <Button
            variant={filters.timeHorizon === "overdue" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters({ ...filters, timeHorizon: "overdue" })}
          >
            Overdue
          </Button>
          <Button
            variant={filters.timeHorizon === "this_week" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters({ ...filters, timeHorizon: "this_week" })}
          >
            This Week
          </Button>
          <Button
            variant={filters.timeHorizon === "this_month" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters({ ...filters, timeHorizon: "this_month" })}
          >
            This Month
          </Button>
          <Button
            variant={filters.riskLevel === "high" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setFilters({ ...filters, riskLevel: filters.riskLevel === "high" ? "" : "high" })}
          >
            High Risk
          </Button>
        </div>

        <div className="flex gap-6 flex-1 overflow-hidden">
          <DeadlineFilters filters={filters} onFiltersChange={setFilters} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar")} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mb-4">
                <TabsTrigger value="list">List View</TabsTrigger>
                <TabsTrigger value="calendar">Calendar View</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="flex-1 overflow-auto mt-0">
                <DeadlinesTable filters={filters} />
              </TabsContent>

              <TabsContent value="calendar" className="flex-1 overflow-auto mt-0">
                <DeadlinesCalendar filters={filters} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <CreateDeadlineDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default Deadlines;
