import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BookkeepingEntity } from "@/components/bookkeeping/EntitySelector";
import { PayslipViewDialog } from "./PayslipViewDialog";
import { format } from "date-fns";
import { Search, Receipt, Eye } from "lucide-react";

interface PayslipsTabProps {
  selectedEntity: BookkeepingEntity | null;
  selectedSchemeId: string | null;
  taxYear: string;
}

export function PayslipsTab({ selectedEntity, selectedSchemeId, taxYear }: PayslipsTabProps) {
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);

  const { data: payslips, isLoading } = useQuery({
    queryKey: ["all-payslips", organization?.id, selectedEntity?.id, selectedSchemeId, taxYear],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from("payslips")
        .select(`
          *,
          employees (
            id,
            first_name,
            last_name,
            paye_scheme_id
          ),
          pay_runs (
            id,
            period_start,
            period_end,
            payment_date,
            tax_year,
            paye_scheme_id,
            paye_schemes (
              id,
              company_id,
              client_id
            )
          )
        `)
        .eq("organization_id", organization.id)
        .eq("tax_year", taxYear);

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      
      // Filter by entity or scheme
      if (selectedSchemeId) {
        return data?.filter(p => p.pay_runs?.paye_scheme_id === selectedSchemeId) || [];
      }
      
      if (selectedEntity) {
        return data?.filter(p => {
          const scheme = p.pay_runs?.paye_schemes as any;
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

  const filteredPayslips = payslips?.filter(p => {
    if (!searchTerm) return true;
    const fullName = `${p.employees?.first_name} ${p.employees?.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase());
  });

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
          <CardDescription>
            Browse all payslips for {taxYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {!filteredPayslips?.length ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Payslips</h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? "No payslips match your search."
                  : `No payslips found for ${taxYear}.`}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayslips.map((payslip) => {
                  const totalDeductions = (payslip.paye_tax || 0) + 
                    (payslip.employee_nic || 0) + 
                    (payslip.employee_pension || 0);

                  return (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-medium">
                        {payslip.employees?.first_name} {payslip.employees?.last_name}
                      </TableCell>
                      <TableCell>
                        {payslip.pay_runs?.period_start && payslip.pay_runs?.period_end ? (
                          <>
                            {format(new Date(payslip.pay_runs.period_start), "d MMM")} - {format(new Date(payslip.pay_runs.period_end), "d MMM")}
                          </>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {payslip.pay_runs?.payment_date 
                          ? format(new Date(payslip.pay_runs.payment_date), "d MMM yyyy") 
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        £{(payslip.gross_pay || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        £{totalDeductions.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedPayslipId && (
        <PayslipViewDialog
          payslipId={selectedPayslipId}
          open={!!selectedPayslipId}
          onOpenChange={(open) => !open && setSelectedPayslipId(null)}
        />
      )}
    </>
  );
}
