import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PayslipViewDialog } from "@/components/payroll/PayslipViewDialog";
import { STUDENT_LOAN_LABELS, type StudentLoanPlan } from "@/lib/payroll-constants";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  User,
  FileText,
  Calendar,
  Gift,
  Eye
} from "lucide-react";

const EmployeeDetail = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);

  // Fetch employee details
  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee-detail", employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select(`
          *,
          paye_schemes (
            id,
            employer_name,
            paye_reference,
            company_id,
            client_id
          )
        `)
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });

  // Fetch payslips
  const { data: payslips } = useQuery({
    queryKey: ["employee-payslips", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("payslips")
        .select(`
          *,
          pay_runs (
            id,
            period_start,
            period_end,
            payment_date,
            tax_year
          )
        `)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });

  // Fetch absences
  const { data: absences } = useQuery({
    queryKey: ["employee-absences", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("employee_absences")
        .select("*")
        .eq("employee_id", employeeId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });

  // Fetch benefits
  const { data: benefits } = useQuery({
    queryKey: ["employee-benefits", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("employee_benefits")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
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

  if (!employee) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Employee not found</h2>
          <Button variant="link" onClick={() => navigate("/payroll")}>
            Return to Payroll
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const studentLoanPlan = (employee.student_loan_plan || 'none') as StudentLoanPlan;

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
              <BreadcrumbPage>
                {employee.first_name} {employee.last_name}
              </BreadcrumbPage>
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
                  {employee.first_name} {employee.last_name}
                </h1>
                <Badge variant={employee.is_active ? "default" : "secondary"}>
                  {employee.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>Employer: {employee.paye_schemes?.employer_name}</span>
                <span>Tax Code: {employee.tax_code || '1257L'}</span>
                <span>NI Category: {employee.ni_category || 'A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="payslips" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Payslips
            </TabsTrigger>
            <TabsTrigger value="absences" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Absences
            </TabsTrigger>
            <TabsTrigger value="benefits" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Benefits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personal Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Title</p>
                      <p className="font-medium">{employee.title || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date of Birth</p>
                      <p className="font-medium">
                        {employee.date_of_birth ? format(new Date(employee.date_of_birth), "d MMM yyyy") : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{employee.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{employee.phone || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">NI Number</p>
                      <p className="font-medium font-mono">{employee.national_insurance_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Gender</p>
                      <p className="font-medium capitalize">{employee.gender || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tax & NI */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tax & National Insurance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tax Code</p>
                      <p className="font-medium font-mono">{employee.tax_code || '1257L'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">NI Category</p>
                      <p className="font-medium">{employee.ni_category || 'A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Student Loan</p>
                      <p className="font-medium">{STUDENT_LOAN_LABELS[studentLoanPlan]}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Postgraduate Loan</p>
                      <p className="font-medium">{employee.has_postgraduate_loan ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Employment Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Employment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Start Date</p>
                      <p className="font-medium">
                        {employee.start_date ? format(new Date(employee.start_date), "d MMM yyyy") : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Leaving Date</p>
                      <p className="font-medium">
                        {employee.leaving_date ? format(new Date(employee.leaving_date), "d MMM yyyy") : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Payroll ID</p>
                      <p className="font-medium font-mono">{employee.payroll_id || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Is Director</p>
                      <p className="font-medium">{employee.is_director ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pension */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pension</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Employee Rate</p>
                      <p className="font-medium">{((employee.pension_employee_rate || 0.05) * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Employer Rate</p>
                      <p className="font-medium">{((employee.pension_employer_rate || 0.03) * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Portal Access */}
            {employee.portal_user_id && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Portal Access</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-600"></span>
                    <span>Portal access enabled</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="payslips" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Payslips</CardTitle>
                <CardDescription>
                  View all payslips for this employee
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!payslips?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No payslips found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Tax Year</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map((payslip) => (
                        <TableRow key={payslip.id}>
                          <TableCell>
                            {payslip.pay_runs?.period_start && payslip.pay_runs?.period_end ? (
                              <>
                                {format(new Date(payslip.pay_runs.period_start), "d MMM")} - {format(new Date(payslip.pay_runs.period_end), "d MMM")}
                              </>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {payslip.pay_runs?.payment_date ? format(new Date(payslip.pay_runs.payment_date), "d MMM yyyy") : '-'}
                          </TableCell>
                          <TableCell>{payslip.pay_runs?.tax_year || '-'}</TableCell>
                          <TableCell className="text-right">
                            £{(payslip.gross_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            £{((payslip.paye_tax || 0) + (payslip.employee_nic || 0) + (payslip.pension_employee || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
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
          </TabsContent>

          <TabsContent value="absences" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Absences</CardTitle>
                <CardDescription>
                  Track employee absences and statutory payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!absences?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No absences recorded
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absences.map((absence) => (
                        <TableRow key={absence.id}>
                          <TableCell className="capitalize">{absence.absence_type?.replace('_', ' ')}</TableCell>
                          <TableCell>{format(new Date(absence.start_date), "d MMM yyyy")}</TableCell>
                          <TableCell>
                            {absence.end_date ? format(new Date(absence.end_date), "d MMM yyyy") : 'Ongoing'}
                          </TableCell>
                          <TableCell>{absence.days_count || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {absence.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="benefits" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Benefits</CardTitle>
                <CardDescription>
                  Employee benefits in kind (P11D)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!benefits?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No benefits recorded
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Benefit Type</TableHead>
                        <TableHead>Tax Year</TableHead>
                        <TableHead className="text-right">Cash Value</TableHead>
                        <TableHead className="text-right">P11D Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benefits.map((benefit) => (
                        <TableRow key={benefit.id}>
                          <TableCell className="capitalize">{benefit.benefit_type?.replace('_', ' ')}</TableCell>
                          <TableCell>{benefit.tax_year}</TableCell>
                          <TableCell className="text-right">
                            £{(benefit.cash_value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            £{(benefit.p11d_value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={benefit.is_payrolled ? "default" : "secondary"}>
                              {benefit.is_payrolled ? "Payrolled" : "P11D"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Payslip Dialog */}
      {selectedPayslipId && (
        <PayslipViewDialog
          payslipId={selectedPayslipId}
          open={!!selectedPayslipId}
          onOpenChange={(open) => !open && setSelectedPayslipId(null)}
        />
      )}
    </DashboardLayout>
  );
};

export default EmployeeDetail;
