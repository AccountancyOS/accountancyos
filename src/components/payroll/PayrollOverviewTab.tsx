import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { format } from "date-fns";
import { formatStatus } from "@/lib/format-utils";
import { Users, Calendar, FileText, AlertTriangle, ArrowRight } from "lucide-react";

interface PayrollOverviewTabProps {
  selectedEntity: BookkeepingEntity | null;
  selectedSchemeId: string | null;
  taxYear: string;
  onNavigate: (tab: string) => void;
}

export function PayrollOverviewTab({ 
  selectedEntity, 
  selectedSchemeId, 
  taxYear,
  onNavigate 
}: PayrollOverviewTabProps) {
  const { organization } = useOrganization();

  // Fetch employee count
  const { data: employeeCount, isLoading: loadingEmployees } = useQuery({
    queryKey: ["payroll-employee-count", organization?.id, selectedEntity?.id, selectedSchemeId],
    queryFn: async () => {
      if (!organization?.id) return 0;
      
      let query = supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "active");

      if (selectedSchemeId) {
        query = query.eq("paye_scheme_id", selectedSchemeId);
      } else if (selectedEntity) {
        const { data: schemes } = await supabase
          .from("paye_schemes")
          .select("id")
          .eq("organization_id", organization.id)
          .eq(selectedEntity.type === "company" ? "company_id" : "client_id", selectedEntity.id);
        
        if (schemes?.length) {
          query = query.in("paye_scheme_id", schemes.map(s => s.id));
        }
      }

      const { count } = await query;
      return count || 0;
    },
    enabled: !!organization?.id,
  });

  // Fetch recent pay runs
  const { data: recentPayRuns, isLoading: loadingPayRuns } = useQuery({
    queryKey: ["payroll-recent-pay-runs", organization?.id, selectedEntity?.id, selectedSchemeId, taxYear],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("pay_runs")
        .select(`
          id,
          period_start,
          period_end,
          payment_date,
          status,
          tax_year,
          total_gross_pay,
          total_net_pay,
          paye_scheme_id,
          paye_schemes (id, employer_paye_reference, company_id, client_id)
        `)
        .eq("organization_id", organization.id)
        .eq("tax_year", taxYear)
        .order("payment_date", { ascending: false })
        .limit(5);

      if (selectedSchemeId) {
        query = query.eq("paye_scheme_id", selectedSchemeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter by entity if needed
      if (selectedEntity && !selectedSchemeId) {
        return data?.filter(pr => {
          const scheme = pr.paye_schemes as any;
          if (selectedEntity.type === "company") {
            return scheme?.company_id === selectedEntity.id;
          }
          return scheme?.client_id === selectedEntity.id;
        }) || [];
      }
      
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Fetch pending RTI count
  const { data: pendingRTICount } = useQuery({
    queryKey: ["payroll-pending-rti", organization?.id, selectedEntity?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      
      const { count } = await supabase
        .from("filings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("filing_body", "HMRC")
        .in("filing_type", ["RTI_FPS", "RTI_EPS"])
        .in("status", ["draft", "in_progress", "awaiting_approval"]);

      return count || 0;
    },
    enabled: !!organization?.id,
  });

  const isLoading = loadingEmployees || loadingPayRuns;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onNavigate("employees")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{employeeCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click to view all employees
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onNavigate("pay-runs")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pay Runs ({taxYear})</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentPayRuns?.length || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">
              This tax year
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onNavigate("rti-submissions")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending RTI</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingRTICount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Submissions to complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Next Pay Date</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">-</p>
            <p className="text-xs text-muted-foreground mt-1">
              No upcoming pay runs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Pay Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Pay Runs</CardTitle>
            <CardDescription>Latest pay runs for {taxYear}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate("pay-runs")}>
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {!recentPayRuns?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No pay runs found for this tax year
            </div>
          ) : (
            <div className="space-y-4">
              {recentPayRuns.map((payRun) => (
                <div
                  key={payRun.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => window.location.href = `/payroll/pay-runs/${payRun.id}`}
                >
                  <div>
                    <p className="font-medium">
                      {format(new Date(payRun.period_start), "d MMM")} - {format(new Date(payRun.period_end), "d MMM yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Payment: {format(new Date(payRun.payment_date), "d MMM yyyy")}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      payRun.status === 'submitted' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      payRun.status === 'approved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {formatStatus(payRun.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onNavigate("pay-runs")}>
            Create Pay Run
          </Button>
          <Button variant="outline" onClick={() => onNavigate("employees")}>
            Add Employee
          </Button>
          <Button variant="outline" onClick={() => onNavigate("paye-schemes")}>
            Manage PAYE Schemes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}