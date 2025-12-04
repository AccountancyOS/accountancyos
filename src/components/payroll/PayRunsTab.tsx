import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { PayRunStatusBadge } from "./PayRunStatusBadge";
import { CreatePayRunDialog } from "./CreatePayRunDialog";
import { PAY_FREQUENCY_LABELS, type PayRunStatus, type PayFrequency } from "@/lib/payroll-constants";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Calendar } from "lucide-react";

interface PayRunsTabProps {
  selectedEntity: BookkeepingEntity | null;
  selectedSchemeId: string | null;
  taxYear: string;
}

export function PayRunsTab({ selectedEntity, selectedSchemeId, taxYear }: PayRunsTabProps) {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: payRuns, isLoading, refetch } = useQuery({
    queryKey: ["pay-runs", organization?.id, selectedEntity?.id, selectedSchemeId, taxYear, statusFilter],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("pay_runs")
        .select(`
          id,
          period_start,
          period_end,
          payment_date,
          pay_frequency,
          status,
          tax_year,
          total_gross_pay,
          total_net_pay,
          paye_scheme_id,
          paye_schemes (
            id,
            employer_paye_reference,
            company_id,
            client_id,
            companies (company_name),
            clients (first_name, last_name)
          )
        `)
        .eq("organization_id", organization.id)
        .eq("tax_year", taxYear);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (selectedSchemeId) {
        query = query.eq("paye_scheme_id", selectedSchemeId);
      }

      const { data, error } = await query.order("payment_date", { ascending: false });
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

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Pay Runs</CardTitle>
          <CardDescription>
            Manage payroll runs for {taxYear}
          </CardDescription>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Pay Run
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="calculated">Calculated</SelectItem>
              <SelectItem value="ready_for_review">Ready for Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!payRuns?.length ? (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Pay Runs</h3>
            <p className="text-muted-foreground mb-4">
              No pay runs found for {taxYear}. Create your first pay run.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Pay Run
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payRuns.map((payRun) => {
                const scheme = payRun.paye_schemes as any;
                const employerName = scheme?.companies?.company_name || 
                  (scheme?.clients ? `${scheme.clients.first_name} ${scheme.clients.last_name}` : '-');
                const frequency = payRun.pay_frequency as PayFrequency;

                return (
                  <TableRow 
                    key={payRun.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/payroll/pay-runs/${payRun.id}`)}
                  >
                    <TableCell className="font-medium">{employerName}</TableCell>
                    <TableCell>
                      {format(new Date(payRun.period_start), "d MMM")} - {format(new Date(payRun.period_end), "d MMM")}
                    </TableCell>
                    <TableCell>{format(new Date(payRun.payment_date), "d MMM yyyy")}</TableCell>
                    <TableCell>{PAY_FREQUENCY_LABELS[frequency] || frequency}</TableCell>
                    <TableCell>
                      <PayRunStatusBadge status={payRun.status as PayRunStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      £{(payRun.total_gross_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      £{(payRun.total_net_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreatePayRunDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          refetch();
          setShowCreateDialog(false);
        }}
        preSelectedSchemeId={selectedSchemeId}
        taxYear={taxYear}
      />
    </Card>
  );
}