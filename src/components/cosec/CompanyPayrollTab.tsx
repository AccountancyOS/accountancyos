import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PayRunStatusBadge } from "@/components/payroll/PayRunStatusBadge";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ExternalLink, Plus, Users, Wallet } from "lucide-react";
import { type PayRunStatus, type PayFrequency, PAY_FREQUENCY_LABELS } from "@/lib/payroll-constants";

interface CompanyPayrollTabProps {
  companyId: string;
  organizationId: string;
}

export function CompanyPayrollTab({ companyId, organizationId }: CompanyPayrollTabProps) {
  const navigate = useNavigate();

  // Fetch PAYE schemes for this company
  const { data: payeSchemes, isLoading: schemesLoading } = useQuery({
    queryKey: ["company-paye-schemes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paye_schemes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent pay runs for this company's schemes
  const { data: recentPayRuns, isLoading: payRunsLoading } = useQuery({
    queryKey: ["company-recent-pay-runs", companyId],
    queryFn: async () => {
      if (!payeSchemes?.length) return [];
      const schemeIds = payeSchemes.map(s => s.id);
      const { data, error } = await supabase
        .from("pay_runs")
        .select(`
          *,
          paye_schemes (name, employer_paye_reference)
        `)
        .in("paye_scheme_id", schemeIds)
        .order("payment_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!payeSchemes?.length,
  });

  // Fetch employee count
  const { data: employeeCount } = useQuery({
    queryKey: ["company-employee-count", companyId],
    queryFn: async () => {
      if (!payeSchemes?.length) return 0;
      const schemeIds = payeSchemes.map(s => s.id);
      const { count, error } = await supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .in("paye_scheme_id", schemeIds)
        .eq("status", "active");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!payeSchemes?.length,
  });

  if (schemesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!payeSchemes?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No PAYE Scheme Configured</h3>
          <p className="text-muted-foreground mb-4">
            Set up a PAYE scheme to start running payroll for this company.
          </p>
          <Button onClick={() => navigate(`/payroll?entityType=company&entityId=${companyId}`)}>
            <Plus className="h-4 w-4 mr-2" />
            Set up Payroll
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">PAYE Schemes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{payeSchemes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{employeeCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Pay Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentPayRuns?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* PAYE Schemes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>PAYE Schemes</CardTitle>
            <CardDescription>Registered PAYE schemes for this company</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/payroll?entityType=company&entityId=${companyId}`}>
              View in Payroll
              <ExternalLink className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheme Name</TableHead>
                <TableHead>PAYE Reference</TableHead>
                <TableHead>Pay Frequency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payeSchemes.map((scheme) => (
                <TableRow key={scheme.id}>
                  <TableCell className="font-medium">{scheme.name}</TableCell>
                  <TableCell className="font-mono text-sm">{scheme.employer_paye_reference}</TableCell>
                  <TableCell>
                    {PAY_FREQUENCY_LABELS[scheme.default_pay_frequency as PayFrequency] || scheme.default_pay_frequency}
                  </TableCell>
                  <TableCell>
                    <Badge variant={scheme.is_active ? "default" : "secondary"}>
                      {scheme.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Pay Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Pay Runs</CardTitle>
            <CardDescription>Latest payroll activity for this company</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {payRunsLoading ? (
            <Skeleton className="h-[150px] w-full" />
          ) : !recentPayRuns?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto h-8 w-8 mb-2" />
              <p>No pay runs yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayRuns.map((payRun) => (
                  <TableRow key={payRun.id}>
                    <TableCell>
                      {format(new Date(payRun.payment_date), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {payRun.paye_schemes?.name || payRun.paye_schemes?.employer_paye_reference}
                    </TableCell>
                    <TableCell>
                      {format(new Date(payRun.period_start), "d MMM")} - {format(new Date(payRun.period_end), "d MMM")}
                    </TableCell>
                    <TableCell>
                      <PayRunStatusBadge status={payRun.status as PayRunStatus} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      £{(payRun.total_gross_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/payroll/pay-runs/${payRun.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
