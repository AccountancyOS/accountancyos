import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { PayslipViewDialog } from "@/components/payroll/PayslipViewDialog";
import { SubmitRTIDialog } from "@/components/payroll/SubmitRTIDialog";
import { 
  PAY_RUN_STATUSES, 
  PAY_FREQUENCY_LABELS,
  type PayRunStatus,
  type PayFrequency 
} from "@/lib/payroll-constants";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Calculator,
  CheckCircle2,
  Send,
  FileText,
  BookOpen,
  AlertCircle,
  Eye
} from "lucide-react";

const PayRunDetail = () => {
  const { payRunId } = useParams<{ payRunId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [showRTIDialog, setShowRTIDialog] = useState(false);

  // Fetch pay run details
  const { data: payRun, isLoading } = useQuery({
    queryKey: ["pay-run-detail", payRunId],
    queryFn: async () => {
      if (!payRunId) return null;
      const { data, error } = await supabase
        .from("pay_runs")
        .select(`
          *,
          paye_schemes (
            id,
            name,
            employer_paye_reference,
            accounts_office_reference,
            company_id,
            client_id
          )
        `)
        .eq("id", payRunId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!payRunId,
  });

  // Fetch payslips for this pay run
  const { data: payslips, isLoading: payslipsLoading } = useQuery({
    queryKey: ["pay-run-payslips", payRunId],
    queryFn: async () => {
      if (!payRunId) return [];
      const { data, error } = await supabase
        .from("payslips")
        .select(`
          *,
          employees (
            id,
            first_name,
            last_name,
            tax_code,
            nic_category
          )
        `)
        .eq("pay_run_id", payRunId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!payRunId,
  });

  // Fetch RTI filings for this pay run
  const { data: rtiFilings } = useQuery({
    queryKey: ["pay-run-rti-filings", payRunId],
    queryFn: async () => {
      if (!payRunId) return [];
      const { data, error } = await supabase
        .from("filings")
        .select("*")
        .eq("filing_body", "HMRC")
        .in("filing_type", ["RTI_FPS", "RTI_EPS", "RTI_P45", "RTI_P46", "RTI_EYU"])
        .eq("metadata->>pay_run_id", payRunId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!payRunId,
  });

  // Calculate payslips mutation
  const calculateMutation = useMutation({
    mutationFn: async () => {
      // In production, this would call the payroll calculation engine
      // For now, update status to calculated
      const { error } = await supabase
        .from("pay_runs")
        .update({ 
          status: PAY_RUN_STATUSES.CALCULATED,
          updated_at: new Date().toISOString()
        })
        .eq("id", payRunId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-run-detail", payRunId] });
      queryClient.invalidateQueries({ queryKey: ["pay-run-payslips", payRunId] });
      toast.success("Payslips calculated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to calculate payslips");
    },
  });

  // Mark ready for review mutation
  const markReadyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pay_runs")
        .update({ 
          status: PAY_RUN_STATUSES.READY_FOR_REVIEW,
          updated_at: new Date().toISOString()
        })
        .eq("id", payRunId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-run-detail", payRunId] });
      toast.success("Pay run marked ready for review");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  // Approve pay run mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pay_runs")
        .update({ 
          status: PAY_RUN_STATUSES.APPROVED,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", payRunId);
      if (error) throw error;
      
      // TODO: Create payroll journal automatically here
      // This would call the bookkeeping journal creation service
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-run-detail", payRunId] });
      toast.success("Pay run approved and journal created");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to approve pay run");
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!payRun) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Pay run not found</h2>
          <Button variant="link" onClick={() => navigate("/payroll")}>
            Return to Payroll
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const status = payRun.status as PayRunStatus;
  const frequency = payRun.pay_frequency as PayFrequency;

  // Calculate totals from payslips
  const totals = payslips?.reduce(
    (acc, p) => ({
      gross: acc.gross + (p.gross_pay || 0),
      paye: acc.paye + (p.paye_tax || 0),
      employeeNic: acc.employeeNic + (p.employee_nic || 0),
      employerNic: acc.employerNic + (p.employer_nic || 0),
      studentLoan: acc.studentLoan + (p.student_loan || 0),
      pension: acc.pension + (p.employee_pension || 0),
      net: acc.net + (p.net_pay || 0),
    }),
    { gross: 0, paye: 0, employeeNic: 0, employerNic: 0, studentLoan: 0, pension: 0, net: 0 }
  ) || { gross: 0, paye: 0, employeeNic: 0, employerNic: 0, studentLoan: 0, pension: 0, net: 0 };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/payroll">Payroll</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pay Run</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/payroll")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground">
                  {payRun.paye_schemes?.employer_name || "Pay Run"}
                </h1>
                <PayRunStatusBadge status={status} />
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>
                  Period: {format(new Date(payRun.period_start), "d MMM")} - {format(new Date(payRun.period_end), "d MMM yyyy")}
                </span>
                <span>Payment Date: {format(new Date(payRun.payment_date), "d MMM yyyy")}</span>
                <span>{PAY_FREQUENCY_LABELS[frequency] || frequency}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {status === PAY_RUN_STATUSES.DRAFT && (
              <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending}>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate Payslips
              </Button>
            )}
            {status === PAY_RUN_STATUSES.CALCULATED && (
              <Button onClick={() => markReadyMutation.mutate()} disabled={markReadyMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Ready for Review
              </Button>
            )}
            {status === PAY_RUN_STATUSES.READY_FOR_REVIEW && (
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve Pay Run
              </Button>
            )}
            {status === PAY_RUN_STATUSES.APPROVED && (
              <Button onClick={() => setShowRTIDialog(true)}>
                <Send className="h-4 w-4 mr-2" />
                Submit FPS/EPS
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gross Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.gross.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">PAYE</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.paye.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employee NIC</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.employeeNic.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employer NIC</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.employerNic.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Student Loan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.studentLoan.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pension</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.pension.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">£{totals.net.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
        </div>

        {/* Payslips Table */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Payslips</CardTitle>
            <CardDescription>
              {payslips?.length || 0} employees included in this pay run
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payslipsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !payslips?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No payslips generated yet. Click "Calculate Payslips" to generate.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Tax Code</TableHead>
                    <TableHead>NI Cat</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">NIC</TableHead>
                    <TableHead className="text-right">Pension</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((payslip) => (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-medium">
                        {payslip.employees?.first_name} {payslip.employees?.last_name}
                      </TableCell>
                      <TableCell>{payslip.employees?.tax_code || '-'}</TableCell>
                      <TableCell>{payslip.employees?.ni_category || 'A'}</TableCell>
                      <TableCell className="text-right">
                        £{(payslip.gross_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        £{(payslip.paye_tax || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        £{(payslip.employee_nic || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        £{(payslip.pension_employee || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        £{(payslip.net_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPayslipId(payslip.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* RTI Status Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              RTI Submissions
            </CardTitle>
            <CardDescription>
              Real Time Information submissions for this pay run
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!rtiFilings?.length ? (
              <div className="text-center py-6 text-muted-foreground">
                No RTI submissions yet.
                {status === PAY_RUN_STATUSES.APPROVED && (
                  <p className="mt-2">Click "Submit FPS/EPS" to create and submit RTI filings.</p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rtiFilings.map((filing) => (
                    <TableRow key={filing.id}>
                      <TableCell className="font-medium">{filing.filing_type}</TableCell>
                      <TableCell>
                        <PayRunStatusBadge status={filing.status as PayRunStatus} />
                      </TableCell>
                      <TableCell>
                        {filing.filed_at ? format(new Date(filing.filed_at), "d MMM yyyy HH:mm") : '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {filing.filing_reference || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/filings/${filing.id}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Journal Status Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Payroll Journal
            </CardTitle>
            <CardDescription>
              Bookkeeping journal entry for this pay run
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payRun.journal_id ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Journal created</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/bookkeeping?journalId=${payRun.journal_id}`)}
                >
                  View Journal
                </Button>
              </div>
            ) : status === PAY_RUN_STATUSES.APPROVED || status === PAY_RUN_STATUSES.SUBMITTED ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-5 w-5" />
                  <span>Journal not created</span>
                </div>
                <Button variant="outline" size="sm">
                  Create Journal
                </Button>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                Journal will be created when pay run is approved.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      {selectedPayslipId && (
        <PayslipViewDialog
          payslipId={selectedPayslipId}
          open={!!selectedPayslipId}
          onOpenChange={(open) => !open && setSelectedPayslipId(null)}
        />
      )}

      {showRTIDialog && payRun && organization && (
        <SubmitRTIDialog
          payRunId={payRun.id}
          payeSchemeId={payRun.paye_scheme_id}
          organizationId={organization.id}
          open={showRTIDialog}
          onOpenChange={setShowRTIDialog}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["pay-run-detail", payRunId] });
            queryClient.invalidateQueries({ queryKey: ["pay-run-rti-filings", payRunId] });
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default PayRunDetail;
