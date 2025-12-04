import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Download } from "lucide-react";

interface PayslipViewDialogProps {
  payslipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayslipViewDialog({ payslipId, open, onOpenChange }: PayslipViewDialogProps) {
  const { data: payslip, isLoading } = useQuery({
    queryKey: ["payslip-detail", payslipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select(`*, employees (first_name, last_name, tax_code, nic_category), pay_runs (period_start, period_end, payment_date, tax_year)`)
        .eq("id", payslipId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!payslipId,
  });

  const totalDeductions = (payslip?.paye_tax || 0) + (payslip?.employee_nic || 0) + (payslip?.employee_pension || 0) + (payslip?.student_loan || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payslip</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-[300px]" />
        ) : payslip ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Employee</p>
                <p className="font-medium">{payslip.employees?.first_name} {payslip.employees?.last_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tax Code</p>
                <p className="font-medium">{payslip.employees?.tax_code || '1257L'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Period</p>
                <p className="font-medium">
                  {payslip.pay_runs?.period_start && format(new Date(payslip.pay_runs.period_start), "d MMM")} - {payslip.pay_runs?.period_end && format(new Date(payslip.pay_runs.period_end), "d MMM yyyy")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Payment Date</p>
                <p className="font-medium">{payslip.pay_runs?.payment_date && format(new Date(payslip.pay_runs.payment_date), "d MMM yyyy")}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between"><span>Gross Pay</span><span className="font-medium">£{(payslip.gross_pay || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>PAYE Tax</span><span>-£{(payslip.paye_tax || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Employee NIC</span><span>-£{(payslip.employee_nic || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Pension</span><span>-£{(payslip.employee_pension || 0).toFixed(2)}</span></div>
              {(payslip.student_loan || 0) > 0 && (
                <div className="flex justify-between text-muted-foreground"><span>Student Loan</span><span>-£{(payslip.student_loan || 0).toFixed(2)}</span></div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold"><span>Net Pay</span><span>£{(payslip.net_pay || 0).toFixed(2)}</span></div>
            </div>
            <Button variant="outline" className="w-full" disabled>
              <Download className="h-4 w-4 mr-2" />Download PDF
            </Button>
          </div>
        ) : (
          <p className="text-center py-8 text-muted-foreground">Payslip not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
