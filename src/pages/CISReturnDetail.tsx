import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { SubmitCISReturnDialog } from "@/components/cis/SubmitCISReturnDialog";
import { 
  CIS_RETURN_STATUS_LABELS,
  CIS_DEDUCTION_RATE_LABELS,
  type CISReturnStatus,
  type CISDeductionRate
} from "@/lib/payroll-constants";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Send,
  FileText,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

const CISReturnDetail = () => {
  const { returnId } = useParams<{ returnId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // Fetch CIS return details
  const { data: cisReturn, isLoading } = useQuery({
    queryKey: ["cis-return-detail", returnId],
    queryFn: async () => {
      if (!returnId) return null;
      const { data, error } = await supabase
        .from("cis_returns")
        .select(`
          *,
          cis_contractors (
            id,
            name,
            contractor_utr,
            accounts_office_reference
          )
        `)
        .eq("id", returnId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!returnId,
  });

  // Fetch payments for this return
  const { data: payments } = useQuery({
    queryKey: ["cis-return-payments", returnId],
    queryFn: async () => {
      if (!returnId) return [];
      const { data, error } = await supabase
        .from("cis_payments")
        .select(`
          *,
          cis_subcontractors (
            id,
            first_name,
            last_name,
            business_name,
            trading_name,
            utr,
            deduction_rate
          )
        `)
        .eq("cis_return_id", returnId)
        .order("payment_date");
      if (error) throw error;
      return data;
    },
    enabled: !!returnId,
  });

  // Fetch related filing
  const { data: relatedFiling } = useQuery({
    queryKey: ["cis-return-filing", returnId],
    queryFn: async () => {
      if (!returnId) return null;
      const { data, error } = await supabase
        .from("filings")
        .select("*")
        .eq("filing_body", "HMRC")
        .eq("filing_type", "CIS_RETURN")
        .eq("metadata->>cis_return_id", returnId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!returnId,
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

  if (!cisReturn) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">CIS Return not found</h2>
          <Button variant="link" onClick={() => navigate("/cis")}>
            Return to CIS
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const status = cisReturn.status as CISReturnStatus;
  const canSubmit = status === 'draft' || status === 'ready';

  // Calculate totals
  const totals = payments?.reduce(
    (acc, p) => ({
      gross: acc.gross + (p.gross_amount || 0),
      materials: acc.materials + (p.materials_amount || 0),
      labour: acc.labour + (p.labour_amount || 0),
      deductions: acc.deductions + (p.deduction_amount || 0),
      net: acc.net + (p.net_amount || 0),
    }),
    { gross: 0, materials: 0, labour: 0, deductions: 0, net: 0 }
  ) || { gross: 0, materials: 0, labour: 0, deductions: 0, net: 0 };

  const getStatusBadge = (status: CISReturnStatus) => {
    const variants: Record<CISReturnStatus, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      ready: "outline",
      submitted: "default",
      accepted: "default",
      rejected: "destructive",
    };
    return <Badge variant={variants[status]}>{CIS_RETURN_STATUS_LABELS[status]}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/cis">CIS</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Return</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/cis")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground">
                  CIS Return - Tax Month {cisReturn.tax_month}
                </h1>
                {getStatusBadge(status)}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>Contractor: {cisReturn.cis_contractors?.name}</span>
                <span>Tax Year: {cisReturn.tax_year}</span>
                <span>Due: {format(new Date(cisReturn.due_date), "d MMM yyyy")}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {canSubmit && (
              <Button onClick={() => setShowSubmitDialog(true)}>
                <Send className="h-4 w-4 mr-2" />
                Submit CIS Return
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gross Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.gross.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Materials</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.materials.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Labour</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">£{totals.labour.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">£{totals.deductions.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">£{totals.net.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payments Included</CardTitle>
            <CardDescription>
              {payments?.length || 0} payments to subcontractors
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!payments?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No payments included in this return
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subcontractor</TableHead>
                    <TableHead>UTR</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Materials</TableHead>
                    <TableHead className="text-right">Deduction</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const subName = payment.cis_subcontractors?.business_name || 
                      payment.cis_subcontractors?.trading_name ||
                      `${payment.cis_subcontractors?.first_name} ${payment.cis_subcontractors?.last_name}`;
                    const deductionRate = (payment.cis_subcontractors?.deduction_rate || 'standard') as CISDeductionRate;
                    
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{subName}</TableCell>
                        <TableCell className="font-mono text-sm">{payment.cis_subcontractors?.utr || '-'}</TableCell>
                        <TableCell>{format(new Date(payment.payment_date), "d MMM yyyy")}</TableCell>
                        <TableCell>{CIS_DEDUCTION_RATE_LABELS[deductionRate]}</TableCell>
                        <TableCell className="text-right">
                          £{(payment.gross_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          £{(payment.materials_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          £{(payment.deduction_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          £{(payment.net_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Filing Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Filing Status
            </CardTitle>
            <CardDescription>
              HMRC submission status for this return
            </CardDescription>
          </CardHeader>
          <CardContent>
            {relatedFiling ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {relatedFiling.status === 'filed' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    )}
                    <span>Status: {relatedFiling.status}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/filings/${relatedFiling.id}`)}
                  >
                    View Filing
                  </Button>
                </div>
                {relatedFiling.filing_reference && (
                  <div className="text-sm text-muted-foreground">
                    Reference: <span className="font-mono">{relatedFiling.filing_reference}</span>
                  </div>
                )}
                {relatedFiling.filed_at && (
                  <div className="text-sm text-muted-foreground">
                    Submitted: {format(new Date(relatedFiling.filed_at), "d MMM yyyy HH:mm")}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                Not yet submitted to HMRC.
                {canSubmit && <p className="mt-2">Click "Submit CIS Return" to file with HMRC.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Declarations */}
        <Card>
          <CardHeader>
            <CardTitle>Declarations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cisReturn.employment_status_declaration || false}
                disabled
                className="h-4 w-4"
              />
              <span className="text-sm">
                I confirm that I have considered the employment status of all workers
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cisReturn.subcontractor_verification_declaration || false}
                disabled
                className="h-4 w-4"
              />
              <span className="text-sm">
                I confirm that all subcontractors have been verified with HMRC
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit Dialog */}
      {showSubmitDialog && cisReturn && organization && (
        <SubmitCISReturnDialog
          cisReturnId={cisReturn.id}
          contractorId={cisReturn.cis_contractor_id}
          organizationId={organization.id}
          open={showSubmitDialog}
          onOpenChange={setShowSubmitDialog}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["cis-return-detail", returnId] });
            queryClient.invalidateQueries({ queryKey: ["cis-return-filing", returnId] });
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default CISReturnDetail;
